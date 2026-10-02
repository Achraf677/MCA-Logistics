// Edge Function `pennylane-file`
// POST { pennylane_id: string } → { ok: true, url: string }
// Récupère l'URL fraîche du PDF d'une facture FOURNISSEUR Pennylane.
// public_file_url est une URL signée à durée limitée — ne jamais utiliser la version stockée.
// Le token n'est ni loggué ni renvoyé au client.
import { jsonResponse, optionsResponse } from '../_shared/cors.ts';
import { PENNYLANE_BASE, pennylaneToken, pennylaneHeaders } from '../_shared/pennylane.ts';
import { getServiceClient } from '../_shared/supabase.ts';
import { exigerPermission } from '../_shared/auth.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse();

  let pennylane_id: string;
  try {
    const body = await req.json();
    pennylane_id = body?.pennylane_id ?? '';
  } catch {
    return jsonResponse({ ok: false, error: 'invalid JSON body' }, 400);
  }

  if (!pennylane_id) {
    return jsonResponse({ ok: false, error: 'pennylane_id requis' }, 400);
  }

  // Contrôle d'accès (U1) : voir une charge (Charges, Carburant ou Entretiens),
  // et seulement une facture fournisseur rattachée à une charge de SA société.
  const supabase = getServiceClient();
  let acces = await exigerPermission(req, supabase, 'finance.charges', 'view');
  // 403 seulement (401 = session absente : inutile d'essayer d'autres droits).
  if (!acces.ok && acces.response.status === 403) {
    for (const res of ['flotte.carburant', 'flotte.entretiens']) {
      const essai = await exigerPermission(req, supabase, res, 'view');
      if (essai.ok) { acces = essai; break }
    }
  }
  if (!acces.ok) return acces.response;
  const { data: charge } = await supabase
    .from('charges').select('id')
    .eq('company_id', acces.companyId).eq('pennylane_id', pennylane_id)
    .limit(1).maybeSingle();
  if (!charge) return jsonResponse({ ok: false, error: 'Facture inconnue pour cette société' }, 404);

  let token: string;
  try { token = pennylaneToken(); }
  catch { return jsonResponse({ ok: false, error: 'PENNYLANE_API_TOKEN manquant' }, 500); }

  const res = await fetch(
    `${PENNYLANE_BASE}/supplier_invoices/${pennylane_id}`,
    { headers: pennylaneHeaders(token) },
  );

  if (!res.ok) {
    return jsonResponse({ ok: false, error: `Pennylane ${res.status}` }, 502);
  }

  const data = await res.json() as Record<string, unknown>;
  // L'API V2 retourne les champs à la racine (pas de wrapper supplier_invoice)
  const url = (data.public_file_url ?? null) as string | null;

  if (!url) {
    return jsonResponse({ ok: false, error: 'Aucun fichier PDF disponible pour cette facture' }, 404);
  }

  return jsonResponse({ ok: true, url });
});
