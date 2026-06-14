export type DocumentCategory =
  | 'Administratif'
  | 'Comptable'
  | 'RH'
  | 'Véhicule'
  | 'Client'
  | 'Autre'

export interface DocumentRow {
  id: string
  company_id: string
  storage_path: string
  file_name: string
  mime_type: string | null
  size_bytes: number | null
  category: string | null
  entity_type: string | null
  entity_id: string | null
  uploaded_by: string | null
  notes: string | null
  created_at: string
}

export interface UploadDocumentOptions {
  category?: DocumentCategory
  entity_type?: string
  entity_id?: string
  notes?: string
}
