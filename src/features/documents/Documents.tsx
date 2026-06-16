import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Folder, FileText, Upload, FolderPlus, Trash2, ExternalLink, ChevronRight,
} from 'lucide-react'
import { Shell } from '../../app/Shell'
import { Button } from '../../shared/ui/Button'
import { EmptyState } from '../../shared/ui/EmptyState'
import { SkeletonTable } from '../../shared/ui/Skeleton'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { useToast } from '../../shared/ui/useToast'
import { supabase } from '../../app/providers'
import { formatBytes } from '../../shared/lib/documents.logic'

type DriveItem = {
  id: string
  name: string
  mimeType: string
  webViewLink?: string
  iconLink?: string
  modifiedTime?: string
  size?: string
}

export function Documents() {
  const { toast } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)

  const [path, setPath] = useState<{ id: string; name: string }[]>([
    { id: 'root', name: 'Mon Drive' },
  ])
  const [folders, setFolders] = useState<DriveItem[]>([])
  const [files, setFiles]     = useState<DriveItem[]>([])
  const [loading, setLoading] = useState(true)

  const [deleteTarget, setDeleteTarget] = useState<DriveItem | null>(null)
  const [deleting, setDeleting]         = useState(false)

  const [showNewFolder, setShowNewFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [creating, setCreating]           = useState(false)

  const [uploading, setUploading] = useState(false)

  const current = path[path.length - 1]

  // ── Navigation ────────────────────────────────────────────────────────────────

  const browse = useCallback(async (folderId: string) => {
    setLoading(true)
    const { data, error } = await supabase.functions.invoke('drive-browse', {
      body: { folder_id: folderId },
    })
    if (error || !data?.ok) {
      toast(data?.error ?? error?.message ?? 'Chargement du dossier impossible', 'error')
      setFolders([])
      setFiles([])
    } else {
      setFolders(data.folders ?? [])
      setFiles(data.files ?? [])
    }
    setLoading(false)
  }, [toast])

  useEffect(() => { browse(current.id) }, [current.id, browse])

  const enterFolder = (f: DriveItem) => setPath(p => [...p, { id: f.id, name: f.name }])
  const goToCrumb   = (i: number) => setPath(p => p.slice(0, i + 1))
  const openFile    = (f: DriveItem) => { if (f.webViewLink) window.open(f.webViewLink, '_blank') }

  // ── Création de dossier ─────────────────────────────────────────────────────────

  const createFolder = async () => {
    const name = newFolderName.trim()
    if (!name) return
    setCreating(true)
    const { data, error } = await supabase.functions.invoke('drive-create-folder', {
      body: { name, parent_id: current.id },
    })
    setCreating(false)
    if (error || !data?.ok) {
      toast(data?.error ?? error?.message ?? 'Création du dossier impossible', 'error')
      return
    }
    setNewFolderName('')
    setShowNewFolder(false)
    toast(`Dossier "${name}" créé`)
    await browse(current.id)
  }

  // ── Upload ────────────────────────────────────────────────────────────────────

  const handleUpload = async (file: File) => {
    setUploading(true)
    const fd = new FormData()
    fd.append('file', file)
    fd.append('folder_id', current.id)
    const { data, error } = await supabase.functions.invoke('drive-upload', { body: fd })
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
    if (error || !data?.ok) {
      toast(data?.error ?? error?.message ?? 'Upload impossible', 'error')
      return
    }
    toast(`${data.name ?? file.name} ajouté`)
    await browse(current.id)
  }

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleUpload(file)
  }

  // ── Suppression ───────────────────────────────────────────────────────────────

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    const { data, error } = await supabase.functions.invoke('drive-delete', {
      body: { file_id: deleteTarget.id },
    })
    setDeleting(false)
    if (error || !data?.ok) {
      toast(data?.error ?? error?.message ?? 'Suppression impossible', 'error')
      return
    }
    toast(`"${deleteTarget.name}" mis à la corbeille`)
    setDeleteTarget(null)
    await browse(current.id)
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  const isEmpty = folders.length === 0 && files.length === 0

  return (
    <Shell pageTitle="Documents">
      <div className="max-w-4xl flex flex-col gap-5">

        {/* Barre du haut : fil d'Ariane + actions */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <nav className="flex items-center gap-1 text-[var(--fs-sm)] min-w-0">
            {path.map((c, i) => (
              <span key={c.id} className="flex items-center gap-1 min-w-0">
                {i > 0 && <ChevronRight size={14} className="text-[var(--text-disabled)] shrink-0" />}
                {i === path.length - 1 ? (
                  <span className="font-medium text-[var(--text)] truncate">{c.name}</span>
                ) : (
                  <button
                    onClick={() => goToCrumb(i)}
                    className="text-[var(--text-muted)] hover:text-[var(--brand)] hover:underline truncate"
                  >
                    {c.name}
                  </button>
                )}
              </span>
            ))}
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <Button variant="secondary" onClick={() => setShowNewFolder(v => !v)}>
              <FolderPlus size={14} />
              Nouveau dossier
            </Button>
            <input ref={fileRef} type="file" className="hidden" onChange={onFileChange} disabled={uploading} />
            <Button variant="primary" onClick={() => fileRef.current?.click()} disabled={uploading}>
              <Upload size={14} />
              {uploading ? 'Dépôt…' : 'Déposer un fichier'}
            </Button>
          </div>
        </div>

        {/* Champ inline nouveau dossier */}
        {showNewFolder && (
          <div className="flex items-center gap-2 rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg-card)] p-3">
            <input
              autoFocus
              value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') createFolder(); if (e.key === 'Escape') { setShowNewFolder(false); setNewFolderName('') } }}
              placeholder="Nom du dossier…"
              className="flex-1 h-9 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--bg)] px-3 text-[var(--fs-sm)] text-[var(--text)] focus:outline-none focus:border-[var(--brand)] transition-colors"
            />
            <Button variant="primary" onClick={createFolder} disabled={!newFolderName.trim() || creating}>
              {creating ? 'Création…' : 'Valider'}
            </Button>
            <Button variant="secondary" onClick={() => { setShowNewFolder(false); setNewFolderName('') }}>
              Annuler
            </Button>
          </div>
        )}

        {/* Liste */}
        {loading ? (
          <SkeletonTable />
        ) : isEmpty ? (
          <EmptyState
            icon={<Folder size={40} />}
            title="Ce dossier est vide"
            description="Déposez un fichier ou créez un sous-dossier."
          />
        ) : (
          <div className="rounded-[var(--r-lg)] border border-[var(--border)] overflow-hidden divide-y divide-[var(--border)]">
            {/* Dossiers d'abord */}
            {folders.map(f => (
              <div key={f.id} className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--bg-card-hover)] transition-colors">
                <button
                  onClick={() => enterFolder(f)}
                  className="flex items-center gap-3 flex-1 min-w-0 text-left"
                >
                  <Folder size={18} className="shrink-0 text-[var(--brand)]" />
                  <span className="font-medium text-[var(--text)] truncate">{f.name}</span>
                </button>
                <Button
                  variant="icon"
                  onClick={() => setDeleteTarget(f)}
                  title="Supprimer"
                  className="hover:text-[var(--danger)] hover:bg-[var(--danger)]/10"
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            ))}

            {/* Fichiers */}
            {files.map(f => (
              <div key={f.id} className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--bg-card-hover)] transition-colors">
                <button
                  onClick={() => openFile(f)}
                  className="flex items-center gap-3 flex-1 min-w-0 text-left"
                >
                  <FileText size={18} className="shrink-0 text-[var(--text-muted)]" />
                  <span className="font-medium text-[var(--text)] truncate">{f.name}</span>
                </button>
                {f.size && (
                  <span className="font-mono text-[var(--fs-xs)] text-[var(--text-muted)] whitespace-nowrap">
                    {formatBytes(Number(f.size))}
                  </span>
                )}
                {f.modifiedTime && (
                  <span className="text-[var(--fs-xs)] text-[var(--text-muted)] whitespace-nowrap">
                    {new Date(f.modifiedTime).toLocaleDateString('fr-FR')}
                  </span>
                )}
                <Button variant="icon" onClick={() => openFile(f)} title="Ouvrir">
                  <ExternalLink size={14} />
                </Button>
                <Button
                  variant="icon"
                  onClick={() => setDeleteTarget(f)}
                  title="Supprimer"
                  className="hover:text-[var(--danger)] hover:bg-[var(--danger)]/10"
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            ))}
          </div>
        )}

      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Mettre à la corbeille"
        message={`"${deleteTarget?.name}" sera mis à la corbeille de votre Drive (récupérable 30 jours).`}
        confirmLabel="Mettre à la corbeille"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
        loading={deleting}
      />
    </Shell>
  )
}
