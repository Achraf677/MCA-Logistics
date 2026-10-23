import imageCompression from 'browser-image-compression'
import { supabase } from '../../app/providers'
import { lireErreurEdge } from './erreurEdge'

const BUCKET = 'documents'
const MAX_BYTES = 20 * 1024 * 1024

export type StatutTicket = 'a_traiter' | 'traite' | 'ignore'

export interface TicketInbox {
  id: string
  company_id: string
  uploaded_by: string | null
  storage_path: string
  file_name: string
  mime_type: string | null
  size_bytes: number | null
  note: string | null
  statut: StatutTicket
  charge_id: string | null
  traite_at: string | null
  created_at: string
  /** Dépense (lot S1, migration 20261012110000) : montant, catégorie, moyen, date, refus. */
  montant_ttc_cts?: number | null
  categorie?: string | null
  moyen_paiement?: string | null
  date_depense?: string | null
  motif_refus?: string | null
  /** Note de frais remboursée le (migration 20261022130000). */
  rembourse_le?: string | null
  /** Envoi du justificatif validé vers Pennylane (migration 20261022140000). */
  pennylane_envoye_le?: string | null
  pennylane_id?: string | null
  pennylane_erreur?: string | null
  /** Ce que Pennylane exige pour l'import : fournisseur du site (qui porte le n° Pennylane) et taux de TVA (%). */
  supplier_id?: string | null
  tva_rate?: number | null
  /** Lecture IA du ticket (Edge `lire-ticket`, migration 20261023110000) : ce qui a été lu et prérempli. */
  ocr_lecture?: LectureTicketIa | null
  ocr_lu_le?: string | null
}

export interface LectureTicketIa {
  lu?: { fournisseur: string | null; date: string | null; total_ttc_cts: number | null; taux_tva: number | null; categorie: string | null } | null
  rempli?: string[]
  raison?: string
}

/** Détails d'une dépense déclarée avec son justificatif. */
export interface DetailsDepense {
  montant_ttc_cts: number | null
  categorie: string | null
  moyen_paiement: string | null
  date_depense: string | null
}

/**
 * Chemin de stockage : même préfixe `<company_id>/…` que les autres documents,
 * pour que les policies du bucket s'appliquent sans rien ajouter. Le
 * sous-dossier `tickets/` sert seulement à s'y retrouver dans le bucket.
 */
function cheminTicket(companyId: string, fileName: string): string {
  const propre = (fileName || 'ticket')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(-60)
  return `${companyId}/tickets/${crypto.randomUUID()}-${propre}`
}

/**
 * Dépose un ticket photographié. Compressé avant envoi : une photo de ticket
 * prise au téléphone pèse plusieurs mégaoctets pour rien, et le chauffeur est
 * souvent en 4G au bord de la route.
 */
export async function deposerTicket(
  file: File,
  companyId: string,
  note?: string,
  details?: DetailsDepense,
): Promise<{ data: TicketInbox | null; error: Error | null }> {
  if (file.size > MAX_BYTES) {
    return { data: null, error: new Error('Fichier trop volumineux (limite 20 Mo)') }
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: null, error: new Error('Session expirée') }

  let aEnvoyer: File = file
  if (file.type.startsWith('image/')) {
    try {
      aEnvoyer = await imageCompression(file, {
        maxSizeMB: 1, maxWidthOrHeight: 1920, initialQuality: 0.8, useWebWorker: true,
      })
    } catch { /* compression échouée → fichier original, jamais de blocage */ }
  }

  const path = cheminTicket(companyId, file.name)
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, aEnvoyer, {
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  })
  if (upErr) return { data: null, error: new Error(upErr.message) }

  const { data, error } = await supabase
    .from('receipts_inbox')
    .insert({
      company_id:   companyId,
      uploaded_by:  user.id,
      storage_path: path,
      file_name:    file.name,
      mime_type:    file.type || null,
      size_bytes:   aEnvoyer.size,
      note:         note?.trim() || null,
      ...(details ?? {}),
    })
    .select()
    .single()

  if (error) {
    // Rollback : un fichier sans ligne d'index serait invisible et impossible
    // à retrouver autrement qu'en fouillant le bucket.
    await supabase.storage.from(BUCKET).remove([path])
    return { data: null, error: new Error(error.message) }
  }

  return { data: data as TicketInbox, error: null }
}

/** Tickets en attente, plus récents d'abord. RLS : gestion uniquement. */
export async function listerTicketsATraiter() {
  return supabase
    .from('receipts_inbox')
    .select('*')
    .eq('statut', 'a_traiter')
    .order('created_at', { ascending: false })
    .returns<TicketInbox[]>()
}

/** Tous les justificatifs, quel que soit leur statut (onglet Justificatifs), plus récents d'abord. */
export async function listerTickets(limite = 500) {
  return supabase
    .from('receipts_inbox')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limite)
    .returns<TicketInbox[]>()
}

