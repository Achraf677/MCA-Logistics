// Logique pure de l'onglet Justificatifs (Finance) : filtres, compteurs, mois. Aucune dépendance DB ni DOM.
import { estADeduireRemboursement, estCarburant, libelleCategorie } from '../../shared/lib/depenses'

export type FiltreJustif = 'a_traiter' | 'valides' | 'refuses' | 'a_rembourser'

export interface JustifLigne {
  statut: string
  moyen_paiement?: string | null
  montant_ttc_cts?: number | null
  rembourse_le?: string | null
  note?: string | null
  categorie?: string | null
  date_depense?: string | null
  created_at: string
}

const dansFiltre = (t: JustifLigne, f: FiltreJustif): boolean => {
  if (f === 'a_traiter') return t.statut === 'a_traiter'
  if (f === 'valides') return t.statut === 'traite'
  if (f === 'refuses') return t.statut === 'ignore'
  return estADeduireRemboursement({ moyen_paiement: t.moyen_paiement ?? null, montant_ttc_cts: t.montant_ttc_cts ?? null, statut: t.statut, rembourse_le: t.rembourse_le })
}

export function compteursJustificatifs(tickets: JustifLigne[]): Record<FiltreJustif, number> {
  return {
    a_traiter: tickets.filter(t => dansFiltre(t, 'a_traiter')).length,
    valides: tickets.filter(t => dansFiltre(t, 'valides')).length,
    refuses: tickets.filter(t => dansFiltre(t, 'refuses')).length,
    a_rembourser: tickets.filter(t => dansFiltre(t, 'a_rembourser')).length,
  }
}

/** Jour de la dépense (date saisie), sinon jour d'envoi. */
export const jourJustif = (t: Pick<JustifLigne, 'date_depense' | 'created_at'>): string => t.date_depense ?? t.created_at.slice(0, 10)

/** Les trois familles de justificatifs (+ les anciens sans moyen de paiement). */
export type TypeJustif = 'note_de_frais' | 'cb' | 'carburant' | 'autre'

export const LIBELLE_TYPE: Record<TypeJustif, string> = {
  note_de_frais: 'Notes de frais', cb: 'CB classique', carburant: 'CB carburant', autre: 'À préciser',
}
export const ORDRE_TYPES: TypeJustif[] = ['note_de_frais', 'cb', 'carburant', 'autre']

export const typeJustif = (t: Pick<JustifLigne, 'moyen_paiement'>): TypeJustif =>
  t.moyen_paiement === 'personnel' ? 'note_de_frais'
    : t.moyen_paiement === 'carte_societe' ? 'cb'
    : t.moyen_paiement === 'carte_carburant' ? 'carburant' : 'autre'

/** Filtres interactifs de l'écran (tous combinables). */
export interface CriteresJustif {
  type: TypeJustif | 'tous'
  /** id du déclarant (`uploaded_by`) ; '' = tous. */
  declarant: string
  /** carte (`qonto_4103`…) ; '' = toutes. */
  carte: string
  /** « AAAA-MM » ; '' = tous les mois. */
  mois: string
  /** Seulement ceux auxquels il manque une information. */
  incomplets: boolean
}

export const CRITERES_VIDES: CriteresJustif = { type: 'tous', declarant: '', carte: '', mois: '', incomplets: false }

export const nbCriteresActifs = (c: CriteresJustif): number =>
  (c.type !== 'tous' ? 1 : 0) + (c.declarant ? 1 : 0) + (c.carte ? 1 : 0) + (c.mois ? 1 : 0) + (c.incomplets ? 1 : 0)

type JustifFiltrable = JustifLigne & { uploaded_by?: string | null; carte?: string | null; vehicle_id?: string | null }

/** Il manque une information à compléter avant de valider (montant, date, carte, véhicule). */
export function estIncomplet(t: JustifFiltrable): boolean {
  if (t.montant_ttc_cts == null || t.montant_ttc_cts <= 0) return true
  if (!t.date_depense) return true
  const type = typeJustif(t)
  if (type === 'autre') return true
  if ((type === 'cb' || type === 'carburant') && !t.carte) return true
  if (type === 'carburant' && !t.vehicle_id) return true
  return false
}

/** Filtre rapide + recherche (note, catégorie, nom du déclarant) + filtres interactifs ; l'ordre d'entrée est gardé. */
export function filtrerJustificatifs<T extends JustifFiltrable>(
  tickets: T[], filtre: FiltreJustif, q: string, noms: Record<string, string> = {}, criteres: CriteresJustif = CRITERES_VIDES,
): T[] {
  const mot = q.trim().toLowerCase()
  return tickets.filter(t => {
    if (!dansFiltre(t, filtre)) return false
    if (criteres.type !== 'tous' && typeJustif(t) !== criteres.type) return false
    if (criteres.declarant && t.uploaded_by !== criteres.declarant) return false
    if (criteres.carte && t.carte !== criteres.carte) return false
    if (criteres.mois && !jourJustif(t).startsWith(criteres.mois)) return false
    if (criteres.incomplets && !estIncomplet(t)) return false
    if (!mot) return true
    const nom = t.uploaded_by ? (noms[t.uploaded_by] ?? '') : ''
    return `${t.note ?? ''} ${libelleCategorie(t.categorie)} ${nom}`.toLowerCase().includes(mot)
  })
}

