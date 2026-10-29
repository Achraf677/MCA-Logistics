import { useState, useEffect } from 'react'
import { Dices } from 'lucide-react'
import { creerCompte } from '../../shared/lib/adminUsers.queries'
import { libelleErreurAdmin } from '../../shared/lib/adminUsers'
import { useToast } from '../../shared/ui/useToast'
import { Button } from '../../shared/ui/Button'
import { Drawer } from '../../shared/ui/Drawer'
import { Bloc, Champ } from '../../shared/ui/FicheSaisie'
import { ListeDeroulante } from '../../shared/ui/ListeDeroulante'
import { ROLE_OPTIONS } from './admins.types'
import type { AdminRole } from './admins.types'
import { genererMotDePasse } from './admins.logic'

interface Props {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

type Mode = 'mot_de_passe' | 'invitation'

export function DrawerAjoutAdmin({ open, onClose, onSuccess }: Props) {
  const { toast } = useToast()
  const [mode, setMode] = useState<Mode>('mot_de_passe')
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<AdminRole>('admin')
  const [loading, setLoading] = useState(false)
  const [inviteWarning, setInviteWarning] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setMode('mot_de_passe'); setEmail(''); setFullName(''); setPassword(''); setRole('admin'); setInviteWarning(null)
    }
  }, [open])

  const manque = !fullName.trim() ? 'le nom' : !email.trim() ? "l'e-mail" : mode === 'mot_de_passe' && password.length < 8 ? 'un mot de passe de 8 caractères minimum' : null

  async function handleSubmit() {
    if (manque) return
    setInviteWarning(null)
    setLoading(true)
    const r = await creerCompte(mode === 'mot_de_passe'
      ? { mode, email, fullName, motDePasse: password, role }
      : { mode, email, fullName, role })
    setLoading(false)
    if (!r.ok) {
      if (mode === 'invitation' && r.error === 'invite_failed' && !libelleErreurAdmin(r).includes('déjà un compte')) {
        setInviteWarning("L'invitation n'a pas pu être envoyée. Vérifie que le serveur d'e-mails (SMTP) est configuré dans Supabase Auth.")
      } else {
        toast(libelleErreurAdmin(r), 'error')
      }
      return
    }
    toast(mode === 'mot_de_passe' ? `Compte créé pour ${fullName}` : `Invitation envoyée à ${email}`)
    onSuccess()
    onClose()
  }

  return (
    <Drawer open={open} onClose={() => { if (!loading) onClose() }} title="Ajouter un compte du bureau" width="max-w-lg">
      <div className="flex flex-col gap-4 min-h-full">
        <p className="text-xs text-[var(--text-muted)]">
          Pour un salarié (livreur), crée son accès depuis sa fiche Équipe › Accès : le compte y est relié à sa fiche et cloisonné.
        </p>

        <div role="tablist" aria-label="Mode de création" className="grid grid-cols-2 gap-1 p-1 rounded-[var(--r-md)] bg-[var(--bg-card)] border border-[var(--border)]">
          {([['mot_de_passe', 'Mot de passe'], ['invitation', 'Invitation par e-mail']] as [Mode, string][]).map(([m, l]) => (
            <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => { setMode(m); setInviteWarning(null) }}
              className={`py-1.5 text-sm rounded-[var(--r-sm)] transition-colors ${mode === m ? 'bg-[var(--brand)]/15 text-[var(--brand)] font-medium' : 'text-[var(--text-muted)] hover:text-[var(--text)]'}`}>
              {l}
            </button>
          ))}
        </div>

        <Bloc titre="Le compte">
          <Champ label="Nom complet" requis>
            <input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Marie Dupont" className="field" disabled={loading} />
          </Champ>
          <Champ label="E-mail" requis>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="marie@exemple.fr" className="field" disabled={loading} />
          </Champ>
          <Champ label="Rôle">
            <ListeDeroulante ariaLabel="Rôle" valeur={role} recherche={false} disabled={loading} onChange={v => setRole(v as AdminRole)}
              options={ROLE_OPTIONS.map(o => ({ valeur: o.value, libelle: o.label }))} />
          </Champ>
          {mode === 'mot_de_passe' ? (
            <Champ label="Mot de passe" requis>
              <div className="flex gap-2">
                <input type="text" autoComplete="off" value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="8 caractères minimum" className="field flex-1" disabled={loading} />
                <Button variant="secondary" onClick={() => setPassword(genererMotDePasse())} disabled={loading} title="Générer un mot de passe">
                  <Dices size={14} /> Générer
                </Button>
              </div>
              <span className="text-xs text-[var(--text-muted)]">Visible ici seulement : note-le pour le communiquer, il ne sera plus affiché ensuite.</span>
            </Champ>
          ) : (
            <p className="text-xs text-[var(--text-muted)]">Un e-mail d'invitation sera envoyé : la personne choisit son mot de passe.</p>
          )}
          {inviteWarning && <p className="text-xs text-[var(--danger)] bg-[var(--danger)]/10 px-3 py-2 rounded-[var(--r-md)]">{inviteWarning}</p>}
        </Bloc>

        <div className="sticky bottom-0 -mx-5 -mb-5 mt-auto border-t border-[var(--border)] bg-[var(--bg-elevated)] px-5 py-3 flex items-center gap-2">
          <span className="text-xs text-[var(--text-muted)] flex-1">{manque ? `Il manque ${manque}.` : 'Prêt à créer.'}</span>
          <Button variant="secondary" className="min-h-10" onClick={onClose} disabled={loading}>Annuler</Button>
          <Button variant="primary" className="min-h-10" disabled={loading || !!manque} onClick={handleSubmit}>
            {loading ? (mode === 'mot_de_passe' ? 'Création…' : 'Envoi…') : (mode === 'mot_de_passe' ? 'Créer le compte' : "Envoyer l'invitation")}
          </Button>
        </div>
      </div>
    </Drawer>
  )
}
