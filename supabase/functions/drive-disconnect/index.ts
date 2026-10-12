// Edge `drive-disconnect` — révoque le refresh_token chez Google puis supprime la
// ligne google_drive_tokens de la société. verify_jwt = true, company_id dérivé du JWT.
// Le refresh_token n'est jamais renvoyé au client.
import { jsonResponse, optionsResponse } from '../_shared/cors.ts';
import { getServiceClient } from '../_shared/supabase.ts';
import { exigerPermission } from '../_shared/auth.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return optionsResponse();

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader) return jsonResponse({ ok: false, error: 'missing Authorization' }, 401);

  // Déconnecter le Drive de la société = un réglage : président ou
  // `systeme.parametres : update` (un chauffeur ne coupe pas le Drive de tous).
  const service = getServiceClient();
  const acces = await exigerPermission(req, service, 'systeme.parametres', 'update');
  if (!acces.ok) return acces.response;
  const profile = { company_id: acces.companyId };

  const { data: tok } = await service
    .from('google_drive_tokens')
    .select('refresh_token')
    .eq('company_id', profile.company_id)
    .maybeSingle();

  if (!tok) return jsonResponse({ ok: true, already_disconnected: true });

  // Révocation côté Google : best-effort. Si elle échoue (token déjà révoqué,
  // Google injoignable), on supprime quand même la ligne — sinon l'utilisateur
  // resterait bloqué sur un Drive qu'il ne peut plus déconnecter.
  let revoked = false;
  try {
    const res = await fetch('https://oauth2.googleapis.com/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: tok.refresh_token }),
    });
    revoked = res.ok;
  } catch { /* révocation best-effort */ }

  const { error: delErr } = await service
    .from('google_drive_tokens')
    .delete()
    .eq('company_id', profile.company_id);

  if (delErr) return jsonResponse({ ok: false, error: delErr.message }, 500);

  return jsonResponse({ ok: true, revoked });
});
