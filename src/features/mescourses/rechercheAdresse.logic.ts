import type { ArretColis } from '../../shared/lib/tourneesColis'

export const normaliser = (s: string | null | undefined) =>
  (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/** Arrêts dont numéro, rue, commune ou zone commencent par chacun des mots tapés (« 12 roses » → 12 rue des Roses). */
export function rechercherArrets(arrets: ArretColis[], q: string, max = 6): ArretColis[] {
  const mots = normaliser(q).split(' ').filter(Boolean)
  if (!mots.length) return []
  return arrets
    .filter(a => {
      const bloc = normaliser(`${a.numero ?? ''} ${a.rue} ${a.commune} ${a.zone ?? ''}`).split(' ')
      return mots.every(m => bloc.some(w => w.startsWith(m)))
    })
    .slice(0, max)
}

/** « 12 bis rue des Roses » → numéro « 12 bis », rue « rue des Roses ». Pas de numéro : tout est la rue. */
export function analyserSaisie(q: string): { numero: string; rue: string } {
  const m = /^\s*(\d+\s*(?:bis|ter|quater|[a-d])?)\s*,?\s+(\D.*)$/i.exec(q)
  return m ? { numero: m[1].replace(/\s+/g, ' ').trim().toUpperCase(), rue: m[2].trim() } : { numero: '', rue: q.trim() }
}

/** Zone déjà connue pour cette rue de cette commune dans la tournée (jamais inventée). */
export function zoneDeLaRue(arrets: ArretColis[], commune: string, rue: string): string | null {
  const c = normaliser(commune); const r = normaliser(rue)
  return arrets.find(a => a.zone && normaliser(a.commune) === c && normaliser(a.rue) === r)?.zone ?? null
}

/** Code postal déjà connu pour cette commune dans la tournée (sinon null : on ne le devine pas). */
export function cpDeLaCommune(arrets: ArretColis[], commune: string): string | null {
  const c = normaliser(commune)
  return arrets.find(a => a.cp && normaliser(a.commune) === c)?.cp ?? null
}
