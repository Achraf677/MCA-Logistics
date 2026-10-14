import { useCallback, useEffect, useState } from 'react'
import { Ban, RotateCcw, RefreshCw, Link2, Link2Off, Trash2 } from 'lucide-react'
import { Button } from '../../shared/ui/Button'
import { BoutonIcone } from '../../shared/ui/BoutonIcone'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { Skeleton } from '../../shared/ui/Skeleton'
import { useToast } from '../../shared/ui/useToast'
import { useProfile } from '../../app/providers'
import { libelleRole } from '../../shared/permissions/roles'
import {
  changerActif, definirMotDePasse, supprimerCompte, delierFiche,
} from '../../shared/lib/adminUsers.queries'
import { getComptesEtFiches, relierCompte } from './equipe.queries'
import {
  lignesComptes, fichesLiables, libelleConnexionCompte, genererMotDePasse, libelleErreurAcces,
  type CompteConnexion, type FicheLien, type LigneCompte,
} from './equipe.logic'
import { MotDePasseUneFois } from './MotDePasseUneFois'

type TypeAction = 'couper' | 'retablir' | 'regenerer' | 'relier' | 'delier' | 'supprimer'
interface Action { type: TypeAction; ligne: LigneCompte; fiche?: FicheLien }

const COLONNES = 'md:grid md:grid-cols-[minmax(0,2.4fr)_minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,0.8fr)_minmax(0,1.3fr)_auto] md:items-center md:gap-3'

const nomDe = (c: CompteConnexion) => c.full_name || c.email || 'Compte sans nom'

/**
 * Équipe › Comptes (président seulement) : TOUS les comptes de connexion de la
 * société, reliés ou non à une fiche. Couper / rétablir, régénérer le mot de passe,
 * relier à une fiche sans compte, délier, supprimer (après avoir délié).
 * Jamais sur soi ni sur un président : le serveur refuse (anti-blocage).
 */
