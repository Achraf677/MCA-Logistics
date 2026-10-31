// Suivi détaillé des colis (bureau) — PUR, testé (suivi.logic.test.ts). Une ligne par arrêt, avec l'heure de passage.
import {
  LIBELLE_STATUT_ARRET, LIBELLE_TYPE_ARRET, colisRemis, compteursTournee, familleStatut,
  type ArretColis, type CompteursTournee, type FamilleStatut, type StatutArretColis, type TourneeColis, type TypeArretColis,
} from '../../shared/lib/tourneesColis'
import { cleGroupe, libelleGroupe } from '../../shared/lib/tourneesColisRoute'

export type FiltreSuivi = 'tous' | 'livres' | 'avises' | 'retours' | 'collectes' | 'non_traites' | 'anomalies'

export interface LigneSuivi {
  id: string
  tourneeId: string
  date: string
  membreId: string
  salarie: string
  client: string | null
  village: string
  villageCle: string
  adresse: string
  type: TypeArretColis
  quantite: number
  remis: number
  statut: StatutArretColis | null
  famille: FamilleStatut | null
  /** Heure de passage au statut (ms), null = pas de statut ou pas d'heure. */
  le: number | null
  note: string | null
  photos: number
  cloturee: boolean
  rang: number
}

export function construireSuivi(tournees: TourneeColis[], arrets: ArretColis[], photos: Map<string, number>): LigneSuivi[] {
  const par = new Map(tournees.map(t => [t.id, t]))
  const lignes: LigneSuivi[] = []
  for (const a of arrets) {
    const t = par.get(a.tournee_id)
    if (!t) continue
    const ms = a.statut_le ? Date.parse(a.statut_le) : NaN
    lignes.push({
      id: a.id, tourneeId: t.id, date: t.date, membreId: t.member_id, salarie: t.team_members?.full_name ?? 'Salarié',
      client: t.clients?.name ?? null, village: libelleGroupe(a.commune, a.zone), villageCle: cleGroupe(a),
      adresse: a.numero ? `${a.numero} ${a.rue}` : a.rue, type: a.type, quantite: a.quantite, remis: colisRemis(a),
      statut: a.statut, famille: familleStatut(a.statut), le: Number.isFinite(ms) ? ms : null, note: a.note,
      photos: photos.get(a.id) ?? 0, cloturee: t.statut === 'cloturee', rang: a.rang,
    })
  }
  return lignes.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0)
    || x.salarie.localeCompare(y.salarie, 'fr') || (x.le ?? Infinity) - (y.le ?? Infinity) || x.rang - y.rang)
}

export interface Anomalie {
  code: 'sans_heure' | 'partiel' | 'collecte_ouverte' | 'non_traite_cloture' | 'sans_synthese'
  libelle: string
  /** Arrêts concernés (vide pour une anomalie de tournée). */
  arretIds: string[]
  tourneeIds: string[]
}

const LIBELLES: Record<Anomalie['code'], string> = {
  sans_heure: 'Traités sans heure de passage',
  partiel: 'Livrés en partie',
  collecte_ouverte: 'Collectes non traitées (tournée terminée)',
  non_traite_cloture: 'Colis non traités (tournée terminée)',
  sans_synthese: 'Tournées terminées sans photo de synthèse',
}

/** Incohérences à contrôler. `avecSynthese` = tournées qui ont au moins une photo de synthèse. */
export function anomalies(lignes: LigneSuivi[], tournees: TourneeColis[], avecSynthese: Set<string>): Anomalie[] {
  const out: Anomalie[] = []
  const ajoute = (code: Anomalie['code'], arretIds: string[], tourneeIds: string[]) => {
    if (arretIds.length || tourneeIds.length) out.push({ code, libelle: LIBELLES[code], arretIds, tourneeIds })
  }
  const ids = (f: (l: LigneSuivi) => boolean) => lignes.filter(f).map(l => l.id)
  ajoute('sans_heure', ids(l => !!l.statut && l.le == null), [])
  ajoute('partiel', ids(l => l.famille === 'livre' && l.type !== 'col' && l.remis < l.quantite), [])
  ajoute('collecte_ouverte', ids(l => l.type === 'col' && !l.statut && l.cloturee), [])
  ajoute('non_traite_cloture', ids(l => l.type !== 'col' && !l.statut && l.cloturee), [])
  ajoute('sans_synthese', [], tournees.filter(t => t.statut === 'cloturee' && !avecSynthese.has(t.id)).map(t => t.id))
  return out
}

/** Arrêts qui portent une anomalie (filtre « Anomalies »). */
export function idsAnomalies(liste: Anomalie[]): Set<string> {
  return new Set(liste.flatMap(a => a.arretIds))
}

export interface FiltresSuivi {
  membreId: string
  villageCle: string
  statut: FiltreSuivi
  q: string
}

export function filtrerSuivi(lignes: LigneSuivi[], f: FiltresSuivi, enAnomalie: Set<string>): LigneSuivi[] {
  const mot = f.q.trim().toLowerCase()
  return lignes.filter(l => {
    if (f.membreId && l.membreId !== f.membreId) return false
    if (f.villageCle && l.villageCle !== f.villageCle) return false
    if (f.statut === 'livres' && !(l.famille === 'livre' && l.type !== 'col')) return false
    if (f.statut === 'avises' && l.famille !== 'attente') return false
    if (f.statut === 'retours' && l.famille !== 'retour') return false
    if (f.statut === 'collectes' && l.type !== 'col') return false
    if (f.statut === 'non_traites' && (l.statut || l.type === 'col')) return false
    if (f.statut === 'anomalies' && !enAnomalie.has(l.id)) return false
    if (!mot) return true
    return `${l.adresse} ${l.village} ${l.salarie} ${l.client ?? ''} ${l.note ?? ''}`.toLowerCase().includes(mot)
  })
}