/** Combien de justificatifs par famille (pour les pastilles). */
export function compterParType(tickets: Array<Pick<JustifLigne, 'moyen_paiement'>>): Record<TypeJustif, number> {
  const c: Record<TypeJustif, number> = { note_de_frais: 0, cb: 0, carburant: 0, autre: 0 }
  for (const t of tickets) c[typeJustif(t)] += 1
  return c
}

/** Mois (« AAAA-MM ») présents dans la liste, du plus récent au plus ancien. */
export function moisPresents(tickets: Array<Pick<JustifLigne, 'date_depense' | 'created_at'>>): string[] {
  return [...new Set(tickets.map(t => jourJustif(t).slice(0, 7)))].sort((a, b) => b.localeCompare(a))
}

export interface SectionJustif<T> {
  cle: TypeJustif
  libelle: string
  rows: T[]
  totalCts: number
  /** Notes de frais seulement : un sous-groupe par salarié (le plus dû d'abord). */
  parSalarie?: Array<{ cle: string; libelle: string; rows: T[]; totalCts: number }>
}

const somme = (rows: Array<Pick<JustifLigne, 'montant_ttc_cts'>>) => rows.reduce((s, t) => s + (t.montant_ttc_cts ?? 0), 0)

/** « À traiter » en sous-sections : notes de frais (par salarié), CB classique, CB carburant, puis les anciens sans moyen. Sections vides omises. */
export function sectionsATraiter<T extends JustifFiltrable>(rows: T[], nomDe: (t: T) => string): Array<SectionJustif<T>> {
  const out: Array<SectionJustif<T>> = []
  for (const cle of ORDRE_TYPES) {
    const r = rows.filter(t => typeJustif(t) === cle)
    if (r.length === 0) continue
    const section: SectionJustif<T> = { cle, libelle: LIBELLE_TYPE[cle], rows: r, totalCts: somme(r) }
    if (cle === 'note_de_frais') {
      const map = new Map<string, T[]>()
      for (const t of r) {
        const k = t.uploaded_by ?? 'inconnu'
        const l = map.get(k)
        if (l) l.push(t); else map.set(k, [t])
      }
      section.parSalarie = [...map.entries()]
        .map(([k, l]) => ({ cle: k, libelle: nomDe(l[0]), rows: l, totalCts: somme(l) }))
        .sort((a, b) => b.totalCts - a.totalCts || a.libelle.localeCompare(b.libelle))
    }
    out.push(section)
  }
  return out
}

export type TonEtat = 'warning' | 'success' | 'info' | 'danger'

/** Un seul état affiché par justificatif (colonne « Statut » et en-tête du tiroir). */
export function etatJustificatif(t: JustifLigne): { libelle: string; ton: TonEtat } {
  if (t.statut === 'ignore') return { libelle: 'Refusé', ton: 'danger' }
  if (t.statut === 'a_traiter') return { libelle: 'À traiter', ton: 'warning' }
  if (t.moyen_paiement === 'personnel') {
    return t.rembourse_le ? { libelle: 'Remboursé', ton: 'info' } : { libelle: 'À rembourser', ton: 'warning' }
  }
  return { libelle: 'Validé', ton: 'success' }
}

export interface EtapeSuivi {
  cle: 'envoye' | 'valide' | 'refuse' | 'pennylane' | 'rembourse'
  libelle: string
  date: string | null
  /** fait = acquis · attente = prochaine étape · refuse = fin refusée. */
  etat: 'fait' | 'attente' | 'refuse'
}

/** Frise de suivi d'un justificatif : envoyé → validé → envoyé à Pennylane → (note de frais) remboursé ; ou envoyé → refusé. */
export function etapesSuivi(t: JustifLigne & {
  traite_at?: string | null; pennylane_envoye_le?: string | null
}): EtapeSuivi[] {
  const etapes: EtapeSuivi[] = [{ cle: 'envoye', libelle: 'Envoyé', date: t.created_at, etat: 'fait' }]
  if (t.statut === 'ignore') return [...etapes, { cle: 'refuse', libelle: 'Refusé', date: t.traite_at ?? null, etat: 'refuse' }]
  const valide = t.statut === 'traite'
  etapes.push({ cle: 'valide', libelle: 'Validé', date: valide ? (t.traite_at ?? null) : null, etat: valide ? 'fait' : 'attente' })
  if (!estCarburant(t.moyen_paiement)) {
    etapes.push({ cle: 'pennylane', libelle: 'Pennylane', date: t.pennylane_envoye_le ?? null, etat: t.pennylane_envoye_le ? 'fait' : 'attente' })
  }
  if (t.moyen_paiement === 'personnel') {
    etapes.push({ cle: 'rembourse', libelle: 'Remboursé', date: t.rembourse_le ?? null, etat: t.rembourse_le ? 'fait' : 'attente' })
  }
  return etapes
}

export { initiales } from '../../shared/lib/initiales'
