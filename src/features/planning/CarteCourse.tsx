import { memo } from 'react'
import type { DragEvent } from 'react'
import { AlertTriangle, Clock, MoreHorizontal, Package, Truck, Zap } from 'lucide-react'
import { STATUS_LABELS, trajet } from '../livraisons/livraisons.logic'
import { COULEUR_FAMILLE, creneauCarte, estDeplacable, estOuverte, familleCourse } from './planning.logic'
import type { CoursePlanning } from './planning.types'

export interface PropsCarte {
  c: CoursePlanning
  selectionnee: boolean
  /** Au moins une course est cochée : les cases s'affichent sur toutes les cartes. */
  selectionActive: boolean
  /** Le droit de modifier le planning : sans lui, ni case, ni menu, ni glisser. */
  peutEcrire: boolean
  avecChauffeur?: boolean
  /** Mobile : carte plus haute, cibles tactiles de 2,75 rem, pas de glisser-déposer. */
  dense?: boolean
  onSelection: (id: string) => void
  onOuvrir: (c: CoursePlanning) => void
  onMenu: (c: CoursePlanning) => void
  onDragStart: (e: DragEvent, c: CoursePlanning) => void
  onDragEnd: () => void
}

/** Une course en deux lignes : client + trajet, puis créneau · colis · véhicule · statut. */
export const CarteCourse = memo(function CarteCourse({
  c, selectionnee, selectionActive, peutEcrire, avecChauffeur = false, dense = false,
  onSelection, onOuvrir, onMenu, onDragStart, onDragEnd,
}: PropsCarte) {
  const t = trajet(c.pickup_address, c.delivery_address)
  const creneau = creneauCarte(c)
  const famille = familleCourse(c.statut)
  const deplacable = estDeplacable(c.statut) && peutEcrire
  const echec = !!c.probleme_le && estOuverte(c.statut)
  const couleur = COULEUR_FAMILLE[famille]
  const titre = [
    c.clients?.name ?? '—', t.complet, creneau ? `Livraison ${creneau}` : null,
    !estDeplacable(c.statut) ? 'Course figée (facturée, payée ou annulée) : non déplaçable' : null,
  ].filter(Boolean).join('\n')

  return (
    <div
      role="button"
      tabIndex={0}
      title={titre}
      draggable={deplacable && !dense}
      onDragStart={e => onDragStart(e, c)}
      onDragEnd={onDragEnd}
      onClick={() => onOuvrir(c)}
      onKeyDown={e => {
        // Entrée / Espace sur la carte elle-même seulement : sur la case ou le menu, ils gardent leur rôle.
        if (e.target !== e.currentTarget) return
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOuvrir(c) }
      }}
      className={`group w-full text-left rounded-[var(--r-sm)] border bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)]
        transition-colors cursor-pointer ${dense ? 'px-3 py-2.5' : 'px-1.5 py-1'}
        ${famille === 'terminee' ? 'opacity-60' : ''}
        ${selectionnee ? 'border-[var(--brand)] ring-1 ring-[var(--brand)]' : echec ? 'border-[var(--danger)]' : 'border-[var(--border)]'}`}
      style={{ borderLeftWidth: '0.2rem', borderLeftColor: couleur }}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        {deplacable && (
          <label onClick={e => e.stopPropagation()} className={`shrink-0 cursor-pointer ${dense ? 'p-2.5 -m-2.5' : 'p-1 -m-1'}`}>
            <input
              type="checkbox"
              checked={selectionnee}
              onChange={() => onSelection(c.id)}
              aria-label={`Sélectionner la course ${c.clients?.name ?? ''}`}
              className={`accent-[var(--brand)] cursor-pointer ${dense ? 'w-5 h-5' : 'w-3.5 h-3.5'}
                ${selectionnee || selectionActive || dense ? '' : 'opacity-0 group-hover:opacity-100 focus:opacity-100'}`}
            />
          </label>
        )}
        <span className={`font-semibold text-[var(--text)] truncate min-w-0 ${dense ? 'text-sm' : 'text-xs'}`}>
          {c.clients?.name ?? '—'}
        </span>
        <span className={`text-[var(--text-muted)] truncate min-w-0 flex-1 ${dense ? 'text-sm' : 'text-xs'}`}>{t.court}</span>
        {c.urgent && <Zap size={dense ? 14 : 12} className="text-[var(--danger)] shrink-0" aria-label="Urgent" />}
        {echec && <AlertTriangle size={dense ? 14 : 12} className="text-[var(--danger)] shrink-0" aria-label="Échec terrain" />}
        {deplacable && (
          <button
            type="button"
            aria-label="Actions sur la course"
            onClick={e => { e.stopPropagation(); onMenu(c) }}
            className={`shrink-0 inline-flex items-center justify-center rounded-[var(--r-sm)] text-[var(--text-muted)]
              hover:text-[var(--text)] hover:bg-[var(--bg-elevated)]
              ${dense ? 'w-11 h-11 -my-2.5 -mr-2' : 'w-6 h-5 lg:opacity-0 lg:group-hover:opacity-100 focus:opacity-100'}`}
          >
            <MoreHorizontal size={dense ? 18 : 14} />
          </button>
        )}
      </div>
      <div className={`flex items-center gap-2 text-[var(--text-muted)] min-w-0 ${dense ? 'text-xs mt-0.5' : 'text-xs'}`}>
        {creneau && <span className="inline-flex items-center gap-0.5 shrink-0"><Clock size={10} />{creneau}</span>}
        {c.nb_colis != null && c.nb_colis > 0 && (
          <span className="inline-flex items-center gap-0.5 shrink-0"><Package size={10} />{c.nb_colis}</span>
        )}
        {c.vehicles?.label && <span className="inline-flex items-center gap-0.5 truncate min-w-0"><Truck size={10} />{c.vehicles.label}</span>}
        {avecChauffeur && (
          <span className="truncate min-w-0">
            {c.team_members?.full_name ?? <span className="text-[var(--danger)]">Sans chauffeur</span>}
          </span>
        )}
        <span className="ml-auto shrink-0 font-medium" style={{ color: couleur }}>{STATUS_LABELS[c.statut] ?? c.statut}</span>
      </div>
    </div>
  )
})
