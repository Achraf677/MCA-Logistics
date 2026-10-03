import type { DeliveryExtraLine } from '../../shared/lib/money'
import type { Prestation } from '../../shared/lib/prestations'

export type QuoteStatus =
  | 'brouillon'
  | 'envoye'
  | 'accepte'
  | 'refuse'
  | 'expire'
  | 'facture'
  | 'transforme'

/** Unité de la ligne principale d'un devis. */
export type UniteDevis = 'colis' | 'km' | 'palette' | 'forfait'

export interface Quote {
  id: string
  company_id: string
  client_id: string
  date: string
  valid_until: string | null
  description: string | null
  amount_ht_cts: number | null
  tva_rate: number | null
  tva_cts: number | null
  amount_ttc_cts: number | null
  pickup_address: string | null
  delivery_address: string | null
  vehicle_id: string | null
  driver_id: string | null
  statut: QuoteStatus
  pennylane_quote_id: string | null
  pennylane_quote_number: string | null
  pennylane_invoice_id: string | null
  notes: string | null
  // Fiche de prix (lots D1 + D2)
  prestation: Prestation | null
  unite: UniteDevis | null
  quantite: number | null
  prix_unitaire_cts: number | null
  extra_lines: DeliveryExtraLine[]
  reference_client: string | null
  autoliquidation: boolean
  accepte_le: string | null
  // Mêmes champs que la fiche livraison
  expediteur_nom: string | null
  expediteur_tel: string | null
  destinataire_nom: string | null
  destinataire_tel: string | null
  marchandise_desc: string | null
  nb_colis: number | null
  poids_kg: number | null
  volume_m3: number | null
  km: number | null
  created_at: string
  updated_at: string
  // joined
  clients?: { name: string } | null
}
