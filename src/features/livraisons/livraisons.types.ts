import type { DeliveryExtraLine } from '../../shared/lib/money'

// Ré-export : DeliveryExtraLine vit dans shared/lib/money pour être consommable
// hors features/livraisons (TVA, encaissement…) sans casser la règle
// « aucun import entre features/ ». Le ré-export garde les imports existants.
export type { DeliveryExtraLine }

// V2 statuses — machine à états gardée (planifiee → en_cours → livree → facturee → payee)
export type DeliveryStatus =
  | 'planifiee'
  | 'en_cours'
  | 'livree'
  | 'facturee'
  | 'payee'
  | 'annulee'

export type DeliveryType = 'medical' | 'ecommerce' | 'retail' | 'particulier'

export interface Delivery {
  id: string
  company_id: string
  client_id: string
  vehicle_id: string | null
  driver_id: string | null
  /** DB column 'date' — date planifiée */
  date: string
  type: DeliveryType | null
  description: string | null
  pickup_address: string | null
  delivery_address: string | null
  /** Coordonnées géocodées de l'adresse de livraison (Photon). */
  delivery_lat: number | null
  delivery_lng: number | null
  /** DB column 'km' — distance en km (tarif km) */
  km: number | null
  /** DB column 'empty_km' — km parcourus à vide (optionnel) */
  empty_km: number | null
  /** DB column 'weight_kg' — utilisé comme nb palettes (tarif palette) */
  weight_kg: number | null
  // Colonnes legacy (rétro-compat)
  montant_ht_cts: number
  tva_rate: number
  montant_ttc_cts: number | null
  // Colonnes v2 (delta migration)
  amount_ht_cts: number | null
  tva_cts: number | null
  amount_ttc_cts: number | null
  invoiced_at: string | null
  paid_at: string | null
  // Statut (text en DB, valeurs v2)
  statut: string
  pennylane_invoice_id: string | null
  pennylane_invoice_number: string | null
  pennylane_synced_at: string | null
  facture_url: string | null
  bon_livraison_url: string | null
  lettre_voiture_url: string | null
  sync_pending: boolean
  sync_error: string | null
  notes: string | null
  /** Nombre de relances envoyées (défaut DB : 0) */
  relance_count: number
  /** Horodatage de la dernière relance envoyée */
  last_relance_at: string | null
  /** Preuve de livraison (POD) */
  pod_recipient_name: string | null
  pod_captured_at: string | null
  /** Lignes supplémentaires (attente, retour à vide, forfait…). */
  extra_lines: DeliveryExtraLine[]
  // ── Lettre de voiture nationale (migration 20260719120000) ─────────────────
  /** Mentions obligatoires LV (décret 99-752). NULL = à compléter avant génération. */
  expediteur_nom: string | null
  expediteur_siren: string | null
  destinataire_nom: string | null
  marchandise_desc: string | null
  nb_colis: number | null
  poids_kg_reel: number | null
  /** Numéro applicatif « LV-AAAA-N ». Attribué à la 1ʳᵉ génération. */
  lv_numero: string | null
  /** Signatures collectées (base64 PNG + timestamp + geo optionnelle). */
  lv_signatures: LvSignatures
  /** URL du PDF LV archivé sur Drive (nouvelle génération). */
  lv_pdf_url: string | null
  created_at: string
  updated_at: string
}

/** Signature capturée sur SignaturePad — 3 rôles possibles. */
export interface LvSignatureData {
  /** Data URL PNG (`data:image/png;base64,…`). */
  png: string
  /** Timestamp ISO 8601 UTC de la capture (sert de date de prise en charge / livraison). */
  ts: string
  /** Géoloc optionnelle si autorisée par le navigateur. */
  geo?: { lat: number; lng: number; acc?: number }
}

export type LvSignatures = {
  expediteur?: LvSignatureData
  transporteur?: LvSignatureData
  destinataire?: LvSignatureData
}

export interface DeliveryRow extends Delivery {
  clients: { name: string; tariff_mode: string; tariff_rate_cts: number | null } | null
  vehicles: { label: string } | null
  team_members: { full_name: string } | null
}

export type DeliveryInsert = Omit<
  Delivery,
  | 'id' | 'created_at' | 'updated_at'
  | 'pennylane_invoice_id' | 'pennylane_invoice_number' | 'pennylane_synced_at'
  | 'facture_url' | 'bon_livraison_url' | 'lettre_voiture_url'
  | 'sync_pending' | 'sync_error'
  // Colonnes legacy non inscriptibles en v2 :
  // montant_ttc_cts est GENERATED ALWAYS ; montant_ht_cts a désormais DEFAULT 0 ;
  // tva_rate a DEFAULT 20 — on ne les écrit plus, on utilise amount_* v2.
  | 'montant_ht_cts' | 'tva_rate' | 'montant_ttc_cts'
  // Gestion des relances : mise à jour via relances.queries (markRelanceSent), pas lors du create.
  | 'relance_count' | 'last_relance_at'
  // POD : mis à jour via savePod(), pas lors du create.
  | 'pod_recipient_name' | 'pod_captured_at'
  // extra_lines : optionnel à l'insert (default DB '[]'), écrit via updateDelivery.
  | 'extra_lines'
  // Lettre de voiture : tous optionnels à l'insert (nullable/DEFAULT côté DB).
  | 'expediteur_nom' | 'expediteur_siren' | 'destinataire_nom'
  | 'marchandise_desc' | 'nb_colis' | 'poids_kg_reel'
  | 'lv_numero' | 'lv_signatures' | 'lv_pdf_url'
> & {
  extra_lines?: DeliveryExtraLine[]
  // Ré-exposés comme optionnels pour rester écrivables via updateDelivery(Partial).
  expediteur_nom?: string | null
  expediteur_siren?: string | null
  destinataire_nom?: string | null
  marchandise_desc?: string | null
  nb_colis?: number | null
  poids_kg_reel?: number | null
  lv_numero?: string | null
  lv_signatures?: LvSignatures
  lv_pdf_url?: string | null
}

export type DeliveryUpdate = Partial<Omit<Delivery, 'id' | 'company_id' | 'created_at'>>

export interface DeliveryFilters {
  date_from?: string
  date_to?: string
  status?: DeliveryStatus | 'all'
  client_id?: string
  vehicle_id?: string
  driver_id?: string
}
