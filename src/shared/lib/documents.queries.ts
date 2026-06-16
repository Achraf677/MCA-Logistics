import imageCompression from 'browser-image-compression'
import { supabase } from '../../app/providers'
import type { DocumentRow, UploadDocumentOptions } from './documents.types'

const MAX_BYTES = 20 * 1024 * 1024 // 20 Mo

/** Upload un fichier dans le Google Drive de la société via l'Edge drive-upload,
 *  puis indexe une ligne dans `documents` (drive_file_id, drive_link). */
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
        maxSizeMB: 1, maxWidthOrHeight: 1920, initialQuality: 0.8, useWebWorker: true,
      })
    } catch { /* compression échouée → fichier original */ }
  }

  // 1) Upload dans Drive (Edge)
  const fd = new FormData()
  fd.append('file', fileToUpload, file.name)
  const { data: up, error: upErr } = await supabase.functions.invoke('drive-upload', { body: fd })
  if (upErr || !up?.ok) {
    return { data: null, error: new Error(up?.error ?? upErr?.message ?? 'Upload Drive échoué') }
  }

  // 2) Index en base
  const { data: row, error: insertErr } = await supabase
    .from('documents')
    .insert({
      company_id:    companyId,
      drive_file_id: up.file_id,
      drive_link:    up.web_link ?? null,
      file_name:     file.name,
      mime_type:     file.type || null,
      size_bytes:    fileToUpload.size,
      category:      options.category ?? null,
      entity_type:   options.entity_type ?? null,
      entity_id:     options.entity_id ?? null,
      uploaded_by:   user?.id ?? null,
      notes:         options.notes ?? null,
    })
    .select()
    .single()

  if (insertErr) {
    // Rollback Drive si l'insert DB échoue
    await supabase.functions.invoke('drive-delete', { body: { file_id: up.file_id } })
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

/** Liste les documents de la société (RLS). Inchangé : lit la table `documents`. */
export async function listDocuments(options: ListDocumentsOptions = {}) {
  let q = supabase.from('documents').select('*').order('created_at', { ascending: false })
  if (options.entity_type) q = q.eq('entity_type', options.entity_type)
  if (options.entity_id)   q = q.eq('entity_id', options.entity_id)
  if (options.category)    q = q.eq('category', options.category)
  if (options.search)      q = q.ilike('file_name', `%${options.search}%`)
  return q
}

/** Lien d'ouverture du document (webViewLink Drive). */
export async function getDownloadUrl(doc: DocumentRow): Promise<string | null> {
  return doc.drive_link ?? null
}

/** Supprime le fichier dans Drive (corbeille) PUIS la ligne en base. */
export async function deleteDocument(doc: DocumentRow): Promise<{ error: Error | null }> {
  if (doc.drive_file_id) {
    const { data, error } = await supabase.functions.invoke('drive-delete', { body: { file_id: doc.drive_file_id } })
    if (error || !data?.ok) {
      return { error: new Error(data?.error ?? error?.message ?? 'Suppression Drive échouée') }
    }
  }
  const { error: dbErr } = await supabase.from('documents').delete().eq('id', doc.id)
  return { error: dbErr ? new Error(dbErr.message) : null }
}

/** Somme des size_bytes de la société. Inchangé. */
export async function getStorageUsage(): Promise<number> {
  const { data } = await supabase.from('documents').select('size_bytes')
  return (data ?? []).reduce((s: number, r: { size_bytes: number | null }) => s + (r.size_bytes ?? 0), 0)
}
