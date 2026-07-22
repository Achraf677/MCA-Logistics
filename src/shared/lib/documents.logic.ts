import type { DocumentCategory } from './documents.types'

export const DOCUMENT_CATEGORIES: DocumentCategory[] = [
  'Administratif', 'Comptable', 'RH', 'Véhicule', 'Client', 'POD', 'Autre',
]

/** 1 Go en octets — quota par société. */
export const QUOTA_BYTES = 1_073_741_824

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
}

export function quotaStatus(usedBytes: number): 'normal' | 'warning' | 'danger' {
  const ratio = usedBytes / QUOTA_BYTES
  if (ratio > 0.95) return 'danger'
  if (ratio > 0.80) return 'warning'
  return 'normal'
}

/** Nettoie un nom de fichier pour un usage dans un path Storage. */
export function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_')
}

/** Extension lisible (ex. "PDF", "PNG") à partir du nom de fichier. */
export function fileLabel(fileName: string): string {
  return fileName.split('.').pop()?.toUpperCase() ?? '?'
}

export interface UploadBatchSummary {
  message: string
  variant: 'success' | 'error'
}

/** Récap textuel d'un upload multiple séquentiel (succès + échecs par fichier). */
export function summarizeUploadBatch(okCount: number, failedFileNames: string[]): UploadBatchSummary {
  if (okCount === 0) {
    return { message: `Échec de l'upload : ${failedFileNames.join(', ')}`, variant: 'error' }
  }
  const message =
    `${okCount} justificatif${okCount > 1 ? 's' : ''} ajouté${okCount > 1 ? 's' : ''}`
    + (failedFileNames.length > 0 ? ` — échec : ${failedFileNames.join(', ')}` : '')
  return { message, variant: failedFileNames.length > 0 ? 'error' : 'success' }
}
