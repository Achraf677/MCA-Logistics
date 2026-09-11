// Edge `drive-migrate-to-storage` — TEMPORAIRE, à supprimer une fois la migration finie.
//
// Rapatrie les justificatifs restés dans Google Drive vers le bucket Supabase
// `documents`, puis renseigne `storage_path`. Ne supprime RIEN côté Drive :
// l'original reste en place, on en fait une copie. Rejouable sans risque —
// seules les lignes sans `storage_path` sont traitées.
//
// PRÉ-REQUIS : une connexion Drive active (table `google_drive_tokens`). Si elle
// a été révoquée, la migration est impossible : Google exige un jeton pour
// télécharger, et un `webViewLink` n'est pas un lien de téléchargement public.
//
// Réservé au président. Traite `batch` documents par appel (défaut 10) pour ne
// pas dépasser le temps d'exécution ; rappeler jusqu'à `restants: 0`.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

async function getAccessToken(refreshToken: string): Promise<string> {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: Deno.env.get('GOOGLE_OAUTH_CLIENT_ID')!,
      client_secret: Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET')!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }).toString(),
  });
  if (!r.ok) throw new Error('refresh_failed');
  const j = await r.json();
  if (!j.access_token) throw new Error('no_access_token');
  return j.access_token as string;
}

function chemin(companyId: string, docId: string, fileName: string): string {
  const propre = (fileName || 'fichier')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(-80);
  return `${companyId}/${docId}-${propre}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader) return json({ ok: false, error: 'missing Authorization' }, 401);

  let batch = 10;
  try {
    const b = await req.json();
    if (typeof b?.batch === 'number' && b.batch > 0 && b.batch <= 25) batch = b.batch;
  } catch { /* valeur par défaut */ }

  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const svcKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: { user }, error: uErr } = await userClient.auth.getUser();
  if (uErr || !user) return json({ ok: false, error: 'invalid session' }, 401);

  const service = createClient(url, svcKey, { auth: { persistSession: false } });
  const { data: profile } = await service
    .from('profiles').select('company_id, role').eq('id', user.id).single();
  if (!profile?.company_id) return json({ ok: false, error: 'société introuvable' }, 400);
  if (profile.role !== 'president') {
    return json({ ok: false, error: 'reserve_president', message: 'Seul le président peut lancer le rapatriement.' });
  }
  const companyId = profile.company_id as string;

  const { data: tok } = await service
    .from('google_drive_tokens').select('refresh_token').eq('company_id', companyId).maybeSingle();
  // NOTE SUR LE CODE HTTP : les refus PREVISIBLES repondent 200 avec
  // `ok: false`, pas 409. Raison : `supabase.functions.invoke` transforme tout
  // code non-2xx en erreur generique cote navigateur et jette le corps de la
  // reponse — donc le message explicatif ci-dessous n'arrivait jamais jusqu'a
  // l'utilisateur, qui ne voyait qu'« erreur ». Meme choix que `assistant-chat`.
  if (!tok?.refresh_token) {
    return json({
      ok: false,
      error: 'drive_non_connecte',
      message: 'Aucune connexion Google Drive enregistrée. Reconnecte Drive dans Paramètres le '
        + 'temps de la migration : sans jeton, Google refuse le téléchargement des fichiers.',
    });
  }

  let accessToken: string;
  try { accessToken = await getAccessToken(tok.refresh_token); }
  catch (e) {
    return json({
      ok: false,
      error: 'refresh_failed',
      message: 'Google a refusé de renouveler l\'accès à Drive (' + (e as Error).message + '). '
        + 'Le plus souvent : l\'autorisation a été révoquée depuis le compte Google. '
        + 'Va dans Paramètres, déconnecte puis reconnecte Google Drive, et relance le rapatriement.',
    });
  }

  const { data: docs } = await service
    .from('documents')
    .select('id, file_name, mime_type, drive_file_id')
    .eq('company_id', companyId)
    .is('storage_path', null)
    .not('drive_file_id', 'is', null)
    .order('created_at')
    .limit(batch);

  const migres: string[] = [];
  const echecs: Array<{ nom: string; raison: string }> = [];

  for (const doc of docs ?? []) {
    try {
      const dl = await fetch(
        `https://www.googleapis.com/drive/v3/files/${doc.drive_file_id}?alt=media&supportsAllDrives=true`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!dl.ok) { echecs.push({ nom: doc.file_name ?? doc.id, raison: `drive_${dl.status}` }); continue; }

      const bytes = new Uint8Array(await dl.arrayBuffer());
      const path = chemin(companyId, doc.id, doc.file_name ?? '');

      const { error: upErr } = await service.storage.from('documents').upload(path, bytes, {
        contentType: doc.mime_type ?? 'application/octet-stream',
        upsert: true,
      });
      if (upErr) { echecs.push({ nom: doc.file_name ?? doc.id, raison: `stockage : ${upErr.message}` }); continue; }

      // `drive_file_id` / `drive_link` sont conservés : tant que la migration
      // n'est pas verifiee de bout en bout, on ne detruit aucun pointeur.
      const { error: updErr } = await service
        .from('documents')
        .update({ storage_path: path, size_bytes: bytes.byteLength })
        .eq('id', doc.id);
      if (updErr) { echecs.push({ nom: doc.file_name ?? doc.id, raison: `base : ${updErr.message}` }); continue; }

      migres.push(doc.file_name ?? doc.id);
    } catch (e) {
      echecs.push({ nom: doc.file_name ?? doc.id, raison: (e as Error).message });
    }
  }

  const { count: restants } = await service
    .from('documents')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .is('storage_path', null)
    .not('drive_file_id', 'is', null);

  return json({ ok: true, migres: migres.length, noms: migres, echecs, restants: restants ?? 0 });
});
