// Edge Function `pennylane-file`
// POST { pennylane_id: string } → { ok: true, url: string }
// Récupère l'URL fraîche du PDF d'une facture FOURNISSEUR Pennylane.
// public_file_url est une URL signée à durée limitée — ne jamais utiliser la version stockée.
// Le token n'est ni loggué ni renvoyé au client.
import { jsonResponse, optionsResponse } from '../_shared/cors.ts';
import { PENNYLANE_BASE, pennylaneToken, pennylaneHeaders } from '../_shared/pennylane.ts';

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