export interface TotauxSuivi extends CompteursTournee {
  premier: number | null
  dernier: number | null
  /** Minutes entre le premier et le dernier passage. */
  dureeMin: number | null
}

export function totauxSuivi(lignes: LigneSuivi[]): TotauxSuivi {
  const c = compteursTournee(lignes.map(l => ({ type: l.type, statut: l.statut, quantite: l.quantite, colis_remis: l.statut ? l.remis : null })))
  const heures = lignes.map(l => l.le).filter((x): x is number => x != null)
  const premier = heures.length ? Math.min(...heures) : null
  const dernier = heures.length ? Math.max(...heures) : null
  return { ...c, premier, dernier, dureeMin: premier != null && dernier != null ? Math.round((dernier - premier) / 60_000) : null }
}

export interface GroupeVillage extends TotauxSuivi {
  cle: string
  libelle: string
  lignes: LigneSuivi[]
}

export type RegroupementSuivi = 'village' | 'tournee' | 'jour'

const libelleJour = (iso: string) => {
  const [a, m, j] = iso.split('-').map(Number)
  return new Date(a, m - 1, j).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
}

/**
 * Regroupe les arrêts par village (zones de Brumath à part), par tournée (salarié + jour) ou par jour.
 * Village : dans l'ordre du premier passage, sans passage à la fin ; tournée et jour : du plus récent au plus ancien.
 */
export function grouperSuivi(lignes: LigneSuivi[], par: RegroupementSuivi): GroupeVillage[] {
  const cleDe = (l: LigneSuivi) => (par === 'village' ? l.villageCle : par === 'tournee' ? l.tourneeId : l.date)
  const libelleDe = (l: LigneSuivi) => (par === 'village' ? l.village : par === 'tournee' ? `${l.salarie} · ${libelleJour(l.date)}` : libelleJour(l.date))
  const m = new Map<string, LigneSuivi[]>()
  for (const l of lignes) m.set(cleDe(l), [...(m.get(cleDe(l)) ?? []), l])
  const groupes = [...m.entries()].map(([cle, ls]) => ({ cle, libelle: libelleDe(ls[0]), lignes: ls, ...totauxSuivi(ls) }))
  if (par === 'village') {
    return groupes.sort((a, b) => (a.premier ?? Infinity) - (b.premier ?? Infinity) || a.libelle.localeCompare(b.libelle, 'fr'))
  }
  return groupes.sort((a, b) => (b.lignes[0].date < a.lignes[0].date ? -1 : b.lignes[0].date > a.lignes[0].date ? 1 : 0)
    || a.libelle.localeCompare(b.libelle, 'fr'))
}

export const parVillage = (lignes: LigneSuivi[]) => grouperSuivi(lignes, 'village')

/** Minutes depuis le passage précédent DE LA MÊME TOURNÉE (arrêts datés seulement) ; premier passage : absent. */
export function ecartsPassage(lignes: LigneSuivi[]): Map<string, number> {
  const out = new Map<string, number>()
  const parTournee = new Map<string, LigneSuivi[]>()
  for (const l of lignes) if (l.le != null) parTournee.set(l.tourneeId, [...(parTournee.get(l.tourneeId) ?? []), l])
  for (const ls of parTournee.values()) {
    const tri = [...ls].sort((a, b) => (a.le as number) - (b.le as number))
    for (let i = 1; i < tri.length; i++) out.set(tri[i].id, Math.round(((tri[i].le as number) - (tri[i - 1].le as number)) / 60_000))
  }
  return out
}

export interface PasseHeure { heure: number; livre: number; attente: number; retour: number; neutre: number }

/** Passages par heure (heure locale), par famille de résultat. */
export function passagesParHeure(lignes: LigneSuivi[]): PasseHeure[] {
  const m = new Map<number, PasseHeure>()
  for (const l of lignes) {
    if (l.le == null || !l.famille) continue
    const h = new Date(l.le).getHours()
    const cur = m.get(h) ?? { heure: h, livre: 0, attente: 0, retour: 0, neutre: 0 }
    cur[l.famille]++
    m.set(h, cur)
  }
  return [...m.values()].sort((a, b) => a.heure - b.heure)
}

export const heureLocale = (ms: number | null) => (ms == null ? '—' : new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }))

const echapper = (v: string | number | null | undefined) => {
  const s = v == null ? '' : String(v)
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Export CSV détaillé (« ; », ouvert par Excel en français) : un arrêt par ligne. */
export function csvSuivi(lignes: LigneSuivi[], ecarts: Map<string, number>): string {
  const entete = ['Date', 'Heure', 'Salarié', 'Client', 'Village', 'Adresse', 'Type', 'Statut', 'Colis', 'Colis remis', 'Minutes depuis le précédent', 'Photos', 'Note']
  const rows = lignes.map(l => [
    l.date, heureLocale(l.le).replace('—', ''), l.salarie, l.client, l.village, l.adresse, LIBELLE_TYPE_ARRET[l.type],
    l.statut ? LIBELLE_STATUT_ARRET[l.statut] : 'Non traité', l.quantite, l.statut ? l.remis : '', ecarts.get(l.id) ?? '', l.photos, l.note,
  ])
  return [entete, ...rows].map(r => r.map(echapper).join(';')).join('\n')
}
