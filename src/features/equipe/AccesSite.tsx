import { useCallback, useEffect, useState } from 'react'
import { KeyRound, CheckCircle2, Ban, Link2Off, RotateCcw } from 'lucide-react'
import { Button } from '../../shared/ui/Button'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { useToast } from '../../shared/ui/useToast'
import { useProfile } from '../../app/providers'
import { usePermissions } from '../../shared/permissions/usePermissions'
import { libelleRole } from '../../shared/permissions/roles'
import {
  confirmationMonCompte, libelleDerniereConnexion, type AccesCompte,
} from '../../shared/lib/adminUsers'
import {
  lireAcces, changerActif, definirMotDePasse, envoyerLienReinit, delierFiche,
} from '../../shared/lib/adminUsers.queries'
import { creerAccesSalarie, relierCompte } from './equipe.queries'
import { erreurAcces, libelleErreurAcces, type ModeAcces } from './equipe.logic'
import type { TeamMember } from './equipe.types'

type Confirmation = 'mot_de_passe' | 'lien' | 'couper' | 'retablir' | 'delier' | 'mon_compte'

const labelCls = 'text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide'

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
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const [acces, setAcces] = useState<AccesCompte | null>(null)
  const [accesCharge, setAccesCharge] = useState(false)
  const [accesErreur, setAccesErreur] = useState<string | null>(null)
  const [nouveauMdp, setNouveauMdp] = useState('')
  const [mdpDefini, setMdpDefini] = useState(false)

  const relie = !!member.profile_id
  const estMoi = relie && member.profile_id === profile?.id

  const charger = useCallback(async () => {
    if (!relie || !isPresident) return
    setAccesCharge(false); setAccesErreur(null)
    const r = await lireAcces(member.id)
    if (!r.ok) setAccesErreur(libelleErreurAcces(r.error, r.detail, r.message))
    else setAcces(r.access ?? null)
    setAccesCharge(true)
  }, [member.id, relie, isPresident])

  useEffect(() => { void charger() }, [charger])

  // ── Fiche non reliée ──────────────────────────────────────────────────────
  const erreur = erreurAcces({ email, mode, motDePasse })
  const niveauMonCompte = confirmationMonCompte(member.email, profile?.email)

  const creer = async () => {
    if (erreur) { toast(erreur, 'error'); return }
    setBusy(true)
    const r = await creerAccesSalarie({ teamMemberId: member.id, email, fullName: member.full_name, mode, motDePasse })
    setBusy(false)
    if (!r.ok) { toast(libelleErreurAcces(r.error, r.detail, r.message), 'error'); return }
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
    setConfirmation(null)
    if (!r.ok) { toast(libelleErreurAcces(r.error, r.detail, r.message), 'error'); return }
    toast('Fiche reliée à ton compte : tes courses apparaissent dans Mes courses')
    onChanged()
  }

  // ── Fiche reliée : actions sur le compte ─────────────────────────────────
  const agir = async (c: Confirmation) => {
    const userId = acces?.user_id ?? member.profile_id
    if (!userId) return
    setBusy(true)
    let ok = false
    if (c === 'mot_de_passe') {
      const r = await definirMotDePasse(userId, nouveauMdp.trim())
      ok = !!r.ok
      if (!ok) toast(libelleErreurAcces(r.error, r.detail, r.message), 'error')
      else { setNouveauMdp(''); setMdpDefini(true); toast('Mot de passe mis à jour') }
    } else if (c === 'lien') {
      const r = await envoyerLienReinit(userId)
      ok = !!r.ok
      if (!ok) toast(libelleErreurAcces(r.error, r.detail, r.message), 'error')
      else toast(`Lien envoyé à ${r.email ?? acces?.email ?? 'l’e-mail du compte'}`)
    } else if (c === 'couper' || c === 'retablir') {
      const r = await changerActif(userId, c === 'retablir')
      ok = !!r.ok
      if (!ok) toast(libelleErreurAcces(r.error, r.detail, r.message), 'error')
      else toast(c === 'couper' ? `Accès coupé : ${member.full_name} ne peut plus se connecter` : 'Accès rétabli')
    } else if (c === 'delier') {
      const r = await delierFiche(member.id)
      ok = !!r.ok
      if (!ok) toast(libelleErreurAcces(r.error, r.detail, r.message), 'error')
      else toast('Fiche déliée du compte de connexion')
    }
    setBusy(false)
    setConfirmation(null)
    if (ok && c === 'delier') onChanged()
    else if (ok && (c === 'couper' || c === 'retablir')) void charger()
  }

  const CONFIRMATIONS: Record<Confirmation, { titre: string; message: string; bouton: string; coche?: string }> = {
    mot_de_passe: {
      titre: 'Définir le mot de passe ?',
      message: `Le mot de passe de ${member.full_name} sera remplacé par celui saisi. Communique-le-lui : il ne sera plus affiché.`,
      bouton: 'Définir',
    },
    lien: {
      titre: 'Envoyer un lien de réinitialisation ?',
      message: `Un e-mail sera envoyé à ${acces?.email ?? 'l’adresse du compte'} pour choisir un nouveau mot de passe.`,
      bouton: 'Envoyer',
    },
    couper: {
      titre: 'Couper l’accès au site ?',
      message: `${member.full_name} ne pourra plus se connecter (sa session en cours est fermée). La fiche et son historique restent.`,
      bouton: 'Couper l’accès',
    },
    retablir: {
      titre: 'Rétablir l’accès au site ?',
      message: `${member.full_name} pourra de nouveau se connecter avec ses identifiants.`,
      bouton: 'Rétablir',
    },
    delier: {
      titre: 'Délier la fiche du compte ?',
      message: 'Le compte de connexion n’est pas supprimé, mais il ne sera plus rattaché à cette fiche : le salarié ne verra plus ses courses. Pense à couper l’accès s’il ne doit plus se connecter.',
      bouton: 'Délier',
    },
    mon_compte: niveauMonCompte === 'double'
      ? {
          titre: 'Relier cette fiche à TON compte ?',
          message: `Attention : la fiche porte l’e-mail ${member.email ?? ''}, différent du tien (${profile?.email ?? '—'}). C’est peut-être la fiche de quelqu’un d’autre : ses courses apparaîtraient dans ton Mes courses, et il ne pourrait plus avoir son propre accès.`,
          bouton: 'Relier à mon compte',
          coche: 'Je confirme que cette fiche est bien la mienne',
        }
      : {
          titre: 'Relier cette fiche à ton compte ?',
          message: `Tu te connectes déjà au site : cette fiche (${member.full_name}) sera rattachée à ton compte, et les courses qui lui sont affectées apparaîtront dans ton Mes courses.`,
          bouton: 'Relier à mon compte',
        },
  }

  const dialogue = confirmation ? CONFIRMATIONS[confirmation] : null
  const dialogueEl = (
    <ConfirmDialog
      open={!!dialogue}
      title={dialogue?.titre ?? ''}
      message={dialogue?.message ?? ''}
      confirmLabel={dialogue?.bouton}
      acknowledgeLabel={dialogue?.coche}
      onConfirm={() => { if (confirmation === 'mon_compte') void relierMoi(); else if (confirmation) void agir(confirmation) }}
      onCancel={() => setConfirmation(null)}
      loading={busy}
    />
  )

  if (relie) {
    if (!isPresident) {
      return (
        <div className="flex items-center gap-2 rounded-[var(--r-md)] bg-[var(--success)]/10 px-3 py-2.5 text-sm text-[var(--text)]">
          <CheckCircle2 size={16} className="text-[var(--success)] shrink-0" />
          {estMoi ? 'Cette fiche est reliée à ton compte.' : 'La fiche est reliée à un compte de connexion.'}
        </div>
      )
    }

    return (
      <div className="flex flex-col gap-4">
        {/* État du compte */}
        <div className="rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--bg)] p-3 flex flex-col gap-2 text-sm">
          {!accesCharge ? (
            <p className="text-[var(--text-muted)]">Chargement du compte…</p>
          ) : accesErreur ? (
            <div className="flex flex-col gap-2">
              <p className="text-[var(--danger)]">{accesErreur}</p>
              <Button variant="secondary" size="compact" onClick={() => void charger()} className="self-start">Réessayer</Button>
            </div>
          ) : !acces ? (
            <p className="text-[var(--warning)]">
              La fiche est reliée à un compte introuvable (supprimé ?). Délie-la pour pouvoir recréer un accès.
            </p>
          ) : (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
              <dt className="text-[var(--text-muted)]">E-mail</dt>
              <dd className="text-[var(--text)] break-all">{acces.email ?? '—'}</dd>
              <dt className="text-[var(--text-muted)]">Rôle</dt>
              <dd className="text-[var(--text)]">{libelleRole(acces.role)}{estMoi ? ' (ton compte)' : ''}</dd>
              <dt className="text-[var(--text-muted)]">Accès</dt>
              <dd className={acces.active ? 'text-[var(--success)] font-medium' : 'text-[var(--danger)] font-medium'}>
                {acces.active ? 'Actif' : 'Coupé'}
              </dd>
              <dt className="text-[var(--text-muted)]">Dernière connexion</dt>
              <dd className="text-[var(--text)]">{libelleDerniereConnexion(acces.last_sign_in_at)}</dd>
            </dl>
          )}
        </div>

        {/* Mot de passe et coupure : pas sur son propre compte (refusé par le serveur). */}
        {acces && !estMoi && (
          <>
            <div className="flex flex-col gap-2">
              <span className={labelCls}>Réinitialiser le mot de passe</span>
              <div className="flex flex-wrap items-center gap-2">
                <input type="text" value={nouveauMdp} onChange={e => { setNouveauMdp(e.target.value); setMdpDefini(false) }}
                  placeholder="Nouveau mot de passe (8 caractères min.)" autoComplete="off"
                  className="field flex-1 min-w-[12rem]" />
                <Button variant="secondary" onClick={() => setConfirmation('mot_de_passe')}
                  disabled={busy || nouveauMdp.trim().length < 8}>
                  <KeyRound size={15} /> Définir
                </Button>
                <Button variant="ghost" onClick={() => setConfirmation('lien')} disabled={busy || !acces.email}>
                  Envoyer un lien
                </Button>
              </div>
              {mdpDefini && (
                <p className="text-xs text-[var(--success)]">Mot de passe enregistré : communique-le, il ne sera plus affiché.</p>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {acces.active ? (
                <Button variant="secondary" onClick={() => setConfirmation('couper')} disabled={busy}
                  className="text-[var(--danger)]">
                  <Ban size={15} /> Couper l’accès
                </Button>
              ) : (
                <Button variant="secondary" onClick={() => setConfirmation('retablir')} disabled={busy}>
                  <RotateCcw size={15} /> Rétablir l’accès
                </Button>
              )}
            </div>
          </>
        )}

        {accesCharge && !accesErreur && (
          <div className="flex flex-col gap-1 pt-3 border-t border-[var(--border)]">
            <Button variant="ghost" onClick={() => setConfirmation('delier')} disabled={busy}
              className="self-start text-[var(--danger)]">
              <Link2Off size={15} /> Délier la fiche
            </Button>
            <p className="text-xs text-[var(--text-muted)]">Le compte reste ; seul le lien avec cette fiche est retiré.</p>
          </div>
        )}
        {dialogueEl}
      </div>
    )
  }

  if (!isPresident) {
    return <p className="text-sm text-[var(--text-muted)]">Pas encore d'accès au site. Seul le président peut le créer.</p>
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-[var(--text-muted)]">
        Le salarié se connectera au site sur son téléphone. Il ne verra que Mes courses, et
        uniquement ses propres données (ni salaires, ni finance, ni les autres salariés).
      </p>
      <div className="flex flex-col gap-1">
        <label className={labelCls}>E-mail de connexion</label>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="field" />
      </div>
      <div className="flex flex-wrap gap-2">
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
          <label className={labelCls}>Mot de passe (8 caractères min.)</label>
          <input type="text" value={motDePasse} onChange={e => setMotDePasse(e.target.value)} className="field" autoComplete="off" />
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={creer} disabled={busy || !!erreur}>
          <KeyRound size={15} /> {busy ? 'Création…' : 'Créer l’accès'}
        </Button>
        {/* Associé qui conduit : sa fiche se relie à SON compte, sans en créer un autre. */}
        <Button variant="secondary" onClick={() => setConfirmation('mon_compte')} disabled={busy || !profile}>
          C’est mon compte
        </Button>
      </div>
      {niveauMonCompte === 'double' && (
        <p className="text-xs text-[var(--text-muted)]">
          L’e-mail de la fiche n’est pas le tien : « C’est mon compte » demandera une double confirmation.
        </p>
      )}
      {dialogueEl}
    </div>
  )
}