/** Le bureau corrige une dépense (ancien ticket sans montant, mauvaise date…). */
export async function corrigerTicket(id: string, maj: Partial<DetailsDepense> & { note?: string | null; supplier_id?: string | null; tva_rate?: number | null }) {
  const { data, error } = await supabase.from('receipts_inbox').update(maj).eq('id', id).select('id')
  if (error) return { error: new Error(error.message) }
  if (!data || data.length === 0) return { error: new Error('Correction refusée : droit insuffisant.') }
  return { error: null }
}

/** Note de frais remboursée (`date`) ou remise à « à rembourser » (`null`). */
export async function marquerRembourse(id: string, date: string | null) {
  const { data, error } = await supabase.from('receipts_inbox').update({ rembourse_le: date }).eq('id', id).select('id')
  if (error) return { error: new Error(error.message) }
  if (!data || data.length === 0) return { error: new Error('Enregistrement refusé : droit insuffisant.') }
  return { error: null }
}

/** Compteur pour la pastille de notification. `head: true` = aucune ligne transférée. */
export async function compterTicketsATraiter(): Promise<number> {
  const { count } = await supabase
    .from('receipts_inbox')
    .select('id', { count: 'exact', head: true })
    .eq('statut', 'a_traiter')
  return count ?? 0
}

/** Lien d'ouverture signé (bucket privé), valable 1 h. */
export async function urlTicket(t: TicketInbox): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(t.storage_path, 3600)
  return error ? null : (data?.signedUrl ?? null)
}

/**
 * Marque un ticket traité ou ignoré.
 * `charge_id` relie le ticket à la charge créée, quand il y en a une — c'est ce
 * lien qui permet plus tard de remonter du justificatif à l'écriture comptable.
 */
export async function classerTicket(
  id: string,
  statut: Exclude<StatutTicket, 'a_traiter'>,
  chargeId?: string | null,
) {
  return supabase
    .from('receipts_inbox')
    .update({ statut, charge_id: chargeId ?? null, traite_at: new Date().toISOString() })
    .eq('id', id)
}

// ── Dépenses du déclarant (lot S1) ───────────────────────────────────────────

/** Mes dépenses (RLS : celles que j'ai déposées), plus récentes d'abord. */
export async function mesDepenses(limite = 100) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: [] as TicketInbox[], error: new Error('Session expirée') }
  const { data, error } = await supabase
    .from('receipts_inbox').select('*').eq('uploaded_by', user.id)
    .order('created_at', { ascending: false }).limit(limite)
  return { data: (data ?? []) as TicketInbox[], error: error ? new Error(error.message) : null }
}

/** Corrige une dépense encore « à traiter » (le bureau ne l'a pas prise). */
export async function modifierDepense(id: string, maj: DetailsDepense & { note?: string | null }) {
  const { data, error } = await supabase.from('receipts_inbox').update(maj).eq('id', id).select('id')
  if (error) return { error: new Error(error.message) }
  if (!data || data.length === 0) return { error: new Error('Modification refusée : la dépense a déjà été traitée par le bureau.') }
  return { error: null }
}

/** Retire une dépense encore « à traiter » : la ligne d'abord, puis le fichier. */
export async function supprimerDepense(t: TicketInbox) {
  const { data, error } = await supabase.from('receipts_inbox').delete().eq('id', t.id).select('id')
  if (error) return { error: new Error(error.message) }
  if (!data || data.length === 0) return { error: new Error('Suppression refusée : la dépense a déjà été traitée par le bureau.') }
  await supabase.storage.from(BUCKET).remove([t.storage_path])
  return { error: null }
}

/** Refuse une dépense (bureau), avec le motif lu par le déclarant. */
export async function refuserDepense(id: string, motif: string) {
  return supabase.from('receipts_inbox')
    .update({ statut: 'ignore', motif_refus: motif, traite_at: new Date().toISOString() })
    .eq('id', id)
}

/**
 * Envoie un justificatif VALIDÉ dans la liste « à traiter » de Pennylane (Edge `pennylane-justificatif`).
 * Le résultat (envoyé le … ou erreur) est gardé sur le ticket par l'Edge ; ici on renvoie juste le message.
 */
export async function envoyerVersPennylane(ticketId: string, forcer = false): Promise<{ ok: boolean; message: string | null }> {
  const { data, error } = await supabase.functions.invoke('pennylane-justificatif', { body: { ticket_id: ticketId, forcer } })
  if (error || !data?.ok) {
    const echec = await lireErreurEdge(data, error)
    return { ok: false, message: echec?.message ?? "Envoi impossible" }
  }
  return { ok: true, message: null }
}

/**
 * Fait lire le ticket par l'IA (Edge `lire-ticket`) : les cases vides du justificatif sont préremplies côté serveur,
 * rien de ce qui est déjà saisi n'est écrasé. Une panne n'est jamais bloquante (renvoie `false`).
 */
export async function lireTicketIa(ticketId: string): Promise<boolean> {
  const { data, error } = await supabase.functions.invoke('lire-ticket', { body: { ticket_id: ticketId } })
  return !error && !!data?.ok
}
