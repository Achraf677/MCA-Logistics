import { useState, useEffect, useMemo } from 'react'
import { Truck, AlertTriangle, Info } from 'lucide-react'
import { Skeleton } from '../../shared/ui/Skeleton'
import { getChargementsData } from './rentabilite.queries'
import {
  tauxAuKm, chargements, totauxChargements,
  type CoursePourCout, type LigneChargement,
} from './chargements.logic'

function euros(cts: number): string {
  return (cts / 100).toLocaleString('fr-FR', { maximumFractionDigits: 0 }) + ' €'
}

function centimesParKm(cts: number): string {
  return cts.toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' cts/km'
}

function jour(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('fr-FR', {
    weekday: 'short', day: '2-digit', month: 'short',
  })
}

/**
 * Ce que rapporte chaque CHARGEMENT — un camion, une journée.
 *
 * La vue mensuelle juste au-dessus dit si l'année est bonne ; celle-ci dit
 * QUELLES journées la portent et lesquelles la plombent. Deux questions
 * distinctes, sur les mêmes données.
 */
export function ChargementsPanel({ year }: { year: number }) {
  const [donnees, setDonnees] = useState<Awaited<ReturnType<typeof getChargementsData>> | null>(null)
  const [loading, setLoading] = useState(true)
  const [tout, setTout] = useState(false)

  useEffect(() => {
    let annule = false
    setLoading(true)
    getChargementsData(year).then(d => {
      if (annule) return
      setDonnees(d)
      setLoading(false)
    })
    return () => { annule = true }
  }, [year])

  const { lignes, taux, totaux } = useMemo(() => {
    const courses = (donnees?.courses ?? []) as CoursePourCout[]
    const noms = new Map((donnees?.vehicules ?? []).map(v => [v.id, v.label]))
    const t = tauxAuKm(courses, donnees?.pleins ?? [], donnees?.entretiens ?? [])
    const l = chargements(courses, t, id => (id ? noms.get(id) ?? 'Véhicule inconnu' : 'Sans véhicule'))
    return { lignes: l, taux: t, totaux: totauxChargements(l) }
  }, [donnees])

  if (loading) return <Skeleton className="h-64" />

  if (lignes.length === 0) {
    return (
      <p className="text-[var(--fs-sm)] text-[var(--text-muted)] py-4">
        Aucune course sur {year}.
      </p>
    )
  }

  const visibles = tout ? lignes : lignes.slice(0, 15)

  return (
    <div className="flex flex-col gap-3">
      {/* Le taux mesuré, affiché en clair : c'est lui qui fabrique tous les
          coûts du tableau, et on doit pouvoir le contester. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[var(--fs-xs)]">
        <span className="inline-flex items-center gap-1.5 text-[var(--text-muted)]">
          <Info size={13} />
          Mesuré sur {totaux.km.toLocaleString('fr-FR')} km :
        </span>
        <span className="font-mono text-[var(--text)]">
          carburant {centimesParKm(taux.carburantCtsParKm)}
        </span>
        <span className="font-mono text-[var(--text)]">
          entretien {centimesParKm(taux.entretienCtsParKm)}
        </span>
      </div>

      {!taux.fiable && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-[var(--r-md)]
          bg-[var(--warning)]/10 border border-[var(--warning)]/30 text-[var(--fs-xs)]">
          <AlertTriangle size={14} className="text-[var(--warning)] mt-0.5 shrink-0" />
          <span className="text-[var(--text-muted)]">
            Trop peu de kilomètres ou de pleins sur {year} pour que ce coût au kilomètre
            soit une mesure. Les montants ci-dessous donnent un ordre de grandeur, pas un chiffre.
          </span>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-[var(--fs-sm)] min-w-[640px]">
          <thead>
            <tr className="text-[var(--text-muted)] text-left border-b border-[var(--border)]">
              {['Jour', 'Véhicule', 'Courses', 'km', 'Recettes', 'Carburant', 'Entretien', 'Marge'].map(h => (
                <th key={h} className="py-2 pr-3 font-medium text-[var(--fs-xs)] uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibles.map(l => <Ligne key={l.cle} l={l} />)}
          </tbody>
          <tfoot>
            <tr className="border-t border-[var(--border)] font-semibold text-[var(--text)]">
              <td className="py-2 pr-3">Total</td>
              <td className="py-2 pr-3 text-[var(--text-muted)] font-normal text-[var(--fs-xs)]">
                {totaux.nbChargements} chargement{totaux.nbChargements > 1 ? 's' : ''}
              </td>
              <td className="py-2 pr-3 font-mono">{totaux.nbCourses}</td>
              <td className="py-2 pr-3 font-mono">{totaux.km.toLocaleString('fr-FR')}</td>
              <td className="py-2 pr-3 font-mono">{euros(totaux.recettesHtCts)}</td>
              <td className="py-2 pr-3 font-mono">{euros(totaux.carburantCts)}</td>
              <td className="py-2 pr-3 font-mono">{euros(totaux.entretienCts)}</td>
              <td className={`py-2 pr-3 font-mono ${totaux.margeCts < 0 ? 'text-[var(--danger)]' : 'text-[var(--success)]'}`}>
                {euros(totaux.margeCts)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {lignes.length > visibles.length && (
        <button onClick={() => setTout(true)}
          className="self-start text-[var(--fs-xs)] text-[var(--brand)] underline min-h-[32px]">
          Voir les {lignes.length} chargements
        </button>
      )}

      {/* Ce que ce tableau NE dit PAS. Ecrit sous le tableau et non dans une
          note de bas de page : quelqu'un qui lit « marge » sans lire ceci
          croirait à un resultat net. */}
      <p className="text-[var(--fs-xs)] text-[var(--text-disabled)]">
        Marge sur coûts DIRECTS : recettes HT moins le carburant et l'entretien. Ni le
        leasing, ni l'assurance, ni les salaires — les répartir par chargement demanderait
        une clé de calcul que rien ne justifie, et un chiffre faux serait pire qu'un chiffre
        absent. Les coûts sont imputés au kilomètre : une course longue distance porte tous
        ses kilomètres à sa date de départ, donc une journée peut totaliser plus de
        kilomètres qu'un camion n'en parcourt en vingt-quatre heures.
      </p>
    </div>
  )
}

