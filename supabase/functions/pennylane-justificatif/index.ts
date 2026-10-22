// Edge Function `pennylane-justificatif` — envoie un justificatif VALIDÉ (ticket / dépense d'un salarié) dans la
// liste « à traiter » de Pennylane : le fichier est déposé (POST /file_attachments) puis importé comme facture
// fournisseur (POST /supplier_invoices/import). Pennylane crée ensuite la charge côté site via la synchro habituelle.
//
// POST { ticket_id: string } → { ok: true, data: { pennylane_id } } | { ok: false, error, status?, body? }
// Droit : président ou finance.charges / update. Idempotent : un ticket déjà envoyé n'est pas renvoyé
// (sauf `forcer: true`). L'échec est gardé sur le ticket (`pennylane_erreur`) et affiché au bureau.
// Le token n'est ni loggué ni renvoyé.
import { jsonResponse, optionsResponse } from '../_shared/cors.ts';
import { PENNYLANE_BASE, pennylaneHeaders, pennylaneToken } from '../_shared/pennylaneBase.ts';
import { getServiceClient } from '../_shared/supabase.ts';
import { exigerPermission } from '../_shared/auth.ts';

const BUCKET = 'documents';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse();

  let ticketId = '';
  let forcer = false;
  try {
    const b = await req.json();
    ticketId = typeof b?.ticket_id === 'string' ? b.ticket_id : '';
    forcer = b?.forcer === true;
  } catch {
    return jsonResponse({ ok: false, error: 'invalid JSON body' }, 400);
  }
  if (!ticketId) return jsonResponse({ ok: false, error: 'ticket_id requis' }, 400);

  const service = getServiceClient();
  const acces = await exigerPermission(req, service, 'finance.charges', 'update');
  if (!acces.ok) return acces.response;

  const { data: ticket } = await service
    .from('receipts_inbox')
    .select('id, company_id, statut, storage_path, file_name, mime_type, montant_ttc_cts, pennylane_envoye_le')
    .eq('id', ticketId).maybeSingle();
  if (!ticket || ticket.company_id !== acces.companyId) return jsonResponse({ ok: false, error: 'Justificatif introuvable' }, 404);
  if (ticket.statut !== 'traite') return jsonResponse({ ok: false, error: 'Le justificatif doit être validé avant l’envoi à Pennylane.' }, 400);
  if (ticket.pennylane_envoye_le && !forcer) return jsonResponse({ ok: true, data: { deja_envoye: true } });

  let token: string;
  try { token = pennylaneToken(); }
  catch { return jsonResponse({ ok: false, error: 'PENNYLANE_API_TOKEN manquant' }, 500); }

  const echec = async (error: string, status?: number, body?: unknown) => {
    const detail = typeof body === 'string' ? body : JSON.stringify(body ?? null);
    await service.from('receipts_inbox')
      .update({ pennylane_erreur: `${error}${status ? ` (${status})` : ''} ${detail}`.slice(0, 900) })
      .eq('id', ticket.id);
    return jsonResponse({ ok: false, error, status, body });
  };

  // 1) Le fichier, depuis le stockage.
  const { data: blob, error: dlErr } = await service.storage.from(BUCKET).download(ticket.storage_path);
  if (dlErr || !blob) return await echec('Fichier du justificatif introuvable dans le stockage.');

  // 2) Dépôt du fichier chez Pennylane.
  const form = new FormData();
  form.append('file', new Blob([await blob.arrayBuffer()], { type: ticket.mime_type || 'application/octet-stream' }), ticket.file_name || 'justificatif');
  const up = await fetch(`${PENNYLANE_BASE}/file_attachments`, { method: 'POST', headers: pennylaneHeaders(token), body: form });
  const upBody = await up.json().catch(() => null) as Record<string, unknown> | null;
  if (!up.ok || !upBody?.id) return await echec('Pennylane a refusé le fichier.', up.status, upBody);

  // 3) Import comme facture fournisseur « à traiter ».
  const imp = await fetch(`${PENNYLANE_BASE}/supplier_invoices/import`, {
    method: 'POST',
    headers: { ...pennylaneHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_attachment_id: upBody.id }),
  });
  const impBody = await imp.json().catch(() => null) as Record<string, unknown> | null;
  if (!imp.ok) return await echec('Pennylane a refusé l’import de la facture.', imp.status, impBody);

  const pennylaneId = impBody?.id != null ? String(impBody.id) : null;
  await service.from('receipts_inbox')
    .update({ pennylane_envoye_le: new Date().toISOString(), pennylane_id: pennylaneId, pennylane_erreur: null })
    .eq('id', ticket.id);
  return jsonResponse({ ok: true, data: { pennylane_id: pennylaneId } });
});
