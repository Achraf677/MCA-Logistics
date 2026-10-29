import { useCallback, useEffect, useMemo, useState } from 'react'
import { CreditCard, Fuel, Pencil, Plus, Power, Trash2 } from 'lucide-react'
import { Shell } from '../../app/Shell'
import { useProfile } from '../../app/providers'
import { Badge } from '../../shared/ui/Badge'
import { BoutonIcone } from '../../shared/ui/BoutonIcone'
import { Button } from '../../shared/ui/Button'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { Drawer } from '../../shared/ui/Drawer'
import { EmptyState } from '../../shared/ui/EmptyState'
import { Champ } from '../../shared/ui/FicheSaisie'
import { ListeDeroulante } from '../../shared/ui/ListeDeroulante'
import { Skeleton } from '../../shared/ui/Skeleton'
import { useToast } from '../../shared/ui/useToast'
import { usePermissions } from '../../shared/permissions/usePermissions'
import { toLocalISO } from '../../shared/lib/dates'
import {
  LIBELLE_TYPE_CARTE, carteSupprimable, libelleCarteBancaire, manquesCarte, nouveauCodeCarte, statutCarte,
  type CarteBancaire, type SaisieCarte, type StatutCarte, type TypeCarte, type UsageCarte,
} from '../../shared/lib/cartesBancaires'
import { creerCarte, listerCartes, modifierCarte, supprimerCarte, usageCartes } from '../../shared/lib/cartesBancaires.queries'
import { rechargerCartes } from '../../shared/lib/useCartesBancaires'

