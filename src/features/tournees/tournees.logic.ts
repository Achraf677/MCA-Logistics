// Logique pure de l'onglet Tournées (bureau) : tournées de colis d'un jour. Aucune dépendance DB ni DOM.
import {
  LIBELLE_STATUT_TOURNEE, avancementPct, compteursTournee, familleStatut,
  type ArretColis, type CompteursTournee, type TourneeColis,
} from '../../shared/lib/tourneesColis'
import { toLocalISO } from '../../shared/lib/dates'

export type FiltreTournees = 'toutes' | 'en_cours' | 'cloturees' | 'attente' | 'retours'

export interface LigneTournee {
  t: TourneeColis
  c: CompteursTournee
  pct: number
  arrets: ArretColis[]
  /** Arrêts mis en pause par le livreur (pas encore traités). */
  enPause: number
  km: number
}

/** Une ligne par tournée : compteurs, avancement, pauses, kilomètres. */
export function construireLignes(tournees: TourneeColis[], arrets: ArretColis[]): LigneTournee[] {
  return tournees.map(t => {
    const siens = arrets.filter(a => a.tournee_id === t.id)
    const c = compteursTournee(siens)
    return {
      t, c, pct: avancementPct(c), arrets: siens,
      enPause: siens.filter(a => !a.statut && a.en_pause_le).length,
      km: t.trajet?.km_total ?? 0,
    }
  })
}

export interface ResumeTournees {
  tournees: number
  enCours: number
  cloturees: number
  arrets: number
  arretsTraites: number
  colis: number
  colisLivres: number
  colisAttente: number
  colisRetour: number
  enPause: number
  km: number
  pct: number
}

export function resumeTournees(lignes: LigneTournee[]): ResumeTournees {
  const r: ResumeTournees = {
    tournees: lignes.length, enCours: 0, cloturees: 0, arrets: 0, arretsTraites: 0, colis: 0,
    colisLivres: 0, colisAttente: 0, colisRetour: 0, enPause: 0, km: 0, pct: 0,
  }
  for (const l of lignes) {
    if (l.t.statut === 'cloturee') r.cloturees++
    else if (l.t.statut === 'en_cours') r.enCours++
    r.arrets += l.c.arrets; r.arretsTraites += l.c.arretsTraites
    r.colis += l.c.colis; r.colisLivres += l.c.colisLivres
    r.colisAttente += l.c.colisAttente; r.colisRetour += l.c.colisRetour
    r.enPause += l.enPause; r.km += l.km
  }
  r.pct = r.arrets > 0 ? Math.round((r.arretsTraites / r.arrets) * 100) : 0
  return r
}

/** Filtre rapide (tuiles), salarié et recherche (nom, client). */
export function filtrerTournees(lignes: LigneTournee[], filtre: FiltreTournees, membreId: string, q: string): LigneTournee[] {
  const mot = q.trim().toLowerCase()
  return lignes.filter(l => {
    if (membreId && l.t.member_id !== membreId) return false
    if (filtre === 'en_cours' && l.t.statut !== 'en_cours') return false
    if (filtre === 'cloturees' && l.t.statut !== 'cloturee') return false
    if (filtre === 'attente' && l.c.colisAttente === 0) return false
    if (filtre === 'retours' && l.c.colisRetour === 0) return false
    if (!mot) return true
    return `${l.t.team_members?.full_name ?? ''} ${l.t.clients?.name ?? ''}`.toLowerCase().includes(mot)
  })
}

const echapper = (v: string | number | null | undefined) => {
  const s = v == null ? '' : String(v)
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Export CSV du jour (séparateur « ; », ouvert directement par Excel en français). */
export function csvTournees(lignes: LigneTournee[], date: string): string {
  const entete = [
    'Date', 'Salarié', 'Client', 'Statut', 'Arrêts', 'Arrêts traités', 'Colis', 'Colis livrés',
    'Colis en attente', 'Colis en retour', 'Collectes', 'En pause', 'Km',
  ]
  const rows = lignes.map(l => [
    date, l.t.team_members?.full_name ?? '', l.t.clients?.name ?? '', LIBELLE_STATUT_TOURNEE[l.t.statut],
    l.c.arrets, l.c.arretsTraites, l.c.colis, l.c.colisLivres, l.c.colisAttente, l.c.colisRetour,
    l.c.collectes, l.enPause, l.km ? l.km.toFixed(1).replace('.', ',') : '',
  ])
  return [entete, ...rows].map(r => r.map(echapper).join(';')).join('\n')
}

/** Arrêts « à traiter » d'une tournée (ni traités, ni en pause) : sert au résumé cliquable du Planning. */
export function arretsRestants(arrets: ArretColis[]): number {
  return arrets.filter(a => a.type !== 'col' && !familleStatut(a.statut)).length
}

/** `?date=AAAA-MM-JJ` valide (jour qui existe) ou `null`. */
export function dateDepuisParam(v: string | null | undefined): string | null {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null
  const [a, m, j] = v.split('-').map(Number)
  const d = new Date(a, m - 1, j)
  if (d.getFullYear() !== a || d.getMonth() !== m - 1 || d.getDate() !== j) return null
  return v
}

export function decalerJour(iso: string, n: number): string {
  const [a, m, j] = iso.split('-').map(Number)
  return toLocalISO(new Date(a, m - 1, j + n))
}
