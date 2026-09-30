import { supabase } from '../../app/providers'
import type { DeliveryRow } from '../livraisons/livraisons.types'
import type { CourseDuJour, FactureOuverte } from './dashboard.logic'

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
  const [livraisons, jour, livrees, facturees, recentes] = await Promise.all([
    supabase
      .from('deliveries')
      .select('date, statut, amount_ht_cts')
      .gte('date', debutPeriode)
      .lte('date', finPeriode),
    // Journée : les courses d'aujourd'hui + les ouvertes restées en arrière.
    supabase
      .from('deliveries')
      .select('date, statut, arrival_time, probleme_le')
      .or(`date.eq.${aujourdhui},and(date.lt.${aujourdhui},statut.in.(planifiee,en_cours))`),
    supabase
      .from('deliveries')
      .select('amount_ht_cts')
      .eq('statut', 'livree'),
    supabase
      .from('deliveries')
      .select('invoiced_at, amount_ttc_cts, clients!client_id(payment_terms)')
      .eq('statut', 'facturee'),
    // Activité récente : les dernières MODIFIÉES, pas les plus lointaines dans
    // le futur. `*` assumé : la ligne s'ouvre dans le tiroir d'édition.
    supabase
      .from('deliveries')
      .select('*, clients!client_id(name), vehicles!vehicle_id(label), team_members!driver_id(full_name)')
      .order('updated_at', { ascending: false })
      .limit(6)
      .returns<DeliveryRow[]>(),
  ])

  const erreur = [livraisons, jour, livrees, facturees, recentes].find(r => r.error)?.error ?? null

  return {
    erreur,
    livraisons: livraisons.data ?? [],
    jour: (jour.data ?? []) as CourseDuJour[],
    livrees: livrees.data ?? [],
    facturees: (facturees.data ?? []).map((f): FactureOuverte => {
      const client = (Array.isArray(f.clients) ? f.clients[0] : f.clients) as { payment_terms?: number | null } | null
      return { invoiced_at: f.invoiced_at, amount_ttc_cts: f.amount_ttc_cts, payment_terms: client?.payment_terms ?? 30 }
    }),
    recentes: recentes.data ?? [],
  }
}
