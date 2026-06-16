import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, HardDrive } from 'lucide-react'
import { supabase } from '../../app/providers'
import { Button } from '../../shared/ui/Button'

type DriveFile = { id: string; name: string; webViewLink?: string; modifiedTime?: string }

export function DriveConnect() {
  const [loading, setLoading] = useState(true)
  const [connected, setConnected] = useState(false)
  const [email, setEmail] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [uploadMsg, setUploadMsg] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<DriveFile[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [listOpen, setListOpen] = useState(false)

  async function handleTestUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadMsg(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const { data, error: upErr } = await supabase.functions.invoke('drive-upload', { body: fd })
      if (upErr || !data?.ok) {
        setUploadMsg(`Échec : ${data?.error ?? upErr?.message ?? 'inconnu'}`)
      } else {
        setUploadMsg(`✅ Envoyé : ${data.name}`)
        if (data.web_link) window.open(data.web_link, '_blank')
      }
    } catch (err) {
      setUploadMsg(`Échec : ${(err as Error).message}`)
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  async function loadFiles() {
    setListLoading(true)
    setListOpen(true)
    try {
      const { data, error: lErr } = await supabase.functions.invoke('drive-list')
      if (lErr || !data?.ok) {
        setFiles([])
        setUploadMsg(`Liste échouée : ${data?.error ?? lErr?.message ?? 'inconnu'}`)
      } else {
        setFiles(data.files ?? [])
      }
    } catch (err) {
      setUploadMsg(`Liste échouée : ${(err as Error).message}`)
    } finally {
      setListLoading(false)
    }
  }

  async function deleteFile(id: string) {
    try {
      const { data, error: dErr } = await supabase.functions.invoke('drive-delete', { body: { file_id: id } })
      if (dErr || !data?.ok) {
        setUploadMsg(`Suppression échouée : ${data?.error ?? dErr?.message ?? 'inconnu'}`)
      } else {
        setFiles(prev => prev.filter(f => f.id !== id))
      }
    } catch (err) {
      setUploadMsg(`Suppression échouée : ${(err as Error).message}`)
    }
  }

  async function refreshStatus() {
    setLoading(true)
    try {
      const { data } = await supabase.functions.invoke('drive-status')
      setConnected(!!data?.connected)
      setEmail(data?.email ?? null)
    } catch {
      setConnected(false)
    }
    setLoading(false)
  }

  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    const drive = p.get('drive')
    if (drive) {
      window.history.replaceState({}, '', '/systeme?tab=parametres')
      if (drive === 'error') {
        setError(`Connexion Drive échouée (${p.get('reason') ?? 'inconnu'})`)
      }
    }
    refreshStatus()
  }, [])

  async function connect() {
    setError(null)
    const { data, error: invokeError } = await supabase.functions.invoke('drive-oauth-start', {
      body: { origin: window.location.origin },
    })
    if (invokeError || !data?.url) {
      setError('Impossible de démarrer la connexion Drive')
      return
    }
    window.location.href = data.url
  }

  if (loading) {
    return (
      <p className="text-[var(--fs-sm)] text-[var(--text-muted)]">Vérification…</p>
    )
  }

  if (connected) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 size={18} className="text-[var(--success,#16a34a)] shrink-0" />
            <div>
              <p className="text-[var(--fs-sm)] font-medium text-[var(--text)]">Drive connecté</p>
              {email && (
                <p className="text-[var(--fs-xs)] text-[var(--text-muted)]">{email}</p>
              )}
            </div>
          </div>
          <Button variant="secondary" size="compact" onClick={connect}>
            Reconnecter
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <input ref={fileInputRef} type="file" className="hidden" onChange={handleTestUpload} disabled={uploading} />
          <Button variant="secondary" size="compact" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            {uploading ? 'Envoi…' : "Tester l'upload Drive"}
          </Button>
          {uploadMsg && <span className="text-[var(--fs-xs)] text-[var(--text-muted)]">{uploadMsg}</span>}
        </div>
        <div className="flex flex-col gap-1">
          <Button variant="secondary" size="compact" onClick={loadFiles} disabled={listLoading}>
            {listLoading ? 'Chargement…' : 'Voir mes fichiers Drive'}
          </Button>
          {listOpen && !listLoading && (
            files.length === 0 ? (
              <p className="text-[var(--fs-xs)] text-[var(--text-muted)]">Aucun fichier.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {files.map((f) => (
                  <li key={f.id} className="flex items-center justify-between gap-2 text-[var(--fs-xs)]">
                    <a href={f.webViewLink} target="_blank" rel="noreferrer" className="truncate text-[var(--brand,#e63946)] hover:underline">{f.name}</a>
                    <button onClick={() => deleteFile(f.id)} className="text-[var(--danger,#dc2626)] hover:underline shrink-0">Supprimer</button>
                  </li>
                ))}
              </ul>
            )
          )}
        </div>
        {error && (
          <p className="text-[var(--fs-xs)] text-[var(--danger,#dc2626)]">{error}</p>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <HardDrive size={18} className="text-[var(--text-muted)] shrink-0" />
          <p className="text-[var(--fs-sm)] text-[var(--text-muted)]">
            Aucun Drive connecté — les documents seront uploadés dans le Google Drive de la société.
          </p>
        </div>
        <Button variant="primary" size="compact" onClick={connect} className="shrink-0">
          Connecter Google Drive
        </Button>
      </div>
      {error && (
        <p className="text-[var(--fs-xs)] text-[var(--danger,#dc2626)]">{error}</p>
      )}
    </div>
  )
}
