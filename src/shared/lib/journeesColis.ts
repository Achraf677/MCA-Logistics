// Journée de colis du salarié (lot S1, plan mca-spec/PLAN-ESPACE-SALARIE.md § 0) — PUR, testé.
// Une journée = un salarié × un jour × un client de messagerie (fixé par l'admin dans la
// fiche Équipe). Le salarié déclare ; le bureau valide, corrige ou refuse ; validée =
// verrouillée pour le salarié (garanti par la base : trigger `journees_colis_garde`).
// Partagé : Mes courses (salarié) et Équipe › Validation / Rapports (bureau).

export type StatutJournee = 'brouillon' | 'envoyee' | 'validee' | 'refusee'

export interface JourneeColis {
  id: string
  company_id: string
  member_id: string
  date: string
  client_id: string
  colis_domicile: number
  colis_relais: number
  colis_litige: number
  litige_raison: string | null
  note: string | null
  statut: StatutJournee
  domicile_valide: number | null
  relais_valide: number | null
  litige_valide: number | null
  motif_refus: string | null
  motif_modification: string | null
  envoyee_le: string | null
  valide_par: string | null
  valide_le: string | null
  created_at: string
  updated_at: string
  clients?: { name: string } | null
  team_members?: { full_name: string } | null
}

export interface HistoriqueJournee {
  id: string
  journee_id: string
  action: 'creation' | 'envoi' | 'validation' | 'refus' | 'correction' | 'retour_brouillon' | 'suppression'
  avant: Partial<JourneeColis> | null
  apres: Partial<JourneeColis> | null
  motif: string | null
  par: string | null
  le: string
}

export const LIBELLE_STATUT_JOURNEE: Record<StatutJournee, string> = {
  brouillon: 'Brouillon',
  envoyee: 'Envoyée au bureau',
  validee: 'Validée',
  refusee: 'À corriger',
}

export const COULEUR_STATUT_JOURNEE: Record<StatutJournee, 'muted' | 'info' | 'success' | 'danger'> = {
  brouillon: 'muted',
  envoyee: 'info',
  validee: 'success',
  refusee: 'danger',
}

export const LIBELLE_ACTION_HISTORIQUE: Record<HistoriqueJournee['action'], string> = {
  creation: 'Créée',
  envoi: 'Envoyée au bureau',
  validation: 'Validée',
  refus: 'Renvoyée à corriger',
  correction: 'Corrigée par le bureau',
  retour_brouillon: 'Repassée en brouillon',
  suppression: 'Supprimée',
}

/** Le salarié peut-il encore modifier / supprimer sa journée ? (miroir du trigger) */
export function salariePeutModifier(j: Pick<JourneeColis, 'statut'> | null | undefined): boolean {
  return !j || j.statut !== 'validee'
}

export interface SaisieJournee {
  colis_domicile: number
  colis_relais: number
  colis_litige: number
  litige_raison: string
}

/** Entier ≥ 0 depuis une saisie (vide = 0) ; null si invalide. */
export function nombreColis(v: string | number | null | undefined): number | null {
  if (v == null || v === '') return 0
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.').trim())
  return Number.isInteger(n) && n >= 0 && n <= 100000 ? n : null
}

/**
 * Ce qui empêche d'ENVOYER la journée au bureau (un brouillon s'enregistre toujours).
 * Litige déclaré = raison obligatoire ; au moins un colis ou un litige ; au moins une photo
 * du compteur de l'appareil (preuve).
 */
export function manquesPourEnvoyer(s: SaisieJournee, nbPhotos: number): string[] {
  const manques: string[] = []
  if (s.colis_domicile + s.colis_relais + s.colis_litige === 0) manques.push('Aucun colis déclaré')
  if (s.colis_litige > 0 && !s.litige_raison.trim()) manques.push('Raison du litige')
  if (nbPhotos === 0) manques.push("Photo du compteur de l'appareil")
  return manques
}

/** Nombres qui comptent : validés si la journée est validée, sinon déclarés. */
export function colisRetenus(j: Pick<JourneeColis, 'statut' | 'colis_domicile' | 'colis_relais' | 'colis_litige'
  | 'domicile_valide' | 'relais_valide' | 'litige_valide'>): { domicile: number; relais: number; litige: number } {
  if (j.statut === 'validee') {
    return {
      domicile: j.domicile_valide ?? j.colis_domicile,
      relais: j.relais_valide ?? j.colis_relais,
      litige: j.litige_valide ?? j.colis_litige,
    }
  }
  return { domicile: j.colis_domicile, relais: j.colis_relais, litige: j.colis_litige }
}

