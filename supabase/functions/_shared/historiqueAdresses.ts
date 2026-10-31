// Historique des adresses (table `adresses_historique`) — PUR, testé (historiqueAdresses.test.ts).
// Ce que les livreurs ont corrigé sur une adresse (devenue collecte, éclatée en 1 collecte + colis normal)
// préremplit la lecture d'une feuille. Rien n'est inventé : sans historique, l'arrêt reste tel que lu.
import { cle } from './referentiel.ts'

export interface LigneHistorique {
  commune: string
  rue: string
  numero: string | null
  collecte: number
  normal: number
  eclate: number
  eclate_collecte: number
}

export type IndexHistorique = Map<string, LigneHistorique>

const numero = (n: string | null | undefined) => String(n ?? '').toUpperCase().replace(/\s+/g, '')
const cleAdresse = (commune: string | null, rue: string | null, n: string | null) => `${cle(commune)}|${cle(rue)}|${numero(n)}`

/** Lignes de la table → une entrée par adresse (écritures voisines, accents près, additionnées). */
export function indexerHistorique(lignes: LigneHistorique[]): IndexHistorique {
  const idx: IndexHistorique = new Map()
  for (const l of lignes) {
    const k = cleAdresse(l.commune, l.rue, l.numero)
    const cur = idx.get(k)
    idx.set(k, cur
      ? { ...cur, collecte: cur.collecte + l.collecte, normal: cur.normal + l.normal, eclate: cur.eclate + l.eclate, eclate_collecte: l.eclate_collecte }
      : { ...l })
  }
  return idx
}

interface ArretHist {
  commune: string | null
  rue: string | null
  numero: string | null
  quantite: number
  type: 'c' | 'rc' | 'col'
  note: string | null
}

const noter = (note: string | null, ajout: string) => (note ? `${note} · ${ajout}` : ajout)

/**
 * Applique l'historique aux arrêts de type domicile :
 * - adresse déjà éclatée et ≥ 2 colis → 1 ligne collecte (colis habituels de la collecte) + le reste en colis normal ;
 * - adresse passée en collecte plus souvent qu'elle n'est revenue en normal, 1 colis → collecte ;
 *   plusieurs colis → inchangé, avec une note (on ne perd pas de livraison).
 */
export function appliquerHistorique<T extends ArretHist>(arrets: T[], idx: IndexHistorique): T[] {
  if (idx.size === 0) return arrets
  return arrets.flatMap(a => {
    if (a.type !== 'c') return [a]
    const h = idx.get(cleAdresse(a.commune, a.rue, a.numero))
    if (!h) return [a]
    if (h.eclate > 0 && a.quantite >= 2) {
      const q = Math.min(Math.max(1, h.eclate_collecte), a.quantite - 1)
      return [
        { ...a, quantite: a.quantite - q },
        { ...a, quantite: q, type: 'col' as const, note: noter(a.note, 'Collecte (historique)') },
      ]
    }
    if (h.collecte > h.normal) {
      return [a.quantite === 1
        ? { ...a, type: 'col' as const, note: noter(a.note, 'Collecte habituelle (historique)') }
        : { ...a, note: noter(a.note, 'Collecte possible ici (historique)') }]
    }
    return [a]
  })
}
