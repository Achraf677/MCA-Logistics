import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Upload, Download, Trash2, Search, X, FileText } from 'lucide-react'
import { Shell } from '../../app/Shell'
import { Button } from '../../shared/ui/Button'
import { EmptyState } from '../../shared/ui/EmptyState'
import { SkeletonTable } from '../../shared/ui/Skeleton'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { useToast } from '../../shared/ui/useToast'
import { useProfile } from '../../app/providers'
import {
  uploadDocument, listDocuments, getDownloadUrl,
  deleteDocument, getStorageUsage,
} from '../../shared/lib/documents.queries'
import {
  DOCUMENT_CATEGORIES, QUOTA_BYTES, formatBytes, quotaStatus, fileLabel,
} from '../../shared/lib/documents.logic'
import type { DocumentRow, DocumentCategory } from '../../shared/lib/documents.types'

const ENTITY_LABEL: Record<string, string> = {
  vehicle:     'Véhicule',
  team_member: 'Salarié',
  client:      'Client',
  delivery:    'Livraison',
}

// ── Barre de quota ────────────────────────────────────────────────────────────

function QuotaBar({ usedBytes }: { usedBytes: number }) {
  const pct = Math.min(100, (usedBytes / QUOTA_BYTES) * 100)
  const status = quotaStatus(usedBytes)
  const barColor =
    status === 'danger'  ? 'bg-[var(--danger)]'  :
    status === 'warning' ? 'bg-[var(--warning)]' :
    'bg-[var(--brand)]'
  const textColor =
    status === 'danger'  ? 'text-[var(--danger)]'  :
    status === 'warning' ? 'text-[var(--warning)]' :
    'text-[var(--text)]'

  return (
    <div className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg-card)] p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[var(--fs-xs)] text-[var(--text-muted)]">Stockage utilisé</span>
        <span className={`font-mono text-[var(--fs-xs)] font-medium ${textColor}`}>
          {formatBytes(usedBytes)} / {formatBytes(QUOTA_BYTES)}
        </span>
      </div>
      <div className="h-2 rounded-full bg-[var(--border)] overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

// ── Composant principal ───────────────────────────────────────────────────────

const inputCls =
  'h-9 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--bg)] px-3 ' +
  'text-[var(--text)] text-[var(--fs-sm)] focus:outline-none focus:border-[var(--brand)] transition-colors'

