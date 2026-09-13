import { useMemo, useState } from 'react'
import { ChevronDown, PieChart } from 'lucide-react'
import { formatCents, recapParType, recapParVehicule, type LigneRecap } from './entretiens.logic'
import type { MaintenanceRow } from './entretiens.types'

/**
 * Où part l'argent de l'entretien, sur le périmètre affiché.
 *
 * Deux découpages, parce que ce sont deux questions distinctes et qu'aucune
 * ne remplace l'autre : « quel poste me coûte cher ? » (les pneus, les freins)
 * et « quel véhicule me coûte cher ? ». Un camion peut être sain avec un poste
 * qui dérape, et un poste peut être normal sauf sur un seul camion.
 *
 * Le récap suit les FILTRES de l'écran — période et véhicule. C'est voulu :
 * un récap qui ignorerait les filtres afficherait des totaux sans rapport avec
 * la liste juste en dessous, et on ne saurait plus lequel croire.
 */
export function RecapEntretiens({ rows }: { rows: MaintenanceRow[] }) {
  // Replié par défaut : la liste des opérations reste la vue principale.
  const [ouvert, setOuvert] = useState(false)

  const parType = useMemo(() => recapParType(rows), [rows])
  const parVehicule = useMemo(() => recapParVehicule(rows), [rows])

  if (rows.length === 0) return null

  const general = parType.reduce((s, l) => s + l.total_cts, 0)
  const sansCout = rows.filter(r => r.cost_cts == null).length

  return (
    <div className="glass rounded-[var(--r-xl)] mb-4 overflow-hidden">
      <button
        type="button"
        onClick={() => setOuvert(o => !o)}
        aria-expanded={ouvert}
        className="w-full flex items-center gap-2 px-4 min-h-[48px] text-left"
      >
        <PieChart size={16} className="text-[var(--brand)] shrink-0" />
        <span className="text-[var(--fs-sm)] font-medium text-[var(--text)]">
          Où part l'argent
        </span>
        <span className="font-mono text-[var(--fs-sm)] text-[var(--text-muted)]">
          {formatCents(general)}
        </span>
        <ChevronDown
          size={16}
          className={`ml-auto text-[var(--text-muted)] shrink-0 transition-transform ${ouvert ? 'rotate-180' : ''}`}
        />
      </button>

      {ouvert && (
        <div className="px-4 pb-4 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5">
          <Colonne titre="Par type d'entretien" lignes={parType} />
          <Colonne titre="Par véhicule" lignes={parVehicule} />

          {/* Dit une fois, en bas, ce que les lignes ne peuvent pas dire :
              combien d'opérations n'ont aucun coût saisi. Sans ça, le total
              se lirait comme une dépense complète alors qu'il est partiel. */}
          {sansCout > 0 && (
            <p className="md:col-span-2 text-[var(--fs-xs)] text-[var(--text-muted)] pt-1 border-t border-[var(--border)]">
              {sansCout} opération{sansCout > 1 ? 's' : ''} sans coût saisi — elle
              {sansCout > 1 ? 's comptent' : ' compte'} dans le nombre, pas dans le montant.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function Colonne({ titre, lignes }: { titre: string; lignes: LigneRecap[] }) {
  return (
    <div className="flex flex-col gap-2 min-w-0">
      <span className="text-[var(--fs-xs)] font-semibold text-[var(--text-muted)] uppercase tracking-wide">
        {titre}
      </span>
      {lignes.map(l => (
        <div key={l.cle} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[var(--fs-sm)] text-[var(--text)] truncate">
              {l.libelle}
              <span className="ml-1.5 text-[var(--fs-xs)] text-[var(--text-muted)]">
                ×{l.nb}
                {l.nbSansCout > 0 && ` · ${l.nbSansCout} sans coût`}
              </span>
            </span>
            <span className="font-mono text-[var(--fs-sm)] text-[var(--text)] shrink-0">
              {formatCents(l.total_cts)}
            </span>
          </div>
          {/* Barre de proportion : lire l'écart entre postes d'un coup d'œil,
              sans comparer les chiffres un à un. Décorative, d'où aria-hidden. */}
          <div className="h-1 rounded-full bg-[var(--border)] overflow-hidden" aria-hidden="true">
            <div
              className="h-full rounded-full bg-[var(--brand)]"
              style={{ width: `${Math.round(l.part * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}
