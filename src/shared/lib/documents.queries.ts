import imageCompression from 'browser-image-compression'
import { supabase } from '../../app/providers'
import type { DocumentRow, UploadDocumentOptions } from './documents.types'

const BUCKET = 'documents'
const MAX_BYTES = 20 * 1024 * 1024 // 20 Mo — aligné sur la limite du bucket

/**
 * Compression avant envoi. Deux gains : le fichier stocké est plus léger, et
 * surtout il y a moins à téléverser — c'est ce qui rendait l'ajout d'un
 * justificatif lent depuis un téléphone.
 * Les PDF ne sont pas compressibles côté navigateur sans embarquer une grosse
 * bibliothèque : on les envoie tels quels.
 */
async function compresserSiImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file
  try {
    return await imageCompression(file, {
      maxSizeMB: 1,
      maxWidthOrHeight: 1920,
      initialQuality: 0.8,
      useWebWorker: true,
    })
  } catch {
    return file // compression échouée → fichier original, jamais d'échec bloquant
  }
}

/**
 * Chemin de stockage : `<company_id>/<uuid>-<nom assaini>`.
 * Le premier segment DOIT être la company : les policies RLS du bucket
 * `documents` comparent `storage.foldername(name)[1]` au company_id du profil.
 */
function cheminStockage(companyId: string, fileName: string): string {
  const propre = fileName
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // retire les accents
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(-80)
  return `${companyId}/${crypto.randomUUID()}-${propre}`
}

/** Envoie un fichier dans Supabase Storage puis indexe une ligne `documents`. */
export async function uploadDocument(
  file: File,
  companyId: string,
  options: UploadDocumentOptions = {},
): Promise<{ data: DocumentRow | null; error: Error | null }> {
  if (file.size > MAX_BYTES) {
    return { data: null, error: new Error('Fichier trop volumineux (limite 20 Mo)') }
  }

  const { data: { user } } = await supabase.auth.getUser()
  const fileToUpload = await compresserSiImage(file)
  const path = cheminStockage(companyId, file.name)

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, fileToUpload, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    })
  if (upErr) return { data: null, error: new Error(upErr.message) }

  const { data: row, error: insertErr } = await supabase
    .from('documents')
    .insert({
      company_id:   companyId,
      storage_path: path,
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
    // Rollback : sans la ligne d'index, le fichier serait orphelin dans le bucket.
    await supabase.storage.from(BUCKET).remove([path])
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

/** Liste les documents de la société (RLS). */
export async function listDocuments(options: ListDocumentsOptions = {}) {
  let q = supabase.from('documents').select('*').order('created_at', { ascending: false })
  if (options.entity_type) q = q.eq('entity_type', options.entity_type)
  if (options.entity_id)   q = q.eq('entity_id', options.entity_id)
  if (options.category)    q = q.eq('category', options.category)
  if (options.search)      q = q.ilike('file_name', `%${options.search}%`)
  return q
}

/**
 * Lien d'ouverture. Le bucket est privé : on signe une URL valable 1 h.
 * `drive_link` reste lu en dernier recours pour les documents antérieurs à la
 * migration, qui n'ont pas encore de `storage_path`.
 */
export async function getDownloadUrl(doc: DocumentRow): Promise<string | null> {
  if (doc.storage_path) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(doc.storage_path, 3600)
    if (!error && data?.signedUrl) return data.signedUrl
  }
  return doc.drive_link ?? null
}

/** Supprime le fichier stocké PUIS la ligne en base. */
export async function deleteDocument(doc: DocumentRow): Promise<{ error: Error | null }> {
  if (doc.storage_path) {
    const { error } = await supabase.storage.from(BUCKET).remove([doc.storage_path])
    // Un fichier déjà absent ne doit pas empêcher de nettoyer la ligne.
    if (error && !/not found/i.test(error.message)) {
      return { error: new Error(error.message) }
    }
  }
  const { error: dbErr } = await supabase.from('documents').delete().eq('id', doc.id)
  return { error: dbErr ? new Error(dbErr.message) : null }
}

/** Somme des size_bytes de la société. */
export async function getStorageUsage(): Promise<number> {
  const { data } = await supabase.from('documents').select('size_bytes')
  return (data ?? []).reduce((s: number, r: { size_bytes: number | null }) => s + (r.size_bytes ?? 0), 0)
}
