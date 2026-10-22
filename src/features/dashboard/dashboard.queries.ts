import { supabase } from '../../app/providers'
import type { CourseDuJour } from './dashboard.logic'

/**
 * Tout ce que le Dashboard affiche, en UNE vague de requêtes parallèles.
 *
 * La tendance charge les 12 derniers mois de livraisons d'un coup et se
 * découpe ensuite en mémoire (`dashboard.logic.ts`) : changer de période ne
 * refait aucune requête. Avant : deux requêtes PAR MOIS, donc 12 à 24.
 *
 * Les montants suivent la RLS : un chauffeur n'arrive jamais ici (redirigé
 * vers Mes courses), un président / DG voit toute la société.
 */
export async function getDashboard(debutPeriode: string, finPeriode: string, aujourdhui: string) {
  const [livraisons, jour, livrees, recentes] = await Promise.all([
    supabase
      .from('deliveries')
      .select('date, statut, amount_ht_cts')
      .gte('date', debutPeriode)
      .lte('date', finPeriode),
    // Journée : les courses d'aujourd'hui + les ouvertes restées en arrière.
    supabase
      .from('deliveries')
      .select('date, statut, arrival_time, probleme_le')
      .or(`date.eq.${aujourdhui},and(date.lt.${aujourdhui},statut.in.(planifiee,en_cours))`)
      // Relevés de messagerie et forfaits : pas des courses de la journée.
      .or('prestation.is.null,prestation.not.in.(messagerie,forfait)'),
    supabase
      .from('deliveries')
      .select('amount_ht_cts')
      .eq('statut', 'livree'),
    // Activité récente : les dernières MODIFIÉES, pas les plus lointaines dans
    // le futur. Lecture seule : un clic ouvre la livraison dans Livraisons.
    supabase
      .from('deliveries')
      .select('id, date, statut, amount_ht_cts, clients!client_id(name), team_members!driver_id(full_name)')
      .order('updated_at', { ascending: false })
      .limit(12)
      .returns<LigneMois[]>(),
  ])

  const erreur = [livraisons, jour, livrees, recentes].find(r => r.error)?.error ?? null

  return {
    erreur,
    livraisons: livraisons.data ?? [],
    jour: (jour.data ?? []) as CourseDuJour[],
    livrees: livrees.data ?? [],
    recentes: recentes.data ?? [],
  }
}

/** Livraisons d'un mois (clic sur une barre), lecture seule, hors annulées. */
export async function getLivraisonsDuMois(debut: string, fin: string) {
  return supabase
    .from('deliveries')
    .select('id, date, statut, amount_ht_cts, clients!client_id(name), team_members!driver_id(full_name)')
    .gte('date', debut)
    .lte('date', fin)
    .neq('statut', 'annulee')
    .order('date', { ascending: false })
    .returns<LigneMois[]>()
}

export interface LigneMois {
  id: string
  date: string
  statut: string
  amount_ht_cts: number | null
  clients: { name: string } | null
  team_members: { full_name: string } | null
}