function Ligne({ l }: { l: LigneChargement }) {
  return (
    <tr className="border-b border-[var(--border)] last:border-0">
      <td className="py-2 pr-3 font-mono text-[var(--fs-xs)] text-[var(--text-muted)] whitespace-nowrap">
        {jour(l.date)}
      </td>
      <td className="py-2 pr-3 text-[var(--text)]">
        <span className="inline-flex items-center gap-1.5">
          {l.enTournee && <Truck size={12} className="text-[var(--brand)] shrink-0" />}
          <span className="truncate">{l.vehicule}</span>
        </span>
      </td>
      <td className="py-2 pr-3 font-mono text-[var(--text-muted)]">{l.nbCourses}</td>
      <td className="py-2 pr-3 font-mono text-[var(--text-muted)]">
        {l.km > 0 ? l.km.toLocaleString('fr-FR') : '—'}
      </td>
      <td className="py-2 pr-3 font-mono text-[var(--text)]">{euros(l.recettesHtCts)}</td>
      <td className="py-2 pr-3 font-mono text-[var(--text-muted)]">{euros(l.carburantCts)}</td>
      <td className="py-2 pr-3 font-mono text-[var(--text-muted)]">{euros(l.entretienCts)}</td>
      <td className={`py-2 pr-3 font-mono font-medium ${
        l.margeCts < 0 ? 'text-[var(--danger)]' : 'text-[var(--success)]'
      }`}>
        {euros(l.margeCts)}
        {l.margeParKmCts != null && (
          <span className="block text-[var(--fs-xs)] font-normal text-[var(--text-disabled)]">
            {centimesParKm(l.margeParKmCts)}
          </span>
        )}
      </td>
    </tr>
  )
}