export function Comptes() {
  const { profile } = useProfile()
  const { toast } = useToast()
  const [comptes, setComptes] = useState<CompteConnexion[] | null>(null)
  const [fiches, setFiches] = useState<FicheLien[]>([])
  const [erreur, setErreur] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [action, setAction] = useState<Action | null>(null)
  const [relierPour, setRelierPour] = useState<string | null>(null)
  const [ficheChoisie, setFicheChoisie] = useState('')
  const [identifiants, setIdentifiants] = useState<{ titre: string; email: string | null; motDePasse: string } | null>(null)

  const charger = useCallback(async () => {
    const r = await getComptesEtFiches()
    setComptes(r.comptes); setFiches(r.fiches); setErreur(r.error)
  }, [])

  useEffect(() => { void charger() }, [charger])

  const executer = async (a: Action) => {
    setBusy(true)
    const { ligne } = a
    let r: { ok?: boolean; error?: string; detail?: string; message?: string } = { ok: false }
    let motDePasse = ''
    if (a.type === 'couper' || a.type === 'retablir') r = await changerActif(ligne.id, a.type === 'retablir')
    else if (a.type === 'regenerer') { motDePasse = genererMotDePasse(); r = await definirMotDePasse(ligne.id, motDePasse) }
    else if (a.type === 'relier' && a.fiche) r = await relierCompte(ligne.id, a.fiche.id)
    else if (a.type === 'delier' && ligne.fiche) r = await delierFiche(ligne.fiche.id)
    else if (a.type === 'supprimer') r = await supprimerCompte(ligne.id)
    setBusy(false)
    setAction(null)
    if (!r.ok) { toast(libelleErreurAcces(r.error, r.detail, r.message), 'error'); return }
    const nom = nomDe(ligne)
    if (a.type === 'regenerer') {
      setIdentifiants({ titre: `Nouveau mot de passe de ${nom}`, email: ligne.email, motDePasse })
      toast('Mot de passe remplacé')
    } else {
      toast({
        couper: `Accès coupé : ${nom} ne peut plus se connecter`,
        retablir: `Accès rétabli : ${nom}`,
        relier: `${nom} relié à la fiche ${a.fiche?.full_name ?? ''}`,
        delier: `${nom} délié de sa fiche (le compte reste)`,
        supprimer: `Compte ${nom} supprimé`,
        regenerer: '',
      }[a.type])
    }
    setRelierPour(null); setFicheChoisie('')
    void charger()
  }

  const confirmation = (a: Action): { titre: string; message: string; bouton: string; coche?: string } => {
    const nom = nomDe(a.ligne)
    switch (a.type) {
      case 'couper': return {
        titre: 'Couper l’accès ?', bouton: 'Couper l’accès',
        message: `${nom} ne pourra plus se connecter (sa session en cours expire). Le compte et sa fiche restent.`,
      }
      case 'retablir': return {
        titre: 'Rétablir l’accès ?', bouton: 'Rétablir',
        message: `${nom} pourra de nouveau se connecter avec ses identifiants.`,
      }
      case 'regenerer': return {
        titre: 'Régénérer le mot de passe ?', bouton: 'Régénérer',
        message: `L’ancien mot de passe de ${nom} ne marchera plus. Le nouveau sera affiché une seule fois.`,
      }
      case 'relier': return {
        titre: 'Relier ce compte à la fiche ?', bouton: 'Relier',
        message: `${nom}${a.ligne.email ? ` (${a.ligne.email})` : ''} sera rattaché à la fiche ${a.fiche?.full_name ?? ''} : il verra les courses de cette fiche.`,
      }
      case 'delier': return {
        titre: 'Délier le compte de sa fiche ?', bouton: 'Délier',
        message: `${nom} ne sera plus rattaché à la fiche ${a.ligne.fiche?.full_name ?? ''} : il ne verra plus ses courses. Le compte n’est pas supprimé.`,
      }
      case 'supprimer': return {
        titre: 'Supprimer le compte ?', bouton: 'Supprimer définitivement',
        message: `Le compte de connexion de ${nom}${a.ligne.email ? ` (${a.ligne.email})` : ''} sera supprimé : il ne pourra plus se connecter et ce n’est pas réversible.`,
        coche: `Je confirme la suppression du compte de ${nom}`,
      }
    }
  }

  if (comptes == null) {
    return <div className="flex flex-col gap-2">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-12" />)}</div>
  }

  const lignes = lignesComptes(comptes, fiches, profile?.id)
  const dialogue = action ? confirmation(action) : null

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-[var(--text-muted)]">
        Tous les comptes de connexion de la société ({lignes.length}). Un salarié = un compte, relié à sa fiche Équipe.
      </p>
      {erreur && <p className="text-sm text-[var(--danger)]">{erreur}</p>}
      {identifiants && <MotDePasseUneFois {...identifiants} onFermer={() => setIdentifiants(null)} />}

      <div className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg-card)] md:max-h-[calc(100vh-16rem)] md:overflow-y-auto">
        <div className={`hidden ${COLONNES} px-3 py-2 border-b border-[var(--border)] text-xs font-medium uppercase tracking-wide text-[var(--text-muted)] sticky top-0 bg-[var(--bg-card)]`}>
          <span>Compte</span><span>Rôle</span><span>Fiche</span><span>Accès</span><span>Dernière connexion</span>
          <span className="w-[8.5rem] text-right">Gestes</span>
        </div>
        {lignes.length === 0 && <p className="px-3 py-6 text-sm text-center text-[var(--text-muted)]">Aucun compte.</p>}
        {lignes.map(l => {
          const liables = relierPour === l.id ? fichesLiables(l, fiches) : []
          return (
            <div key={l.id} className="border-b border-[var(--border)] last:border-b-0">
              <div className={`flex flex-col gap-1.5 px-3 py-2.5 ${COLONNES}`}>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[var(--text)] truncate">
                    {nomDe(l)}{l.estMoi && <span className="font-normal text-[var(--text-muted)]"> (toi)</span>}
                  </p>
                  <p className="text-xs text-[var(--text-muted)] break-all">{l.email ?? '—'}</p>
                </div>
                <span className="text-sm text-[var(--text)]">{libelleRole(l.role)}</span>
                <span className={`text-sm truncate ${l.fiche ? 'text-[var(--text)]' : 'text-[var(--warning)]'}`}>
                  {l.fiche ? l.fiche.full_name : 'Sans fiche'}
                </span>
                <span className={`text-sm font-medium ${l.active === false ? 'text-[var(--danger)]' : 'text-[var(--success)]'}`}>
                  {l.active === false ? 'Coupé' : 'Actif'}
                </span>
                <span className="text-xs text-[var(--text-muted)]">
                  <span className="md:hidden">Dernière connexion : </span>{libelleConnexionCompte(l.last_sign_in_at)}
                </span>
                <div className="flex items-center gap-1.5 md:w-[8.5rem] md:justify-end">
                  {l.modifiable && (l.active === false
                    ? <BoutonIcone icone={RotateCcw} libelle="Rétablir l’accès" taille="sm" disabled={busy}
                        onClick={() => setAction({ type: 'retablir', ligne: l })} />
                    : <BoutonIcone icone={Ban} libelle="Couper l’accès" taille="sm" disabled={busy}
                        onClick={() => setAction({ type: 'couper', ligne: l })} />)}
                  {l.modifiable && (
                    <BoutonIcone icone={RefreshCw} libelle="Régénérer le mot de passe" taille="sm" disabled={busy}
                      onClick={() => setAction({ type: 'regenerer', ligne: l })} />
                  )}
                  {l.fiche
                    ? <BoutonIcone icone={Link2Off} libelle={`Délier de la fiche ${l.fiche.full_name}`} taille="sm" disabled={busy}
                        onClick={() => setAction({ type: 'delier', ligne: l })} />
                    : <BoutonIcone icone={Link2} libelle="Relier à une fiche" taille="sm" disabled={busy}
                        actif={relierPour === l.id}
                        onClick={() => { setRelierPour(relierPour === l.id ? null : l.id); setFicheChoisie('') }} />}
                  {l.modifiable && (
                    <BoutonIcone icone={Trash2} taille="sm" disabled={busy || !!l.fiche}
                      libelle={l.fiche ? `Supprimer : délie d’abord la fiche ${l.fiche.full_name}` : 'Supprimer le compte'}
                      onClick={() => setAction({ type: 'supprimer', ligne: l })} />
                  )}
                  {!l.modifiable && (
                    <span className="text-xs text-[var(--text-disabled)]" title={l.estMoi
                      ? 'On ne coupe pas son propre compte' : 'Compte président : non modifiable ici'}>
                      {l.estMoi ? 'Ton compte' : 'Président'}
                    </span>
                  )}
                </div>
              </div>

              {relierPour === l.id && (
                <div className="flex flex-wrap items-center gap-2 px-3 pb-3">
                  {liables.length === 0 ? (
                    <p className="text-xs text-[var(--text-muted)]">
                      {l.role === 'president'
                        ? 'Aucune fiche sans compte à son nom : un compte président ne se relie qu’à sa propre fiche.'
                        : 'Toutes les fiches ont déjà un compte.'}
                    </p>
                  ) : (
                    <>
                      <select value={ficheChoisie} onChange={e => setFicheChoisie(e.target.value)}
                        className="field flex-1 min-w-[12rem]" aria-label="Fiche à relier">
                        <option value="">Choisir une fiche sans compte…</option>
                        {liables.map(f => (
                          <option key={f.id} value={f.id}>{f.full_name}{f.active === false ? ' (inactif)' : ''}</option>
                        ))}
                      </select>
                      <Button variant="primary" size="compact" disabled={busy || !ficheChoisie}
                        onClick={() => {
                          const fiche = liables.find(f => f.id === ficheChoisie)
                          if (fiche) setAction({ type: 'relier', ligne: l, fiche })
                        }}>
                        <Link2 size={14} /> Relier
                      </Button>
                    </>
                  )}
                  <Button variant="ghost" size="compact" onClick={() => setRelierPour(null)}>Annuler</Button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <ConfirmDialog
        open={!!dialogue}
        title={dialogue?.titre ?? ''}
        message={dialogue?.message ?? ''}
        confirmLabel={dialogue?.bouton}
        acknowledgeLabel={dialogue?.coche}
        onConfirm={() => { if (action) void executer(action) }}
        onCancel={() => setAction(null)}
        loading={busy}
      />
    </div>
  )
}
