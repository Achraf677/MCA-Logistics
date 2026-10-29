import { useState, type ReactNode } from 'react'
import { SlidersHorizontal, X } from 'lucide-react'
import { BarreRecherche } from '../../shared/ui/BarreRecherche'
import { Button } from '../../shared/ui/Button'
import { Champ } from '../../shared/ui/FicheSaisie'
import { ListeDeroulante } from '../../shared/ui/ListeDeroulante'
import {
  CRITERES_VIDES, LIBELLE_TYPE, ORDRE_TYPES, type CriteresJustif, type TypeJustif,
} from './justificatifs.logic'

type Option = { valeur: string; libelle: string }

/** Pastille de famille : sélectionnée = neutre (le rouge de la marque est gardé pour le danger). */
function Pastille({ actif, onClick, children }: { actif: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-pressed={actif} onClick={onClick}
      className={`shrink-0 h-8 px-3 rounded-full border text-sm font-medium inline-flex items-center gap-1.5 whitespace-nowrap transition-colors
        ${actif
          ? 'border-[var(--text)] bg-[var(--text)] text-[var(--bg-card)]'
          : 'border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--border-strong)]'}`}>
      {children}
    </button>
  )
}

const Compte = ({ n, actif }: { n: number; actif: boolean }) => (
  <span className={`font-mono text-xs ${actif ? 'opacity-70' : 'text-[var(--text-disabled)]'}`}>{n}</span>
)

/** Filtre actif affiché sous la barre, retirable d'un clic. */
function Retirable({ libelle, onRetirer }: { libelle: string; onRetirer: () => void }) {
  return (
    <span className="inline-flex h-7 items-center gap-1 rounded-full border border-[var(--border-strong)] bg-[var(--bg-elevated)] pl-2.5 pr-1 text-xs text-[var(--text)]">
      <span className="max-w-[12rem] truncate">{libelle}</span>
      <button type="button" aria-label={`Retirer le filtre ${libelle}`} onClick={onRetirer}
        className="h-5 w-5 inline-flex items-center justify-center rounded-full text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg-card-hover)]"><X size={12} /></button>
    </span>
  )
}

/**
 * Une seule barre au lieu de cinq bandeaux : recherche, familles (pastilles avec compteurs), « À compléter », puis « Filtres »
 * qui ouvre déclarant / carte / mois. Un filtre posé reste visible en pastille retirable, panneau fermé.
 */
export function BarreFiltresJustificatifs({
  q, onQ, nbResultats, criteres, onCriteres, parType, optionsDeclarants, optionsCartes, optionsMois,
}: {
  q: string
  onQ: (v: string) => void
  nbResultats: number
  criteres: CriteresJustif
  onCriteres: (c: Partial<CriteresJustif>) => void
  parType: Record<TypeJustif, number>
  optionsDeclarants: Option[]
  optionsCartes: Option[]
  optionsMois: Option[]
}) {
  const [panneau, setPanneau] = useState(false)
  const total = parType.note_de_frais + parType.cb + parType.carburant + parType.autre
  const libelleDe = (liste: Option[], v: string) => liste.find(o => o.valeur === v)?.libelle ?? v
  const nbListes = (criteres.declarant ? 1 : 0) + (criteres.carte ? 1 : 0) + (criteres.mois ? 1 : 0)
  const nbTotal = nbListes + (criteres.type !== 'tous' ? 1 : 0) + (criteres.incomplets ? 1 : 0)

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <BarreRecherche value={q} onChange={onQ} taille="sm" placeholder="Note, déclarant, carte, montant…" ariaLabel="Rechercher un justificatif"
          raccourci className="w-full sm:w-72" compteur={`${nbResultats} résultat${nbResultats > 1 ? 's' : ''}`} />
        <div role="group" aria-label="Familles" className="flex items-center gap-1.5 overflow-x-auto sm:flex-wrap sm:overflow-visible min-w-0 max-w-full pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <Pastille actif={criteres.type === 'tous'} onClick={() => onCriteres({ type: 'tous' })}>Tous <Compte n={total} actif={criteres.type === 'tous'} /></Pastille>
          {ORDRE_TYPES.filter(t => t !== 'autre' || parType.autre > 0).map(t => (
            <Pastille key={t} actif={criteres.type === t} onClick={() => onCriteres({ type: criteres.type === t ? 'tous' : t })}>
              {LIBELLE_TYPE[t]} <Compte n={parType[t]} actif={criteres.type === t} />
            </Pastille>
          ))}
          <span aria-hidden="true" className="shrink-0 h-5 w-px bg-[var(--border)] mx-0.5" />
          <Pastille actif={criteres.incomplets} onClick={() => onCriteres({ incomplets: !criteres.incomplets })}>À compléter</Pastille>
        </div>
        <button type="button" aria-expanded={panneau} onClick={() => setPanneau(o => !o)}
          className={`shrink-0 h-8 px-3 rounded-full border text-sm font-medium inline-flex items-center gap-1.5 transition-colors ${
            panneau || nbListes > 0 ? 'border-[var(--border-strong)] bg-[var(--bg-elevated)] text-[var(--text)]' : 'border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]'}`}>
          <SlidersHorizontal size={14} /> Filtres{nbListes > 0 && <span className="font-mono text-xs">({nbListes})</span>}
        </button>
      </div>

      {panneau && (
        <div className="grid gap-3 sm:grid-cols-3 rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg-card)] p-3">
          <Champ label="Déclarant">
            <ListeDeroulante valeur={criteres.declarant} onChange={v => onCriteres({ declarant: v })} recherche ariaLabel="Déclarant"
              placeholder="Tous" options={[{ valeur: '', libelle: 'Tous les déclarants' }, ...optionsDeclarants]} />
          </Champ>
          {optionsCartes.length > 0 && (
            <Champ label="Carte">
              <ListeDeroulante valeur={criteres.carte} onChange={v => onCriteres({ carte: v })} recherche ariaLabel="Carte"
                placeholder="Toutes" options={[{ valeur: '', libelle: 'Toutes les cartes' }, ...optionsCartes]} />
            </Champ>
          )}
          <Champ label="Mois">
            <ListeDeroulante valeur={criteres.mois} onChange={v => onCriteres({ mois: v })} ariaLabel="Mois"
              placeholder="Tous" options={[{ valeur: '', libelle: 'Tous les mois' }, ...optionsMois]} />
          </Champ>
        </div>
      )}

      {nbListes > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" aria-label="Filtres actifs">
          {criteres.declarant && <Retirable libelle={libelleDe(optionsDeclarants, criteres.declarant)} onRetirer={() => onCriteres({ declarant: '' })} />}
          {criteres.carte && <Retirable libelle={libelleDe(optionsCartes, criteres.carte)} onRetirer={() => onCriteres({ carte: '' })} />}
          {criteres.mois && <Retirable libelle={libelleDe(optionsMois, criteres.mois)} onRetirer={() => onCriteres({ mois: '' })} />}
        </div>
      )}
      {nbTotal > 0 && (
        <div>
          <Button variant="secondary" size="compact" onClick={() => onCriteres({ ...CRITERES_VIDES })}>Réinitialiser les filtres ({nbTotal})</Button>
        </div>
      )}
    </div>
  )
}
