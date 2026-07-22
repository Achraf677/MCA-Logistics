import { useState, useEffect, useCallback, useRef } from 'react'
import { Upload, Download, Trash2, FileText } from 'lucide-react'
import { Button } from '../../shared/ui/Button'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { useToast } from '../../shared/ui/useToast'
import { useProfile } from '../../app/providers'
import {
  uploadDocument, listDocuments, getDownloadUrl, deleteDocument,
} from '../../shared/lib/documents.queries'
import {
  DOCUMENT_CATEGORIES, formatBytes, fileLabel, summarizeUploadBatch,
} from '../../shared/lib/documents.logic'
import type { DocumentRow, DocumentCategory } from '../../shared/lib/documents.types'

export type DocumentEntityType = 'vehicle' | 'team_member' | 'client' | 'delivery'

interface DocumentsPanelProps {
  entityType: DocumentEntityType
  entityId: string | null | undefined
}

const inputCls =
  'h-8 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--bg)] px-3 ' +
  'text-[var(--text)] text-[var(--fs-sm)] focus:outline-none focus:border-[var(--brand)] transition-colors'

/**
 * Panneau compact de gestion documentaire rattaché à une entité métier.
 * Réutilise uploadDocument / listDocuments / getDownloadUrl / deleteDocument sans rien recoder.
 * À insérer dans n'importe quel drawer : passe entityType + entityId.
 * Si entityId est absent (création), affiche un message d'attente.
 */