const jourFr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`

function EtatCarte({ c, aujourdhui }: { c: CarteBancaire; aujourdhui: string }) {
  const s: StatutCarte = statutCarte(c, aujourdhui)
  if (s === 'programmee') return <Badge color="info">Active dès le {jourFr(c.actif_a_partir_du!)}</Badge>
  if (s === 'inactive') return <Badge color="muted">Inactive depuis le {jourFr(c.inactif_a_partir_du!)}</Badge>
  if (c.inactif_a_partir_du) return <Badge color="warning">Active jusqu’au {jourFr(c.inactif_a_partir_du)}</Badge>
  return <Badge color="success">Active</Badge>
}

/**
 * Système › Cartes bancaires : la liste des cartes proposées aux salariés (dépenses) et au bureau (justificatifs, pleins).
 * Une carte se crée, se modifie, s'active / se désactive À PARTIR D'UNE DATE (les dépenses plus anciennes gardent leur carte),
 * et ne se supprime que si aucun montant n'a été saisi dessus.
 */
export function CartesBancaires() {
  const { toast } = useToast()
  const { can } = usePermissions()
  const { companyId } = useProfile()
  const peutEcrire = can('systeme.parametres', 'update')
  const aujourdhui = toLocalISO(new Date())

  const [cartes, setCartes] = useState<CarteBancaire[]>([])
  const [usage, setUsage] = useState<Record<string, UsageCarte>>({})
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)
  const [fiche, setFiche] = useState<{ carte: CarteBancaire | null } | null>(null)
  const [aSupprimer, setASupprimer] = useState<CarteBancaire | null>(null)
  const [busy, setBusy] = useState(false)

  const charger = useCallback(async () => {
    const [{ data, error }, u] = await Promise.all([listerCartes(), usageCartes()])
    setErreur(error ? error.message : null)
    setCartes(data ?? [])
    setUsage(u)
    setChargement(false)
  }, [])
  useEffect(() => { void charger() }, [charger])

  const apresModif = async () => {
    await Promise.all([charger(), rechargerCartes()])
  }

  const groupes = useMemo(() => (['societe', 'carburant'] as TypeCarte[]).map(type => ({
    type, cartes: cartes.filter(c => c.type === type),
  })), [cartes])

  const basculer = async (c: CarteBancaire) => {
    // Inactive aujourd'hui → on la réactive ; sinon on la désactive à partir d'aujourd'hui.
    const inactive = statutCarte(c, aujourdhui) === 'inactive'
    setBusy(true)
    const { error } = await modifierCarte(c.id, {
      nom: c.nom, fin: c.fin,
      actif_a_partir_du: c.actif_a_partir_du ?? '',
      inactif_a_partir_du: inactive ? '' : aujourdhui,
    })
    setBusy(false)
    if (error) { toast(error.message, 'error'); return }
    toast(inactive ? 'Carte réactivée' : 'Carte désactivée à partir d’aujourd’hui')
    await apresModif()
  }

  const supprimer = async () => {
    if (!aSupprimer) return
    setBusy(true)
    const { error } = await supprimerCarte(aSupprimer.id)
    setBusy(false)
    setASupprimer(null)
    if (error) { toast(error.message, 'error'); return }
    toast('Carte supprimée')
    await apresModif()
  }

  return (
    <Shell pageTitle="Cartes bancaires">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-[var(--text-muted)] flex-1 min-w-[16rem]">
            Les cartes proposées dans les dépenses et les justificatifs. Désactive une carte à partir d’une date : les anciennes dépenses la gardent.
          </p>
          {peutEcrire && <Button variant="primary" onClick={() => setFiche({ carte: null })}><Plus size={15} /> Ajouter une carte</Button>}
        </div>

        {chargement ? <Skeleton className="h-40" /> : erreur ? (
          <div className="flex flex-col items-center py-12 gap-3">
            <p className="text-[var(--danger)] text-sm">{erreur}</p>
            <Button variant="secondary" onClick={() => void charger()}>Réessayer</Button>
          </div>
        ) : cartes.length === 0 ? (
          <EmptyState icon={<CreditCard size={40} />} title="Aucune carte" description="Ajoute la première carte bancaire de la société." />
        ) : (
          groupes.map(g => (
            <section key={g.type} className="rounded-[var(--r-xl)] border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
              <h3 className="flex items-center gap-2 font-display font-semibold text-[var(--text)] px-4 py-3 border-b border-[var(--border)]">
                {g.type === 'carburant' ? <Fuel size={16} /> : <CreditCard size={16} />} {LIBELLE_TYPE_CARTE[g.type]}
                <span className="text-xs font-normal text-[var(--text-muted)]">{g.cartes.length}</span>
              </h3>
              {g.cartes.length === 0 ? (
                <p className="px-4 py-4 text-sm text-[var(--text-muted)]">Aucune carte dans cette famille.</p>
              ) : (
                <ul className="divide-y divide-[var(--border)]">
                  {g.cartes.map(c => {
                    const u = usage[c.code]
                    const supprimable = carteSupprimable(u)
                    const inactive = statutCarte(c, aujourdhui) === 'inactive'
                    return (
                      <li key={c.id} className="px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                        <span className="font-mono font-semibold text-[var(--text)] min-w-[11rem]">{libelleCarteBancaire(c)}</span>
                        <EtatCarte c={c} aujourdhui={aujourdhui} />
                        <span className="text-xs text-[var(--text-muted)]">
                          {u ? `${u.justificatifs} justificatif${u.justificatifs > 1 ? 's' : ''} · ${u.pleins} plein${u.pleins > 1 ? 's' : ''}` : 'Jamais utilisée'}
                        </span>
                        {peutEcrire && (
                          <span className="ml-auto flex items-center gap-1">
                            <BoutonIcone icone={Pencil} libelle="Modifier" taille="sm" onClick={() => setFiche({ carte: c })} disabled={busy} />
                            <BoutonIcone icone={Power} libelle={inactive ? 'Réactiver' : 'Désactiver à partir d’aujourd’hui'} taille="sm" onClick={() => void basculer(c)} disabled={busy} />
                            <BoutonIcone icone={Trash2} taille="sm" disabled={busy || !supprimable} onClick={() => setASupprimer(c)}
                              libelle={supprimable ? 'Supprimer' : 'Déjà utilisée : désactive-la plutôt'} />
                          </span>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          ))
        )}
      </div>

      {fiche && (
        <FicheCarte key={fiche.carte?.id ?? 'nouvelle'} carte={fiche.carte} cartes={cartes} usage={fiche.carte ? usage[fiche.carte.code] : undefined}
          companyId={companyId ?? ''} aujourdhui={aujourdhui} onClose={() => setFiche(null)}
          onEnregistree={async () => { setFiche(null); await apresModif() }} />
      )}

      <ConfirmDialog open={!!aSupprimer} title="Supprimer cette carte ?"
        message={`${aSupprimer ? libelleCarteBancaire(aSupprimer) : ''} sera supprimée. Aucun montant n’a été saisi dessus.`}
        confirmLabel="Supprimer" loading={busy} onConfirm={() => void supprimer()} onCancel={() => setASupprimer(null)} />
    </Shell>
  )
}

function FicheCarte({ carte, cartes, usage, companyId, aujourdhui, onClose, onEnregistree }: {
  carte: CarteBancaire | null
  cartes: CarteBancaire[]
  usage: UsageCarte | undefined
  companyId: string
  aujourdhui: string
  onClose: () => void
  onEnregistree: () => Promise<void>
}) {
  const { toast } = useToast()
  const [nom, setNom] = useState(carte?.nom ?? '')
  const [fin, setFin] = useState(carte?.fin ?? '')
  const [type, setType] = useState<TypeCarte>(carte?.type ?? 'societe')
  const [debut, setDebut] = useState(carte?.actif_a_partir_du ?? '')
  const [arret, setArret] = useState(carte?.inactif_a_partir_du ?? '')
  const [busy, setBusy] = useState(false)

  const saisie: SaisieCarte = { nom, fin, actif_a_partir_du: debut, inactif_a_partir_du: arret }
  const manques = manquesCarte(saisie)
  const utilisee = !carteSupprimable(usage)

  const enregistrer = async () => {
    if (manques.length > 0 || busy) return
    if (!carte && !companyId) { toast('Session expirée : reconnecte-toi.', 'error'); return }
    setBusy(true)
    const { error } = carte
      ? await modifierCarte(carte.id, saisie)
      : await creerCarte(companyId, nouveauCodeCarte(nom.trim().toUpperCase(), fin.trim().toUpperCase(), cartes.map(c => c.code)), type, saisie)
    setBusy(false)
    if (error) { toast(error.message, 'error'); return }
    toast(carte ? 'Carte modifiée' : 'Carte ajoutée')
    await onEnregistree()
  }

  return (
    <Drawer open onClose={onClose} title={carte ? 'Modifier la carte' : 'Ajouter une carte'} width="max-w-md">
      <div className="flex flex-col gap-4">
        <Champ label="Famille" requis>
          <ListeDeroulante valeur={type} onChange={v => setType(v as TypeCarte)} ariaLabel="Famille" disabled={!!carte && utilisee}
            options={[{ valeur: 'societe', libelle: LIBELLE_TYPE_CARTE.societe }, { valeur: 'carburant', libelle: LIBELLE_TYPE_CARTE.carburant }]} />
        </Champ>
        {carte && utilisee && <p className="text-xs text-[var(--text-muted)] -mt-2">La famille ne change plus : cette carte porte déjà des montants.</p>}
        <div className="grid grid-cols-2 gap-3">
          <Champ label="Nom (banque)" requis>
            <input className="field uppercase" value={nom} placeholder="QONTO" onChange={e => setNom(e.target.value)} />
          </Champ>
          <Champ label="Fin du numéro" requis>
            <input className="field font-mono uppercase" value={fin} placeholder="4103" maxLength={8} onChange={e => setFin(e.target.value)} />
          </Champ>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Champ label="Active à partir du">
            <input className="field" type="date" value={debut} onChange={e => setDebut(e.target.value)} />
          </Champ>
          <Champ label="Inactive à partir du">
            <input className="field" type="date" value={arret} onChange={e => setArret(e.target.value)} />
          </Champ>
        </div>
        <div className="flex flex-wrap gap-2 -mt-1">
          <Button variant="secondary" size="compact" onClick={() => setArret(aujourdhui)}>Désactiver aujourd’hui</Button>
          {arret && <Button variant="secondary" size="compact" onClick={() => setArret('')}>Réactiver</Button>}
        </div>
        <p className="text-xs text-[var(--text-muted)]">
          Aperçu : <span className="font-mono">{nom.trim() || 'NOM'} : *{fin.trim() || '0000'}</span>. À partir de la date d’arrêt, la carte n’est plus proposée ;
          les dépenses déjà saisies la gardent.
        </p>
        {manques.length > 0 && <p className="text-xs text-[var(--text-muted)]">Il manque : {manques.join(' · ').toLowerCase()}.</p>}
        <Button variant="primary" className="min-h-10 self-start" disabled={manques.length > 0 || busy} onClick={() => void enregistrer()}>
          {busy ? 'Enregistrement…' : carte ? 'Enregistrer' : 'Ajouter la carte'}
        </Button>
      </div>
    </Drawer>
  )
}
