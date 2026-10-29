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

/** Filtre rapide + recherche (note, catégorie, nom du déclarant) ; l'ordre d'entrée est gardé. */
export function filtrerJustificatifs<T extends JustifLigne & { uploaded_by?: string | null }>(
  tickets: T[], filtre: FiltreJustif, q: string, noms: Record<string, string> = {},
): T[] {
  const mot = q.trim().toLowerCase()
  return tickets.filter(t => {
    if (!dansFiltre(t, filtre)) return false
    if (!mot) return true
    const nom = t.uploaded_by ? (noms[t.uploaded_by] ?? '') : ''
    return `${t.note ?? ''} ${libelleCategorie(t.categorie)} ${nom}`.toLowerCase().includes(mot)
  })
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
