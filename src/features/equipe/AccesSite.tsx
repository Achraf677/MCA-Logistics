import { useCallback, useEffect, useState } from 'react'
import { KeyRound, CheckCircle2, Ban, Link2Off, RotateCcw, Link2 } from 'lucide-react'
import { Button } from '../../shared/ui/Button'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { useToast } from '../../shared/ui/useToast'
import { useProfile } from '../../app/providers'
import { usePermissions } from '../../shared/permissions/usePermissions'
import { libelleRole } from '../../shared/permissions/roles'
import { libelleDerniereConnexion, type AccesCompte } from '../../shared/lib/adminUsers'
import {
  lireAcces, changerActif, definirMotDePasse, envoyerLienReinit, delierFiche,
} from '../../shared/lib/adminUsers.queries'
import { creerAccesSalarie, relierCompte, getComptesEtLiens } from './equipe.queries'
import {
  erreurAcces, libelleErreurAcces, comptesALier, compteDuMail, type CompteALier, type CompteSite,
} from './equipe.logic'
import type { TeamMember } from './equipe.types'

type Confirmation = 'mot_de_passe' | 'lien' | 'couper' | 'retablir' | 'delier' | 'relier'

const labelCls = 'text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide'

/**
 * Accès au site d'un membre. Fiche non reliée : deux gestes seulement —
 * 1) « Il a déjà un compte » : la liste des comptes de la société sans fiche, le plus
 *    probable en tête (même nom / e-mail), un bouton « Relier » ;
 * 2) « Créer son accès » : e-mail + mot de passe (rôle « chauffeur » : il ne voit que
 *    Mes courses, et seulement SES données).
 * Le lien (`team_members.profile_id`) est indispensable : sans lui, le salarié ne voit
 * aucune course. Réservé au président (comme l'Edge admin-users).
 */
