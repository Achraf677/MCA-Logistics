import { useState } from 'react'
import { KeyRound, CheckCircle2 } from 'lucide-react'
import { Button } from '../../shared/ui/Button'
import { useToast } from '../../shared/ui/useToast'
import { useProfile } from '../../app/providers'
import { usePermissions } from '../../shared/permissions/usePermissions'
import { creerAccesSalarie, relierCompte } from './equipe.queries'
import { erreurAcces, libelleErreurAcces, type ModeAcces } from './equipe.logic'
import type { TeamMember } from './equipe.types'

/**
 * Accès au site d'un membre (lot S0). Le compte créé a le rôle « chauffeur » : il ne
 * voit que Mes courses, et seulement SES données (cloisonnement en base). Il est relié
 * à la fiche (`team_members.profile_id`), sans quoi le salarié ne verrait aucune course.
 * Réservé au président (comme l'Edge admin-users).
 */
export function AccesSite({ member, onChanged }: { member: TeamMember; onChanged: () => void }) {
  const { profile } = useProfile()
  const { isPresident } = usePermissions()
  const { toast } = useToast()
  const [email, setEmail] = useState(member.email ?? '')
  const [mode, setMode] = useState<ModeAcces>('mot_de_passe')
  const [motDePasse, setMotDePasse] = useState('')
  const [busy, setBusy] = useState(false)

  if (member.profile_id) {
    return (
      <div className="flex items-center gap-2 rounded-[var(--r-md)] bg-[var(--success)]/10 px-3 py-2.5 text-sm text-[var(--text)]">
        <CheckCircle2 size={16} className="text-[var(--success)] shrink-0" />
        {member.profile_id === profile?.id
          ? 'Cette fiche est reliée à ton compte.'
          : 'Accès créé : la fiche est reliée à un compte de connexion.'}
      </div>
    )
  }

  if (!isPresident) {
    return <p className="text-sm text-[var(--text-muted)]">Pas encore d'accès au site. Seul le président peut le créer.</p>
  }

  const erreur = erreurAcces({ email, mode, motDePasse })

  const creer = async () => {
    if (erreur) { toast(erreur, 'error'); return }
    setBusy(true)
    const r = await creerAccesSalarie({ teamMemberId: member.id, email, fullName: member.full_name, mode, motDePasse })
    setBusy(false)
    if (!r.ok) { toast(libelleErreurAcces(r.error, r.detail), 'error'); return }
    toast(mode === 'mot_de_passe'
      ? `Accès créé : ${member.full_name} se connecte avec ${email.trim()} et le mot de passe donné`
      : `Invitation envoyée à ${email.trim()}`)
    onChanged()
  }

  const relierMoi = async () => {
    if (!profile) return
    setBusy(true)
    const r = await relierCompte(profile.id, member.id)
    setBusy(false)
    if (!r.ok) { toast(libelleErreurAcces(r.error, r.detail), 'error'); return }
    toast('Fiche reliée à ton compte : tes courses apparaissent dans Mes courses')
    onChanged()
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-[var(--text-muted)]">
        Le salarié se connectera au site sur son téléphone. Il ne verra que Mes courses, et
        uniquement ses propres données (ni salaires, ni finance, ni les autres salariés).
      </p>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide">E-mail de connexion</label>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="field" />
      </div>
      <div className="flex gap-2">
        {(['mot_de_passe', 'invitation'] as const).map(m => (
          <button key={m} type="button" onClick={() => setMode(m)}
            className={`px-3 py-1.5 text-sm rounded-[var(--r-md)] border transition-colors ${mode === m
              ? 'border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand)] font-medium'
              : 'border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--bg-card-hover)]'}`}>
            {m === 'mot_de_passe' ? 'Je donne un mot de passe' : 'Invitation par e-mail'}
          </button>
        ))}
      </div>
      {mode === 'mot_de_passe' && (
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide">Mot de passe (8 caractères min.)</label>
          <input type="text" value={motDePasse} onChange={e => setMotDePasse(e.target.value)} className="field" autoComplete="off" />
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={creer} disabled={busy || !!erreur}>
          <KeyRound size={15} /> {busy ? 'Création…' : 'Créer l’accès'}
        </Button>
        {/* Associé qui conduit : sa fiche se relie à SON compte, sans en créer un autre. */}
        <Button variant="secondary" onClick={relierMoi} disabled={busy}>C’est mon compte</Button>
      </div>
    </div>
  )
}
