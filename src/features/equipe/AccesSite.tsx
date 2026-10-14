import { useCallback, useEffect, useState } from 'react'
import { KeyRound, CheckCircle2, Ban, Link2Off, RotateCcw, RefreshCw, Mail } from 'lucide-react'
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
import { creerAccesSalarie, relierCompte, getComptesEtFiches, enregistrerEmailFiche } from './equipe.queries'
import {
  decisionDonnerAcces, genererMotDePasse, libelleErreurAcces, type CompteConnexion, type FicheLien,
} from './equipe.logic'
import { MotDePasseUneFois } from './MotDePasseUneFois'
import type { TeamMember } from './equipe.types'

type Confirmation = 'regenerer' | 'mot_de_passe' | 'lien' | 'couper' | 'retablir' | 'delier'

const labelCls = 'text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide'

/**
 * Accès au site d'un membre — « un salarié = un compte ». Réservé au président
 * (comme l'Edge admin-users).
 * - Fiche non reliée : un e-mail, un bouton « Donner l'accès ». Compte de la société
 *   avec cet e-mail et sans fiche → relié ; relié à une autre fiche → on le dit ;
 *   sinon → compte « chauffeur » créé avec un mot de passe généré, affiché une fois.
 * - Fiche reliée : état du compte, régénérer le mot de passe, lien par e-mail,
 *   couper / rétablir, délier.
 * Le lien (`team_members.profile_id`) est indispensable : sans lui, le salarié ne voit
 * aucune course.
 */
