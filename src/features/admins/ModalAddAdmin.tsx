import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { supabase } from '../../app/providers'
import { useToast } from '../../shared/ui/useToast'
import { Button } from '../../shared/ui/Button'
import { ROLE_OPTIONS } from './admins.types'
import type { AdminRole } from './admins.types'

interface Props {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

type Tab = 'create' | 'invite'

const inputCls = `w-full h-9 px-3 rounded-[var(--r-md)] bg-[var(--bg)] border border-[var(--border)]
  text-[var(--text)] text-[var(--fs-body)] focus:outline-none focus:border-[var(--brand)]
  transition-colors disabled:opacity-50 disabled:cursor-not-allowed`

export function ModalAddAdmin({ open, onClose, onSuccess }: Props) {
  const { toast } = useToast()
  const [tab, setTab] = useState<Tab>('create')
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<AdminRole>('admin')
  const [loading, setLoading] = useState(false)
  const [inviteWarning, setInviteWarning] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setTab('create')
      setEmail('')
      setFullName('')
      setPassword('')
      setRole('admin')
      setInviteWarning(null)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape' && !loading) onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, loading, onClose])

  async function handleCreate() {
    if (!email || !fullName || !password) return
    setLoading(true)
    const { data, error } = await supabase.functions.invoke('admin-users', {
      body: { action: 'create', email, full_name: fullName, password, role },
    })
    setLoading(false)
    if (error || !data?.ok) {
      toast(error?.message ?? 'Erreur lors de la création du compte', 'error')
      return
    }
    toast(`Compte créé pour ${fullName}`)
    onSuccess()
    onClose()
  }

  async function handleInvite() {
    if (!email || !fullName) return
    setInviteWarning(null)
    setLoading(true)
    const { data, error } = await supabase.functions.invoke('admin-users', {
      body: { action: 'invite', email, full_name: fullName, role },
    })
    setLoading(false)
    if (error || !data?.ok) {
      if (data?.error === 'invite_failed') {
        setInviteWarning(
          "L'invitation n'a pas pu être envoyée. Vérifiez que le serveur SMTP est configuré dans Supabase Auth."
        )
      } else {
        toast(error?.message ?? "Erreur lors de l'invitation", 'error')
      }
      return
    }
    toast(`Invitation envoyée à ${email}`)
    onSuccess()
    onClose()
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Ajouter un administrateur"
    >
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
        onClick={() => { if (!loading) onClose() }}
        aria-hidden="true"
      />

      <div className="relative w-full max-w-md bg-[var(--bg-elevated)] border border-[var(--border)] rounded-[var(--r-lg)] shadow-lg flex flex-col gap-0 animate-in fade-in zoom-in-95 duration-150 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <h2 className="font-display font-semibold text-[var(--fs-h3)] text-[var(--text)]">
            Ajouter un administrateur
          </h2>
          <button
            onClick={onClose}
            disabled={loading}
            className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text)] rounded-[var(--r-md)] transition-colors disabled:opacity-40"
            aria-label="Fermer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Onglets */}
        <div className="flex border-b border-[var(--border)]">
          {(['create', 'invite'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => { setTab(t); setInviteWarning(null) }}
              className={`flex-1 py-2.5 text-[var(--fs-sm)] transition-colors -mb-px
                ${tab === t
                  ? 'text-[var(--brand)] border-b-2 border-[var(--brand)] font-medium'
                  : 'text-[var(--text-muted)] hover:text-[var(--text)]'}`}
            >
              {t === 'create' ? 'Créer un compte' : 'Inviter par email'}
            </button>
          ))}
        </div>

        {/* Formulaire */}
        <div className="p-5 flex flex-col gap-4">
          {tab === 'create' ? (
            <>
              <Field label="Nom complet *">
                <input value={fullName} onChange={e => setFullName(e.target.value)}
                  placeholder="Marie Dupont" className={inputCls} disabled={loading} />
              </Field>
              <Field label="Email *">
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="marie@exemple.fr" className={inputCls} disabled={loading} />
              </Field>
              <Field label="Mot de passe *">
                <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••" className={inputCls} disabled={loading} />
              </Field>
              <Field label="Rôle">
                <select value={role} onChange={e => setRole(e.target.value as AdminRole)}
                  className={inputCls} disabled={loading}>
                  {ROLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </Field>
            </>
          ) : (
            <>
              <Field label="Nom complet *">
                <input value={fullName} onChange={e => setFullName(e.target.value)}
                  placeholder="Marie Dupont" className={inputCls} disabled={loading} />
              </Field>
              <Field label="Email *">
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="marie@exemple.fr" className={inputCls} disabled={loading} />
              </Field>
              <Field label="Rôle">
                <select value={role} onChange={e => setRole(e.target.value as AdminRole)}
                  className={inputCls} disabled={loading}>
                  {ROLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </Field>
              <p className="text-[var(--fs-xs)] text-[var(--text-muted)]">
                Un email d'invitation sera envoyé. Requiert un SMTP configuré dans Supabase Auth.
              </p>
              {inviteWarning && (
                <p className="text-[var(--fs-xs)] text-[var(--danger,#dc2626)] bg-[var(--danger,#dc2626)]/10 px-3 py-2 rounded-[var(--r-md)]">
                  {inviteWarning}
                </p>
              )}
            </>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={onClose} disabled={loading}>Annuler</Button>
            <Button
              variant="primary"
              disabled={loading || !email || !fullName || (tab === 'create' && !password)}
              onClick={tab === 'create' ? handleCreate : handleInvite}
            >
              {loading
                ? (tab === 'create' ? 'Création…' : 'Envoi…')
                : (tab === 'create' ? 'Créer le compte' : "Envoyer l'invitation")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[var(--fs-xs)] font-medium text-[var(--text-muted)] uppercase tracking-wide">
        {label}
      </label>
      {children}
    </div>
  )
}
