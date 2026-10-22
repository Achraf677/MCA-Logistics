// Logique pure de l'onglet Justificatifs (Finance) : filtres, compteurs, mois. Aucune dépendance DB ni DOM.
import { estADeduireRemboursement, libelleCategorie } from '../../shared/lib/depenses'

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