export function AccesSite({ member, onChanged }: { member: TeamMember; onChanged: () => void }) {
  const { profile } = useProfile()
  const { isPresident } = usePermissions()
  const { toast } = useToast()
  const [email, setEmail] = useState(member.email ?? '')
  const [motDePasse, setMotDePasse] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const [acces, setAcces] = useState<AccesCompte | null>(null)
  const [accesCharge, setAccesCharge] = useState(false)
  const [accesErreur, setAccesErreur] = useState<string | null>(null)
  const [nouveauMdp, setNouveauMdp] = useState('')
  const [mdpDefini, setMdpDefini] = useState(false)
  // Fiche non reliée : comptes existants de la société (pour « Relier »).
  const [comptes, setComptes] = useState<CompteSite[] | null>(null)
  const [relies, setRelies] = useState<string[]>([])
  const [comptesErreur, setComptesErreur] = useState<string | null>(null)
  const [aRelier, setARelier] = useState<CompteALier | null>(null)

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

  useEffect(() => {
    if (relie || !isPresident) return
    let annule = false
    getComptesEtLiens().then(r => {
      if (annule) return
      setComptes(r.comptes); setRelies(r.relies)
      setComptesErreur(r.error ? r.error.message : null)
    })
    return () => { annule = true }
  }, [relie, isPresident])

  // ── Fiche non reliée ──────────────────────────────────────────────────────
  const candidats = comptes ? comptesALier(comptes, relies, member, profile?.id) : []
  const existant = comptes ? compteDuMail(comptes, email) : null
  const erreur = existant
    ? (relies.includes(existant.id)
      ? 'Cet e-mail a déjà un compte, relié à une autre fiche.'
      : 'Cet e-mail a déjà un compte : relie-le ci-dessus.')
    : erreurAcces({ email, mode: 'mot_de_passe', motDePasse })

  const creer = async () => {
    if (erreur) { toast(erreur, 'error'); return }
    setBusy(true)
    const r = await creerAccesSalarie({ teamMemberId: member.id, email, fullName: member.full_name, mode: 'mot_de_passe', motDePasse })
    setBusy(false)
    if (!r.ok) { toast(libelleErreurAcces(r.error, r.detail, r.message), 'error'); return }
    toast(`Accès créé : ${member.full_name} se connecte avec ${email.trim()} et le mot de passe donné`)
    onChanged()
  }

  const relier = async () => {
    if (!aRelier) return
    setBusy(true)
    const r = await relierCompte(aRelier.id, member.id)
    setBusy(false)
    setConfirmation(null)
    if (!r.ok) { toast(libelleErreurAcces(r.error, r.detail, r.message), 'error'); return }
    toast(aRelier.estMoi
      ? 'Fiche reliée à ton compte : tes courses apparaissent dans Mes courses'
      : `Fiche reliée : ${member.full_name} voit ses courses en se connectant avec ${aRelier.email ?? 'son compte'}`)
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
    relier: {
      titre: 'Relier ce compte à la fiche ?',
      message: aRelier
        ? `${aRelier.full_name ?? aRelier.email ?? 'Ce compte'}${aRelier.email ? ` (${aRelier.email})` : ''} sera rattaché à la fiche ${member.full_name}`
          + (aRelier.estMoi ? ' : c’est TON compte, les courses de cette fiche apparaîtront dans ton Mes courses.' : ' : il verra ses courses en se connectant.')
        : '',
      bouton: 'Relier',
      // Nom / e-mail différents de la fiche : on fait cocher, pour éviter de relier la mauvaise personne.
      coche: aRelier && !aRelier.suggere ? `Je confirme que ce compte est bien celui de ${member.full_name}` : undefined,
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
      onConfirm={() => { if (confirmation === 'relier') void relier(); else if (confirmation) void agir(confirmation) }}
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
    <div className="flex flex-col gap-5">
      {/* 1. Il a déjà un compte : un clic. */}
      <section className="flex flex-col gap-2">
        <span className={labelCls}>Il a déjà un compte ? Relie-le</span>
        {comptes == null && !comptesErreur ? (
          <p className="text-sm text-[var(--text-muted)]">Chargement des comptes…</p>
        ) : comptesErreur ? (
          <p className="text-sm text-[var(--danger)]">{comptesErreur}</p>
        ) : candidats.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">Aucun compte libre : crée-lui son accès ci-dessous.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {candidats.map(c => (
              <li key={c.id}
                className={`flex items-center gap-3 rounded-[var(--r-md)] border px-3 py-2 ${c.suggere
                  ? 'border-[var(--brand)] bg-[var(--brand-soft)]' : 'border-[var(--border)] bg-[var(--bg)]'}`}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-[var(--text)] truncate">
                    {c.full_name || c.email || 'Compte sans nom'}
                    {c.estMoi && <span className="text-[var(--text-muted)] font-normal"> (toi)</span>}
                  </p>
                  <p className="text-xs text-[var(--text-muted)] truncate">
                    {c.email ?? '—'} · {libelleRole(c.role)}{c.active === false ? ' · accès coupé' : ''}
                  </p>
                </div>
                <Button variant={c.suggere ? 'primary' : 'secondary'} size="compact" disabled={busy}
                  onClick={() => { setARelier(c); setConfirmation('relier') }}>
                  <Link2 size={14} /> Relier
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 2. Pas de compte : on le crée, avec un mot de passe à lui donner. */}
      <section className="flex flex-col gap-2 pt-4 border-t border-[var(--border)]">
        <span className={labelCls}>Pas encore de compte ? Crée son accès</span>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="field"
            placeholder="E-mail de connexion" autoComplete="off" />
          <input type="text" value={motDePasse} onChange={e => setMotDePasse(e.target.value)} className="field"
            placeholder="Mot de passe (8 caractères min.)" autoComplete="off" />
        </div>
        {existant && <p className="text-xs text-[var(--warning)]">{erreur}</p>}
        <Button variant="primary" onClick={creer} disabled={busy || !!erreur} className="self-start">
          <KeyRound size={15} /> {busy ? 'Création…' : 'Créer l’accès'}
        </Button>
        <p className="text-xs text-[var(--text-muted)]">
          Donne-lui l’e-mail et le mot de passe : il ne verra que Mes courses, et seulement ses propres données.
        </p>
      </section>
      {dialogueEl}
    </div>
  )
}