export function DocumentsPanel({ entityType, entityId }: DocumentsPanelProps) {
  const { companyId, profile } = useProfile()
  const { toast } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const inputId = `doc-panel-${entityType}-${entityId ?? 'new'}`

  const [docs, setDocs]           = useState<DocumentRow[]>([])
  const [loading, setLoading]     = useState(false)
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [category, setCategory]   = useState<DocumentCategory>('Autre')
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<DocumentRow | null>(null)
  const [deleting, setDeleting]   = useState(false)

  // ── Chargement ────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (!entityId) return
    setLoading(true)
    const { data } = await listDocuments({ entity_type: entityType, entity_id: entityId })
    setDocs((data as DocumentRow[]) ?? [])
    setLoading(false)
  }, [entityType, entityId])

  useEffect(() => { load() }, [load])

  // ── Entité pas encore sauvegardée ─────────────────────────────────────────────

  if (!entityId) {
    return (
      <p className="text-[var(--fs-sm)] text-[var(--text-muted)] italic py-2">
        Enregistre d'abord la fiche pour y rattacher des documents.
      </p>
    )
  }

  // ── Upload ────────────────────────────────────────────────────────────────────
  // Upload multiple : les fichiers sont envoyés SÉQUENTIELLEMENT (un échec sur un
  // fichier n'interrompt pas les suivants) avec une progression "X / N fichiers".

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPendingFiles(Array.from(e.target.files ?? []))
  }

  const handleUpload = async () => {
    if (pendingFiles.length === 0 || !companyId) return
    setUploading(true)
    const total = pendingFiles.length
    const failed: string[] = []
    let ok = 0
    for (let i = 0; i < total; i++) {
      const file = pendingFiles[i]
      setUploadProgress({ current: i + 1, total })
      const { error } = await uploadDocument(file, companyId, {
        category,
        entity_type: entityType,
        entity_id: entityId,
      })
      if (error) failed.push(file.name)
      else ok++
    }
    setUploading(false)
    setUploadProgress(null)
    setPendingFiles([])
    if (fileRef.current) fileRef.current.value = ''
    if (ok > 0) await load()

    const summary = summarizeUploadBatch(ok, failed)
    toast(summary.message, summary.variant)
  }

  // ── Téléchargement ────────────────────────────────────────────────────────────

  const handleDownload = async (doc: DocumentRow) => {
    const url = await getDownloadUrl(doc)
    if (!url) { toast('Impossible de générer le lien', 'error'); return }
    window.open(url, '_blank', 'noopener')
  }

  // ── Suppression ───────────────────────────────────────────────────────────────

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    const { error } = await deleteDocument(deleteTarget)
    setDeleting(false)
    if (error) {
      toast(error.message, 'error')
    } else {
      toast('Document supprimé')
      setDeleteTarget(null)
      await load()
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-3">

      {/* Zone upload compacte */}
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1 flex-1 min-w-[140px]">
          <input
            ref={fileRef}
            id={inputId}
            type="file"
            multiple
            onChange={handleFileChange}
            className="hidden"
          />
          <label
            htmlFor={inputId}
            className={`${inputCls} flex items-center gap-1.5 cursor-pointer hover:border-[var(--brand)] w-full`}
          >
            <Upload size={12} className="shrink-0 text-[var(--text-muted)]" />
            <span className="truncate text-[var(--fs-sm)] text-[var(--text-muted)]">
              {pendingFiles.length > 0
                ? `${pendingFiles.length} fichier${pendingFiles.length > 1 ? 's' : ''} sélectionné${pendingFiles.length > 1 ? 's' : ''}`
                : 'Choisir un ou plusieurs fichiers…'}
            </span>
          </label>
        </div>

        <select
          value={category}
          onChange={e => setCategory(e.target.value as DocumentCategory)}
          className={`${inputCls} pr-6`}
        >
          {DOCUMENT_CATEGORIES.map(c => <option key={c}>{c}</option>)}
        </select>

        <Button
          variant="primary"
          size="compact"
          onClick={handleUpload}
          disabled={pendingFiles.length === 0 || uploading || !companyId}
        >
          <Upload size={12} />
          {uploadProgress ? `${uploadProgress.current} / ${uploadProgress.total}` : 'Ajouter'}
        </Button>
      </div>

      {pendingFiles.length > 0 && (
        <p className="text-[var(--fs-xs)] text-[var(--text-muted)]">
          {pendingFiles.map(f => f.name).join(', ')}
          {pendingFiles.some(f => f.type.startsWith('image/')) && ' — compression auto activée pour les images'}
        </p>
      )}

      {/* Liste des documents rattachés */}
      {loading ? (
        <p className="text-[var(--fs-xs)] text-[var(--text-muted)] italic">Chargement…</p>
      ) : docs.length === 0 ? (
        <div className="flex items-center gap-2 py-3 text-[var(--text-disabled)]">
          <FileText size={15} />
          <span className="text-[var(--fs-sm)]">Aucun document rattaché</span>
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-[var(--border)] rounded-[var(--r-md)] border border-[var(--border)] overflow-hidden">
          {docs.map(doc => (
            <div
              key={doc.id}
              className="flex items-center gap-2 px-3 py-2 bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] transition-colors"
            >
              <span className="inline-flex items-center rounded-[var(--r-sm)] bg-[var(--border)] px-1.5 py-0.5 text-[var(--fs-xs)] font-mono text-[var(--text-muted)] shrink-0">
                {fileLabel(doc.file_name)}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-[var(--fs-sm)] text-[var(--text)] truncate" title={doc.file_name}>
                  {doc.file_name}
                </p>
                <p className="text-[var(--fs-xs)] text-[var(--text-muted)]">
                  {doc.size_bytes != null ? formatBytes(doc.size_bytes) : ''}
                  {doc.category ? ` · ${doc.category}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-0.5 shrink-0">
                <Button
                  variant="icon"
                  onClick={() => handleDownload(doc)}
                  title="Télécharger"
                >
                  <Download size={13} />
                </Button>
                {profile?.role === 'president' && (
                  <Button
                    variant="icon"
                    onClick={() => setDeleteTarget(doc)}
                    title="Supprimer"
                    className="hover:text-[var(--danger)] hover:bg-[var(--danger)]/10"
                  >
                    <Trash2 size={13} />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Supprimer le document"
        message={`Supprimer "${deleteTarget?.file_name}" ? Cette action est irréversible.`}
        confirmLabel="Supprimer"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
        loading={deleting}
      />
    </div>
  )
}
