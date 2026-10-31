import { useMemo, useState } from 'react'
import { PackageCheck, PackagePlus, Pencil, Plus, Route } from 'lucide-react'
import { BarreRecherche } from '../../shared/ui/BarreRecherche'
import { Badge } from '../../shared/ui/Badge'
import { Button } from '../../shared/ui/Button'
import {
  LIBELLE_STATUT_ARRET, LIBELLE_TYPE_ARRET, familleStatut, type ArretColis, type TourneeColis,
} from '../../shared/lib/tourneesColis'
import { arretsDansOrdre, cleGroupe, infosGroupes, modeOrdre, numeroAffiche } from '../../shared/lib/tourneesColisRoute'
import { rechercherArrets } from '../../shared/lib/adresseTournee.logic'

type Filtre = 'afaire' | 'attente' | 'retour' | 'tous'

const adresse = (a: ArretColis) => (a.numero ? `${a.numero} ${a.rue}` : a.rue)

/**
 * Liste des arrêts d'une tournée de colis, côté bureau : on repère les adresses à corriger
 * (non traitées, en attente, en retour) en les comparant à la feuille de route, puis on les corrige.
 */
export function ListeTourneeColis({ tournee, arrets, peutModifier, aRecalculer, calcul, onModifier, onCollecte, onAjouter, onRecalculer }: {
  tournee: TourneeColis
  arrets: ArretColis[]
  peutModifier: boolean
  aRecalculer: boolean
  calcul: boolean
  onModifier: (a: ArretColis) => void
  onCollecte: (a: ArretColis) => void
  onAjouter: () => void
  onRecalculer: () => void
}) {
  const mode = modeOrdre(tournee)
  const ordonnes = useMemo(() => arretsDansOrdre(arrets, mode), [arrets, mode])
  const infos = useMemo(() => infosGroupes(arrets, mode), [arrets, mode])
  const nb = useMemo(() => ({
    afaire: ordonnes.filter(a => !a.statut).length,
    attente: ordonnes.filter(a => familleStatut(a.statut) === 'attente').length,
    retour: ordonnes.filter(a => familleStatut(a.statut) === 'retour').length,
    tous: ordonnes.length,
  }), [ordonnes])
  const [filtre, setFiltre] = useState<Filtre>(nb.attente > 0 ? 'attente' : 'afaire')
  const [q, setQ] = useState('')
  const modifiable = peutModifier && tournee.statut !== 'cloturee'

  const liste = useMemo(() => {
    const base = ordonnes.filter(a => (filtre === 'tous' ? true : filtre === 'afaire' ? !a.statut : familleStatut(a.statut) === filtre))
    return q.trim() ? rechercherArrets(base, q, 500) : base
  }, [ordonnes, filtre, q])

  const chips: Array<[Filtre, string]> = [['afaire', 'À faire'], ['attente', 'En attente'], ['retour', 'En retour'], ['tous', 'Tous']]
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {chips.map(([f, l]) => (
          <button key={f} type="button" aria-pressed={filtre === f} onClick={() => setFiltre(f)}
            className={`min-h-9 px-3 inline-flex items-center gap-1.5 rounded-full border text-sm ${
              filtre === f ? 'border-[var(--brand)] bg-[var(--bg-elevated)] text-[var(--text)] font-semibold' : 'border-[var(--border)] text-[var(--text-muted)]'}`}>
            {l} <span className="tabular-nums">{nb[f]}</span>
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <BarreRecherche value={q} onChange={setQ} placeholder="Chercher une adresse" ariaLabel="Chercher une adresse de la tournée" className="flex-1 min-w-0" />
        {modifiable && <Button size="compact" onClick={onAjouter}><Plus size={14} /> Ajouter</Button>}
      </div>
      {aRecalculer && modifiable && (
        <div className="flex items-center gap-2 p-2 rounded-[var(--r-md)] border border-[var(--warning)] text-sm text-[var(--text)]">
          <span className="flex-1">Des adresses ont changé : recalcule l'itinéraire.</span>
          <Button size="compact" onClick={onRecalculer} disabled={calcul}><Route size={14} /> {calcul ? 'Calcul…' : 'Recalculer'}</Button>
        </div>
      )}
      <ul className="flex flex-col divide-y divide-[var(--border)] rounded-[var(--r-md)] border border-[var(--border)]">
        {liste.map(a => {
          const famille = familleStatut(a.statut)
          const couleur = infos.get(cleGroupe(a))?.couleur
          return (
            <li key={a.id} className="flex items-center gap-2 px-2 py-2" style={couleur ? { borderLeft: `4px solid ${couleur}` } : undefined}>
              <span className="w-8 shrink-0 text-center text-xs font-semibold tabular-nums text-[var(--text-muted)]">{numeroAffiche(a, mode) ?? '–'}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-[var(--text)] break-words">{adresse(a)}</p>
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--text-muted)]">
                  <span>{a.commune}{a.cp ? ` ${a.cp}` : ''}{a.zone ? ` · ${a.zone.charAt(0)}${a.zone.slice(1).toLowerCase()}` : ''}</span>
                  <span>{LIBELLE_TYPE_ARRET[a.type]}</span>
                  <span className="tabular-nums">{a.quantite} colis</span>
                  {a.lat == null && <span className="text-[var(--danger)]">Position inconnue</span>}
                  {a.statut && famille && (
                    <Badge color={famille === 'livre' ? 'success' : famille === 'attente' ? 'warning' : famille === 'retour' ? 'danger' : 'muted'}>
                      {LIBELLE_STATUT_ARRET[a.statut]}
                    </Badge>
                  )}
                  {a.en_pause_le && !a.statut && <Badge color="warning">En pause</Badge>}
                  {a.note && <span className="italic">« {a.note} »</span>}
                </p>
              </div>
              {modifiable && !a.statut && (
                <button type="button" onClick={() => onCollecte(a)}
                  aria-label={a.type === 'col' ? 'Remettre en colis normal' : a.quantite > 1 ? 'Collecte / éclater' : 'Transformer en collecte'}
                  title={a.type === 'col' ? 'Remettre en colis normal' : a.quantite > 1 ? 'Collecte / éclater' : 'Transformer en collecte'}
                  className="size-10 shrink-0 inline-flex items-center justify-center rounded-[var(--r-md)] border border-[var(--border)] text-[var(--text-muted)]">
                  {a.type === 'col' ? <PackageCheck size={16} /> : <PackagePlus size={16} />}
                </button>
              )}
              {modifiable && (
                <button type="button" onClick={() => onModifier(a)} aria-label="Corriger l'adresse" title="Corriger l'adresse"
                  className="size-10 shrink-0 inline-flex items-center justify-center rounded-[var(--r-md)] border border-[var(--border)] text-[var(--text-muted)]">
                  <Pencil size={16} />
                </button>
              )}
            </li>
          )
        })}
        {liste.length === 0 && <li className="px-3 py-4 text-sm text-center text-[var(--text-muted)]">Aucun arrêt dans cette vue.</li>}
      </ul>
    </div>
  )
}