export function Documents() {
  const { companyId, profile } = useProfile()
  const { toast } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)

  const [docs, setDocs]       = useState<DocumentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [usage, setUsage]     = useState(0)

  // Upload
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [category, setCategory]       = useState<DocumentCategory>('Autre')
  const [notes, setNotes]             = useState('')
  const [uploading, setUploading]     = useState(false)

  // Filtres
  const [search, setSearch]       = useState('')
  const [catFilter, setCatFilter] = useState('')

  // Suppression
  const [deleteTarget, setDeleteTarget] = useState<DocumentRow | null>(null)
  const [deleting, setDeleting]         = useState(false)

  // ── Chargement ────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data }, used] = await Promise.all([listDocuments(), getStorageUsage()])
    setDocs((data as DocumentRow[]) ?? [])
    setUsage(used)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // ── Upload ────────────────────────────────────────────────────────────────────

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPendingFile(e.target.files?.[0] ?? null)
  }

  const handleUpload = async () => {
    if (!pendingFile || !companyId) return
    setUploading(true)
    const { data, error } = await uploadDocument(pendingFile, companyId, {
      category,
      notes: notes.trim() || undefined,
    })
    setUploading(false)
    if (error) {
      toast(error.message, 'error')
    } else if (data) {
      toast(`${pendingFile.name} ajouté`)
      setPendingFile(null)
      setNotes('')
      if (fileRef.current) fileRef.current.value = ''
      await load()
    }
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

  // ── Filtrage ──────────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return docs.filter(d => {
      if (catFilter && d.category !== catFilter) return false
      if (q && !d.file_name.toLowerCase().includes(q)) return false
      return true
    })
  }, [docs, search, catFilter])

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <Shell pageTitle="Documents">
      <div className="max-w-4xl flex flex-col gap-5">

        {/* Quota */}
        <QuotaBar usedBytes={usage} />

        {/* Section upload */}
        <div className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg-card)] p-4 flex flex-col gap-3">
          <p className="text-[var(--fs-xs)] font-semibold text-[var(--text-muted)] uppercase tracking-wide">
            Ajouter un document
          </p>
          <div className="flex flex-wrap items-end gap-3">

            {/* Sélecteur de fichier */}
            <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
              <label className="text-[var(--fs-xs)] text-[var(--text-muted)]">Fichier</label>
              <input
                ref={fileRef}
                id="doc-file-input"
                type="file"
                onChange={handleFileChange}
                className="hidden"
              />
              <label
                htmlFor="doc-file-input"
                className={`${inputCls} flex items-center gap-2 cursor-pointer hover:border-[var(--brand)] w-full`}
              >
                <Upload size={13} className="shrink-0 text-[var(--text-muted)]" />
                <span className="truncate text-[var(--fs-sm)] text-[var(--text-muted)]">
                  {pendingFile ? pendingFile.name : 'Choisir un fichier…'}
                </span>
              </label>
            </div>

            {/* Catégorie */}
            <div className="flex flex-col gap-1">
              <label className="text-[var(--fs-xs)] text-[var(--text-muted)]">Catégorie</label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value as DocumentCategory)}
                className={`${inputCls} pr-8`}
              >
                {DOCUMENT_CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>

            {/* Notes */}
            <div className="flex flex-col gap-1 flex-1 min-w-[160px]">
              <label className="text-[var(--fs-xs)] text-[var(--text-muted)]">Notes (facultatif)</label>
              <input
                type="text"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Ex. Contrat 2025"
                className={inputCls}
              />
            </div>

            <Button
              variant="primary"
              onClick={handleUpload}
              disabled={!pendingFile || uploading || !companyId}
            >
              <Upload size={13} />
              {uploading ? 'Upload…' : 'Uploader'}
            </Button>
          </div>

          {pendingFile && (
            <p className="text-[var(--fs-xs)] text-[var(--text-muted)]">
              {formatBytes(pendingFile.size)}
              {pendingFile.type.startsWith('image/') && ' — compression auto (max 1 Mo / 1920 px)'}
            </p>
          )}
        </div>

        {/* Filtres */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-disabled)] pointer-events-none" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher par nom…"
              className="w-full h-9 pl-9 pr-9 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--bg-card)] text-[var(--fs-sm)] text-[var(--text)] placeholder:text-[var(--text-disabled)] focus:outline-none focus:border-[var(--brand)] transition-colors"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[var(--text-muted)] hover:text-[var(--text)]"
              >
                <X size={13} />
              </button>
            )}
          </div>
          <select
            value={catFilter}
            onChange={e => setCatFilter(e.target.value)}
            className={`${inputCls} pr-8`}
          >
            <option value="">Toutes les catégories</option>
            {DOCUMENT_CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>

        {/* Tableau */}
        {loading ? (
          <SkeletonTable />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<FileText size={40} />}
            title="Aucun document"
            description={
              docs.length === 0
                ? 'Aucun document enregistré pour l\'instant.'
                : 'Aucun résultat pour ces filtres.'
            }
            action={
              (search || catFilter)
                ? { label: 'Réinitialiser les filtres', onClick: () => { setSearch(''); setCatFilter('') } }
                : undefined
            }
          />
        ) : (
          <div className="overflow-x-auto rounded-[var(--r-lg)] border border-[var(--border)]">
            <table className="w-full text-[var(--fs-sm)]">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--bg-elevated)]">
                  {['Nom', 'Type', 'Taille', 'Catégorie', 'Rattaché à', 'Date', ''].map(h => (
                    <th
                      key={h}
                      className="px-4 py-2.5 text-left font-medium text-[var(--text-muted)] text-[var(--fs-xs)] uppercase tracking-wide whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {filtered.map(doc => (
                  <tr key={doc.id} className="hover:bg-[var(--bg-card-hover)] transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-[var(--text)] truncate max-w-[200px]" title={doc.file_name}>
                        {doc.file_name}
                      </p>
                      {doc.notes && (
                        <p className="text-[var(--fs-xs)] text-[var(--text-muted)] truncate max-w-[200px]">
                          {doc.notes}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-[var(--r-sm)] bg-[var(--border)] px-1.5 py-0.5 text-[var(--fs-xs)] font-mono text-[var(--text-muted)]">
                        {fileLabel(doc.file_name)}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-[var(--text-muted)] whitespace-nowrap">
                      {doc.size_bytes != null ? formatBytes(doc.size_bytes) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {doc.category ? (
                        <span className="inline-flex items-center rounded-[var(--r-sm)] bg-[var(--brand-soft)] px-2 py-0.5 text-[var(--fs-xs)] text-[var(--brand)]">
                          {doc.category}
                        </span>
                      ) : (
                        <span className="text-[var(--text-muted)]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {doc.entity_type ? (
                        <span className="inline-flex items-center rounded-[var(--r-sm)] bg-[var(--border)] px-1.5 py-0.5 text-[var(--fs-xs)] text-[var(--text-muted)]">
                          {ENTITY_LABEL[doc.entity_type] ?? doc.entity_type}
                        </span>
                      ) : (
                        <span className="text-[var(--text-muted)]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-muted)] whitespace-nowrap text-[var(--fs-xs)]">
                      {new Date(doc.created_at).toLocaleDateString('fr-FR')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <Button
                          variant="icon"
                          onClick={() => handleDownload(doc)}
                          title="Télécharger"
                        >
                          <Download size={14} />
                        </Button>
                        {profile?.role === 'president' && (
                          <Button
                            variant="icon"
                            onClick={() => setDeleteTarget(doc)}
                            title="Supprimer"
                            className="hover:text-[var(--danger)] hover:bg-[var(--danger)]/10"
                          >
                            <Trash2 size={14} />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Supprimer le document"
        message={`Supprimer "${deleteTarget?.file_name}" ? Cette action est irréversible.`}
        confirmLabel="Supprimer définitivement"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
        loading={deleting}
      />
    </Shell>
  )
}
