// Query d'alimentation du moteur d'alertes métier (alertesEngine.ts).
// Lecture seule. Vit dans shared/ pour être consommée sans couplage
// cross-feature (AlertesBell / Dashboard).
import { supabase } from '../../app/providers'
import { getARapprocherCounts } from './aRapprocher.queries'
import {
  buildAlertes, type AlerteMetier, type AlertesEngineInput,
} from './alertesEngine'

export async function getAlertesMetier(today: Date = new Date()): Promise<AlerteMetier[]> {
  // Recupere avant le lot : les deux requetes de droits en ont besoin, et un
  // `await` glisse dans le tableau de Promise.all les ferait partir en serie.
  const { data: { user } } = await supabase.auth.getUser()

  const [aRapprocher, facturesRes, livreesRes, devisRes, vehiculesRes, notesRes, sansJustifRes, docsLivraisonRes, ticketsRes, profilRes, droitChargesRes] = await Promise.all([
    getARapprocherCounts().catch(() => null),
    // Factures émises non payées (encours) — avec délai de paiement du client.
    supabase
      .from('deliveries')
      .select('id, invoiced_at, amount_ttc_cts, montant_ttc_cts, clients!client_id(payment_terms)')
      .eq('statut', 'facturee'),
    // Livrées non facturées.
    supabase
      .from('deliveries')
      .select('id, delivered_at')
      .eq('statut', 'livree'),
    // Devis en attente.
    supabase
      .from('quotes')
      .select('id, statut, date')
      .in('statut', ['brouillon', 'envoye']),
    // Véhicules actifs + échéances.
    supabase
      .from('vehicles')
      .select('id, label, ct_expiry, insurance_expiry, next_revision_date')
      .neq('status', 'inactive'),
    // Notes de frais non remboursées.
    supabase
      .from('charges')
      .select('id, mode_paiement, rembourse_le, montant_ttc_cts')
      .eq('mode_paiement', 'note_de_frais')
      .is('rembourse_le', null)
      .eq('est_immobilisation', false),
    // Livrées/facturées/payées — candidates au contrôle "sans justificatif".
    supabase
      .from('deliveries')
      .select('id, statut, pod_captured_at, lv_pdf_url, justif_non_requis')
      .in('statut', ['livree', 'facturee', 'payee']),
    // Documents liés à une livraison (POD ou autre pièce jointe).
    supabase
      .from('documents')
      .select('entity_type, entity_id')
      .eq('entity_type', 'delivery'),
    // Tickets chauffeurs en attente — compteur seul, aucune ligne rapatriée.
    supabase
      .from('receipts_inbox')
      .select('id', { count: 'exact', head: true })
      .eq('statut', 'a_traiter'),
    // Le droit de TRAITER ces tickets. Sans ce contrôle, un chauffeur voyait
    // dans sa cloche « 2 tickets chauffeur à traiter » — les siens, que la RLS
    // l'autorise à relire — avec un lien vers un écran Finance qui lui répond
    // « Accès non autorisé ». Une alerte sur laquelle on ne peut rien faire
    // n'est pas une alerte, c'est du bruit.
    // Même règle que la policy SQL : président, ou droit `finance.charges`.
    supabase.from('profiles').select('role').eq('id', user?.id ?? '').maybeSingle(),
    supabase.from('user_permissions').select('can_view').eq('resource_key', 'finance.charges').maybeSingle(),
  ])

  const peutTraiterLesTickets =
    (profilRes.data as { role?: string } | null)?.role === 'president'
    || (droitChargesRes.data as { can_view?: boolean } | null)?.can_view === true

  const input: AlertesEngineInput = {
    aRapprocher,
    facturesImpayees: (facturesRes.data ?? []).map(d => {
      const client = (Array.isArray(d.clients) ? d.clients[0] : d.clients) as
        | { payment_terms?: number } | null
      return {
        id: d.id,
        invoiced_at: d.invoiced_at,
        amount_ttc_cts: d.amount_ttc_cts,
        montant_ttc_cts: d.montant_ttc_cts,
        payment_terms: client?.payment_terms ?? 30,
      }
    }),
    livreesNonFacturees: (livreesRes.data ?? []).map(d => ({ id: d.id, delivered_at: d.delivered_at })),
    devisEnAttente: (devisRes.data ?? []).map(q => ({ id: q.id, statut: q.statut, date: q.date })),
    vehicules: (vehiculesRes.data ?? []).map(v => ({
      id: v.id, label: v.label,
      ct_expiry: v.ct_expiry, insurance_expiry: v.insurance_expiry,
      next_revision_date: v.next_revision_date,
    })),
    notesDeFrais: (notesRes.data ?? []).map(c => ({
      id: c.id, mode_paiement: c.mode_paiement,
      rembourse_le: c.rembourse_le, montant_ttc_cts: c.montant_ttc_cts,
    })),
    // `head: true` sur le compteur : on ne rapatrie aucune ligne, juste le nombre.
    // Compte a zero pour qui ne peut pas les traiter — voir la requete des droits.
    ticketsATraiter: peutTraiterLesTickets ? (ticketsRes.count ?? 0) : 0,
    livraisonsPourJustif: (sansJustifRes.data ?? []).map(d => ({
      id: d.id, statut: d.statut, pod_captured_at: d.pod_captured_at, lv_pdf_url: d.lv_pdf_url,
      justif_non_requis: d.justif_non_requis,
    })),
    documentsLivraison: (docsLivraisonRes.data ?? []).map(d => ({
      entity_type: d.entity_type, entity_id: d.entity_id,
    })),
  }

  return buildAlertes(input, today)
}
