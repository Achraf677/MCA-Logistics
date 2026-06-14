import imageCompression from 'browser-image-compression'
import { supabase } from '../../app/providers'
import { sanitizeFileName } from './documents.logic'
import type { DocumentRow, UploadDocumentOptions } from './documents.types'

const BUCKET = 'documents'
const MAX_BYTES = 20 * 1024 * 1024 // 20 Mo

/**
 * Upload un fichier vers le bucket "documents".
 * Les images sont compressées avant envoi (maxSizeMB 1, maxWidthOrHeight 1920).
 * Les autres types sont envoyés tels quels.
 * Convention storage_path : `${companyId}/${entity_type ?? 'libre'}/${uuid}-${nom_assaini}`.
 */
export async function uploadDocument(
  file: File,
  companyId: string,
  options: UploadDocumentOptions = {},
): Promise<{ data: DocumentRow | null; error: Error | null }> {
  if (file.size > MAX_BYTES) {
    return { data: null, error: new Error('Fichier trop volumineux (limite 20 Mo)') }
  }

  const { data: { user } } = await supabase.auth.getUser()

  let fileToUpload: File = file
  if (file.type.startsWith('image/')) {
    try {
      fileToUpload = await imageCompression(file, {
        maxSizeMB: 1,
        maxWidthOrHeight: 1920,
        initialQuality: 0.8,
        useWebWorker: true,
      })
    } catch {
      // Compression échouée → on garde le fichier original
    }
  }

  const entityType = options.entity_type ?? 'libre'
  const storagePath = `${companyId}/${entityType}/${crypto.randomUUID()}-${sanitizeFileName(file.name)}`

  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, fileToUpload, { contentType: file.type })

  if (uploadErr) return { data: null, error: new Error(uploadErr.message) }

  const { data: row, error: insertErr } = await supabase
    .from('documents')
    .insert({
      company_id:   companyId,
      storage_path: storagePath,
      file_name:    file.name,
      mime_type:    file.type || null,
      size_bytes:   fileToUpload.size,
      category:     options.category ?? null,
      entity_type:  options.entity_type ?? null,
      entity_id:    options.entity_id ?? null,
      uploaded_by:  user?.id ?? null,
      notes:        options.notes ?? null,
    })
    .select()
    .single()

  if (insertErr) {
    // Rollback storage si l'insert DB échoue
    await supabase.storage.from(BUCKET).remove([storagePath])
    return { data: null, error: new Error(insertErr.message) }
  }

  return { data: row as DocumentRow, error: null }
}

export interface ListDocumentsOptions {
  entity_type?: string
  entity_id?: string
  category?: string
  search?: string
}

/** Liste les documents de la société (RLS). Filtrable par entity, catégorie, nom. */
export async function listDocuments(options: ListDocumentsOptions = {}) {
  let q = supabase
    .from('documents')
    .select('*')
    .order('created_at', { ascending: false })

  if (options.entity_type) q = q.eq('entity_type', options.entity_type)
  if (options.entity_id)   q = q.eq('entity_id', options.entity_id)
  if (options.category)    q = q.eq('category', options.category)
  if (options.search)      q = q.ilike('file_name', `%${options.search}%`)

  return q
}

/** Crée une signed URL (valide 1h) pour télécharger un document du bucket privé. */
export async function getDownloadUrl(doc: DocumentRow): Promise<string | null> {
  const { data } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(doc.storage_path, 3600)
  return data?.signedUrl ?? null
}

/**
 * Supprime le fichier dans Storage PUIS la ligne en base.
 * L'ordre est intentionnel : si le delete DB échoue, le fichier orphelin peut être
 * retrouvé et renettoyé ; l'inverse laisserait une ligne sans fichier.
 */
export async function deleteDocument(doc: DocumentRow): Promise<{ error: Error | null }> {
  const { error: storageErr } = await supabase.storage
    .from(BUCKET)
    .remove([doc.storage_path])

  if (storageErr) return { error: new Error(storageErr.message) }

  const { error: dbErr } = await supabase
    .from('documents')
    .delete()
    .eq('id', doc.id)

  return { error: dbErr ? new Error(dbErr.message) : null }
}

/** Somme des size_bytes de la société (via RLS). */
export async function getStorageUsage(): Promise<number> {
  const { data } = await supabase
    .from('documents')
    .select('size_bytes')
  return (data ?? []).reduce((s: number, r: { size_bytes: number | null }) => s + (r.size_bytes ?? 0), 0)
}
