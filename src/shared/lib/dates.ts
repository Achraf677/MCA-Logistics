export function toLocalISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Converts empty string '' to null for optional DB date columns. */
export function nullIfEmpty(v: string | null | undefined): string | null {
  return v || null
}

/** 'AAAA-MM-JJ' → '30/09' (année courante) ou '30/09/25', sans passer par UTC. */
export function dateCourte(iso: string, anneeCourante: number): string {
  const [a, m, j] = iso.slice(0, 10).split('-')
  return Number(a) === anneeCourante ? `${j}/${m}` : `${j}/${m}/${a.slice(2)}`
}
