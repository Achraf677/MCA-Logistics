// Edge Function `pennylane-justificatif` — envoie un justificatif VALIDÉ (ticket / dépense d'un salarié) à
// l'adresse de dépôt Pennylane de la société (`companies.pennylane_depot_email`), par mail, fichier en pièce jointe :
// il arrive dans « À traiter » de la compta et Pennylane lit lui-même montant, TVA et fournisseur.
// (L'API d'import de factures fournisseur rangeait le document côté gestion seulement : abandonnée le 23/10/2026.)
//
// POST { ticket_id, forcer? } → { ok: true, data: { to } } | { ok: false, error }
// Droit : président ou finance.charges / update. Idempotent (`pennylane_envoye_le`), sauf `forcer: true`.
// Canal : Gmail API du compte Google connecté (Paramètres › Gmail, scope gmail.send).
import { jsonResponse, optionsResponse } from '../_shared/cors.ts';
import { getServiceClient } from '../_shared/supabase.ts';
import { exigerPermission } from '../_shared/auth.ts';
import { construireMime, enBase64, envoyerMail, tokenGoogle } from '../_shared/gmail.ts';

const BUCKET = 'documents';
const euros = (cts: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(cts / 100);

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
    .select('id, company_id, statut, storage_path, file_name, mime_type, montant_ttc_cts, date_depense, created_at, note, pennylane_envoye_le')
    .eq('id', ticketId).maybeSingle();
  if (!ticket || ticket.company_id !== acces.companyId) return jsonResponse({ ok: false, error: 'Justificatif introuvable' }, 404);
  if (ticket.statut !== 'traite') return jsonResponse({ ok: false, error: 'Le justificatif doit être validé avant l’envoi à Pennylane.' }, 400);
  if (ticket.pennylane_envoye_le && !forcer) return jsonResponse({ ok: true, data: { deja_envoye: true } });

  const echec = async (error: string, status = 400) => {
    await service.from('receipts_inbox').update({ pennylane_erreur: error.slice(0, 1000) }).eq('id', ticket.id);
    return jsonResponse({ ok: false, error }, status);
  };

  const { data: societe } = await service.from('companies').select('pennylane_depot_email').eq('id', acces.companyId).maybeSingle();
  const to = (societe?.pennylane_depot_email ?? '').trim();
  if (!to) return await echec('Adresse de dépôt Pennylane non renseignée (Pennylane › Paramètres › Transmission des factures).');

  const { data: gtok } = await service.from('google_drive_tokens').select('refresh_token').eq('company_id', acces.companyId).maybeSingle();
  if (!gtok?.refresh_token) return await echec('Gmail non connecté : connecte-le dans Paramètres.');
  let acces_google: string;
  try { acces_google = await tokenGoogle(gtok.refresh_token); }
  catch { return await echec('Connexion Gmail échouée : reconnecte-le dans Paramètres.', 502); }

  const { data: blob, error: dlErr } = await service.storage.from(BUCKET).download(ticket.storage_path);
  if (dlErr || !blob) return await echec('Fichier du justificatif introuvable dans le stockage.');

  const jour = (ticket.date_depense ?? ticket.created_at).slice(0, 10);
  const sujet = `Note de frais ${jour}${ticket.montant_ttc_cts ? ` — ${euros(ticket.montant_ttc_cts)}` : ''}`;
  const corps = [
    'Justificatif envoyé depuis le site MCA Logistics.', '',
    `Date : ${jour}`,
    ticket.montant_ttc_cts ? `Montant TTC : ${euros(ticket.montant_ttc_cts)}` : '',
    ticket.note ? `Note : ${ticket.note}` : '',
  ].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n');
  const raw = construireMime(to, sujet, corps, [{
    filename: ticket.file_name || 'justificatif',
    mime: ticket.mime_type || 'application/octet-stream',
    base64: enBase64(new Uint8Array(await blob.arrayBuffer())),
  }]);

  const rep = await envoyerMail(acces_google, raw);
  if (!rep.ok) {
    // Le motif donné par Google (API Gmail non activée, droit refusé…) est la seule façon de savoir quoi corriger.
    const detail = (await rep.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 400);
    return await echec(`Envoi du mail échoué (${rep.status}) : ${detail}`, 502);
  }

  await service.from('receipts_inbox')
    .update({ pennylane_envoye_le: new Date().toISOString(), pennylane_id: null, pennylane_erreur: null })
    .eq('id', ticket.id);
  return jsonResponse({ ok: true, data: { to } });
});
