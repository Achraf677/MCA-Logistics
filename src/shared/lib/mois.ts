// Regroupement par mois pour les listes Finance (Charges, Trésorerie). Pur : aucune dépendance DB ni DOM.

export interface GroupeMois<T> {
  /** 'AAAA-MM' */
  cle: string
  /** « octobre 2026 » */
  libelle: string
  rows: T[]
}

/** « 2026-10 » → « octobre 2026 ». */
export function libelleMois(cle: string): string {
  const [a, m] = cle.split('-').map(Number)
  if (!a || !m) return cle
  const s = new Date(a, m - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/**
 * Groupes de lignes par mois de leur date (`AAAA-MM-JJ…`), du plus récent au plus ancien ;
 * dans un groupe l'ordre d'entrée est gardé. Une ligne sans date tombe dans « Sans date » en fin de liste.
 */
export function grouperParMois<T>(rows: T[], date: (r: T) => string | null | undefined): Array<GroupeMois<T>> {
  const map = new Map<string, T[]>()
  for (const r of rows) {
    const d = date(r)
    const cle = d && /^\d{4}-\d{2}/.test(d) ? d.slice(0, 7) : 'sans-date'
    const liste = map.get(cle)
    if (liste) liste.push(r); else map.set(cle, [r])
  }
  return [...map.entries()]
    .sort((a, b) => (a[0] === 'sans-date' ? 1 : b[0] === 'sans-date' ? -1 : b[0].localeCompare(a[0])))
    .map(([cle, liste]) => ({ cle, libelle: cle === 'sans-date' ? 'Sans date' : libelleMois(cle), rows: liste }))
}

/** Mois ouvert par défaut : celui de `ref` (heure locale), sinon le plus récent du lot. */
export function moisOuvertParDefaut(cles: string[], ref: Date): string | null {
  const cle = `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, '0')}`
  if (cles.includes(cle)) return cle
  return cles.find(c => c !== 'sans-date') ?? null
}
