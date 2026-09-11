import imageCompression from 'browser-image-compression'
import { supabase } from '../../app/providers'

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