export function AccesSite({ member, onChanged }: {
  member: TeamMember
  /** Liste à recharger ; `email` = e-mail enregistré sur la fiche à l'instant. */
  onChanged: (maj?: { email?: string }) => void
}) {
  const { profile } = useProfile()
  const { isPresident } = usePermissions()
  const { toast } = useToast()
  // Lien fiche ↔ compte : `undefined` = celui de la fiche reçue ; sinon ce qui vient d'être fait ici
  // (le tiroir reste ouvert, le mot de passe généré doit rester visible).
  const [lienLocal, setLienLocal] = useState<string | null | undefined>(undefined)
  const profileId = lienLocal === undefined ? member.profile_id : lienLocal
  const relie = !!profileId
  const estMoi = relie && profileId === profile?.id

  const [email, setEmail] = useState(member.email ?? '')
  const [busy, setBusy] = useState(false)
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const [identifiants, setIdentifiants] = useState<{ titre: string; email: string | null; motDePasse: string } | null>(null)
  // Fiche reliée
  const [acces, setAcces] = useState<AccesCompte | null>(null)
  const [accesCharge, setAccesCharge] = useState(false)
  const [accesErreur, setAccesErreur] = useState<string | null>(null)
  const [mdpTape, setMdpTape] = useState('')
  // Fiche non reliée : comptes de la société et fiches (pour trouver le compte de l'e-mail)
  const [comptes, setComptes] = useState<CompteConnexion[] | null>(null)
  const [fiches, setFiches] = useState<FicheLien[]>([])
  const [comptesErreur, setComptesErreur] = useState<string | null>(null)

  const charger = useCallback(async () => {
    if (!profileId || !isPresident) return
    setAccesCharge(false); setAccesErreur(null)
    const r = await lireAcces(member.id)
    if (!r.ok) setAccesErreur(libelleErreurAcces(r.error, r.detail, r.message))
    else setAcces(r.access ?? null)
    setAccesCharge(true)
  }, [member.id, profileId, isPresident])

  useEffect(() => { void charger() }, [charger])

  useEffect(() => {
    if (relie || !isPresident) return
    let annule = false
    getComptesEtFiches().then(r => {
      if (annule) return
      setComptes(r.comptes); setFiches(r.fiches); setComptesErreur(r.error)
    })
    return () => { annule = true }
  }, [relie, isPresident])

  /** La fiche n'avait pas d'e-mail : on y enregistre celui de l'accès. */
  const memoriserEmail = async (mail: string): Promise<string | undefined> => {
    if (member.email?.trim()) return undefined
    const { error } = await enregistrerEmailFiche(member.id, mail)
    return error ? undefined : mail
  }

  // ── Fiche non reliée : « Donner l'accès » ──────────────────────────────────
  const decision = comptes ? decisionDonnerAcces(email, member, comptes, fiches) : null

  const donnerAcces = async () => {
    if (!decision) return
    if (decision.type === 'invalide') { toast(decision.message, 'error'); return }
    if (decision.type === 'relie_ailleurs' || decision.type === 'president') return
    const mail = email.trim().toLowerCase()
    setBusy(true)
    if (decision.type === 'relier') {
      const r = await relierCompte(decision.compte.id, member.id)
      if (!r.ok) { setBusy(false); toast(libelleErreurAcces(r.error, r.detail, r.message), 'error'); return }
      const memo = await memoriserEmail(mail)
      setBusy(false)
      setLienLocal(decision.compte.id)
      toast(decision.compte.id === profile?.id
        ? 'Fiche reliée à ton compte : tes courses apparaissent dans Mes courses'
        : `Accès donné : ${member.full_name} se connecte avec ${mail} et son mot de passe actuel`)
      onChanged({ email: memo })
      return
    }
    // Nouveau compte, mot de passe généré
    const motDePasse = genererMotDePasse()
    const r = await creerAccesSalarie({ teamMemberId: member.id, email: mail, fullName: member.full_name, motDePasse })
    if (!r.ok) { setBusy(false); toast(libelleErreurAcces(r.error, r.detail, r.message), 'error'); return }
    const memo = await memoriserEmail(mail)
    setBusy(false)
    setIdentifiants({ titre: `Accès créé pour ${member.full_name}`, email: mail, motDePasse })
    setLienLocal(typeof r.user_id === 'string' ? r.user_id : null)
    toast('Accès créé : transmets l’e-mail et le mot de passe')
    onChanged({ email: memo })
  }

  // ── Fiche reliée : actions sur le compte ─────────────────────────────────
  const agir = async (c: Confirmation) => {
    const userId = acces?.user_id ?? profileId
    if (!userId) return
    setBusy(true)
    let ok = false
    if (c === 'regenerer' || c === 'mot_de_passe') {
      const motDePasse = c === 'regenerer' ? genererMotDePasse() : mdpTape.trim()
      const r = await definirMotDePasse(userId, motDePasse)
      ok = !!r.ok
      if (!ok) toast(libelleErreurAcces(r.error, r.detail, r.message), 'error')
      else {
        setMdpTape('')
        setIdentifiants({ titre: `Nouveau mot de passe de ${member.full_name}`, email: acces?.email ?? null, motDePasse })
        toast('Mot de passe remplacé')
      }
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
      else toast('Fiche déliée du compte de connexion (le compte reste, voir Équipe › Comptes)')
    }
    setBusy(false)
    setConfirmation(null)
    if (ok && c === 'delier') {
      setAcces(null); setIdentifiants(null); setLienLocal(null)
      onChanged()
    } else if (ok && (c === 'couper' || c === 'retablir')) void charger()
  }

  const CONFIRMATIONS: Record<Confirmation, { titre: string; message: string; bouton: string }> = {
    regenerer: {
      titre: 'Régénérer le mot de passe ?',
      message: `L’ancien mot de passe de ${member.full_name} ne marchera plus. Le nouveau sera affiché une seule fois.`,
      bouton: 'Régénérer',
    },
    mot_de_passe: {
      titre: 'Définir ce mot de passe ?',
      message: `Le mot de passe de ${member.full_name} sera remplacé par celui saisi.`,
      bouton: 'Définir',
    },
    lien: {
      titre: 'Envoyer un lien de réinitialisation ?',
      message: `Un e-mail sera envoyé à ${acces?.email ?? 'l’adresse du compte'} pour choisir un nouveau mot de passe.`,
      bouton: 'Envoyer',
    },
    couper: {
      titre: 'Couper l’accès au site ?',
      message: `${member.full_name} ne pourra plus se connecter (sa session en cours expire). La fiche et son historique restent.`,
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
  }

  const dialogue = confirmation ? CONFIRMATIONS[confirmation] : null
  const dialogueEl = (
    <ConfirmDialog
      open={!!dialogue}
      title={dialogue?.titre ?? ''}
      message={dialogue?.message ?? ''}
      confirmLabel={dialogue?.bouton}
      onConfirm={() => { if (confirmation) void agir(confirmation) }}
      onCancel={() => setConfirmation(null)}
      loading={busy}
    />
  )
  const identifiantsEl = identifiants && (
    <MotDePasseUneFois {...identifiants} onFermer={() => setIdentifiants(null)} />
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

    const comptePresident = acces?.role === 'president'
    return (
      <div className="flex flex-col gap-4">
        {identifiantsEl}

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
              La fiche est reliée à un compte introuvable (supprimé ?). Délie-la pour pouvoir redonner un accès.
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

        {/* Mot de passe et coupure : refusés par le serveur sur son propre compte et sur un président. */}
        {acces && (estMoi || comptePresident) && (
          <p className="text-xs text-[var(--text-muted)]">
            {estMoi
              ? 'C’est ton compte : on ne coupe pas son propre accès, et ton mot de passe se change par « Mot de passe oublié » à la connexion.'
              : 'Compte président : son mot de passe et son accès ne se modifient pas ici.'}
          </p>
        )}
        {acces && !estMoi && !comptePresident && (
          <>
            <div className="flex flex-col gap-2">
              <span className={labelCls}>Mot de passe</span>
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" onClick={() => setConfirmation('regenerer')} disabled={busy}>
                  <RefreshCw size={15} /> Régénérer le mot de passe
                </Button>
                <Button variant="ghost" onClick={() => setConfirmation('lien')} disabled={busy || !acces.email}>
                  <Mail size={15} /> Envoyer un lien
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input type="text" value={mdpTape} onChange={e => setMdpTape(e.target.value)}
                  placeholder="Ou en taper un (8 caractères min.)" autoComplete="off"
                  className="field flex-1 min-w-[12rem]" />
                <Button variant="secondary" onClick={() => setConfirmation('mot_de_passe')}
                  disabled={busy || mdpTape.trim().length < 8}>
                  <KeyRound size={15} /> Définir
                </Button>
              </div>
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
    return <p className="text-sm text-[var(--text-muted)]">Pas encore d'accès au site. Seul le président peut le donner.</p>
  }

  const compteTrouve = decision && (decision.type === 'relier' || decision.type === 'relie_ailleurs' || decision.type === 'president')
    ? decision.compte : null
  const bloque = !decision || decision.type === 'relie_ailleurs' || decision.type === 'president'

  return (
    <div className="flex flex-col gap-3">
      {identifiantsEl}
      <label className="flex flex-col gap-1">
        <span className={labelCls}>E-mail</span>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="field"
          placeholder="E-mail de connexion du salarié" autoComplete="off" />
      </label>

      {comptes == null ? (
        <p className="text-xs text-[var(--text-muted)]">Recherche des comptes existants…</p>
      ) : (
        <>
          {comptesErreur && (
            <p className="text-xs text-[var(--warning)]">
              Comptes existants illisibles ({comptesErreur}) : un e-mail déjà inscrit sera refusé par le serveur.
            </p>
          )}
          {decision?.type === 'relier' && (
            <p className="text-xs text-[var(--text)]">
              Compte existant : {compteTrouve?.full_name || compteTrouve?.email} ({libelleRole(compteTrouve?.role ?? null)}
              {compteTrouve?.active === false ? ', accès coupé : rétablis-le ensuite' : ''}). Il sera relié à cette fiche,
              son mot de passe ne change pas.
            </p>
          )}
          {decision?.type === 'relie_ailleurs' && (
            <p className="text-xs text-[var(--danger)]">
              Cet e-mail a déjà un compte, relié à la fiche « {decision.fiche} ». Délie-le d’abord (fiche « {decision.fiche} » › Accès au site, ou Équipe › Comptes).
            </p>
          )}
          {decision?.type === 'president' && (
            <p className="text-xs text-[var(--danger)]">
              Cet e-mail est celui d’un compte président : il ne se relie qu’à sa propre fiche (même e-mail ou même nom).
            </p>
          )}
          {decision?.type === 'creer' && (
            <p className="text-xs text-[var(--text-muted)]">
              Nouveau compte « Chauffeur » : un mot de passe est généré et affiché une fois. Il ne verra que Mes courses, et seulement ses données.
            </p>
          )}
        </>
      )}

      <Button variant="primary" onClick={() => void donnerAcces()} disabled={busy || bloque} className="self-start">
        <KeyRound size={15} /> {busy ? 'En cours…' : 'Donner l’accès'}
      </Button>
      {dialogueEl}
    </div>
  )
}