/** Le bureau a-t-il changé les nombres déclarés ? */
export function estCorrigee(j: JourneeColis): boolean {
  if (j.statut !== 'validee') return false
  const r = colisRetenus(j)
  return r.domicile !== j.colis_domicile || r.relais !== j.colis_relais || r.litige !== j.colis_litige
}

export interface TotauxColis {
  jours: number
  domicile: number
  relais: number
  litige: number
  /** Journées validées seulement. */
  valides: { domicile: number; relais: number; litige: number; jours: number }
  enAttente: number
  aCorriger: number
}

/** Totaux d'une liste de journées (brouillons exclus). Un « jour » = une date distincte. */
export function totauxJournees(journees: JourneeColis[]): TotauxColis {
  const t: TotauxColis = {
    jours: 0, domicile: 0, relais: 0, litige: 0,
    valides: { domicile: 0, relais: 0, litige: 0, jours: 0 }, enAttente: 0, aCorriger: 0,
  }
  const dates = new Set<string>()
  const datesValides = new Set<string>()
  for (const j of journees) {
    if (j.statut === 'brouillon') continue
    const r = colisRetenus(j)
    dates.add(j.date)
    t.domicile += r.domicile; t.relais += r.relais; t.litige += r.litige
    if (j.statut === 'validee') {
      datesValides.add(j.date)
      t.valides.domicile += r.domicile; t.valides.relais += r.relais; t.valides.litige += r.litige
    }
    if (j.statut === 'envoyee') t.enAttente += 1
    if (j.statut === 'refusee') t.aCorriger += 1
  }
  t.jours = dates.size
  t.valides.jours = datesValides.size
  return t
}

/** Montant dû au salarié (centimes) pour des colis : domicile × tarif + relais × tarif. null si un tarif manque. */
export function remunerationCts(
  colis: { domicile: number; relais: number },
  tarifs: { tarif_domicile_cts: number | null; tarif_relais_cts: number | null },
): number | null {
  const besoinDom = colis.domicile > 0, besoinRel = colis.relais > 0
  if ((besoinDom && tarifs.tarif_domicile_cts == null) || (besoinRel && tarifs.tarif_relais_cts == null)) return null
  return colis.domicile * (tarifs.tarif_domicile_cts ?? 0) + colis.relais * (tarifs.tarif_relais_cts ?? 0)
}

/** Ligne de rapport par salarié (bureau). */
export interface LigneRapport {
  member_id: string
  nom: string
  totaux: TotauxColis
  /** Sur le validé seulement ; null si tarif manquant. */
  du_cts: number | null
}

export function rapportParSalarie(
  journees: JourneeColis[],
  membres: Array<{ id: string; full_name: string; tarif_domicile_cts: number | null; tarif_relais_cts: number | null }>,
): LigneRapport[] {
  return membres
    .map(m => {
      const siennes = journees.filter(j => j.member_id === m.id)
      const totaux = totauxJournees(siennes)
      return { member_id: m.id, nom: m.full_name, totaux, du_cts: remunerationCts(totaux.valides, m) }
    })
    .filter(l => l.totaux.jours > 0)
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
}

/** CSV (séparateur « ; », Excel FR) du rapport. Montants en euros avec virgule. */
export function rapportCsv(lignes: LigneRapport[], periode: string): string {
  const eur = (c: number | null) => (c == null ? '' : (c / 100).toFixed(2).replace('.', ','))
  const tete = ['Période', 'Salarié', 'Jours', 'Domicile validés', 'Relais validés', 'Litiges validés', 'En attente', 'À corriger', 'Dû (€)']
  const corps = lignes.map(l => [periode, l.nom, l.totaux.valides.jours, l.totaux.valides.domicile, l.totaux.valides.relais,
    l.totaux.valides.litige, l.totaux.enAttente, l.totaux.aCorriger, eur(l.du_cts)])
  return [tete, ...corps].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n')
}

/** Premier et dernier jour (AAAA-MM-JJ) du mois d'une date AAAA-MM-JJ. */
export function bornesMois(date: string): { du: string; au: string } {
  const [a, m] = date.split('-').map(Number)
  const fin = new Date(a, m, 0).getDate()
  const mm = String(m).padStart(2, '0')
  return { du: `${a}-${mm}-01`, au: `${a}-${mm}-${String(fin).padStart(2, '0')}` }
}
