export type DeliveryType = 'medical' | 'ecommerce' | 'retail' | 'particulier'

export interface ExtractedDelivery {
  client_name: string | null
  type: DeliveryType | null
  date: string | null
  pickup_address: string | null
  delivery_address: string | null
  km: number | null
  weight_kg: number | null
  montant_ht_eur: number | null
  heure: string | null
  driver_name: string | null
  vehicle: string | null
  notes: string
  /** Champs que l'IA n'a pas trouvés dans la feuille de route → à compléter. */
  missing: string[]
}

/** Entrée de l'extraction : soit du texte collé, soit un fichier en base64 (+ mime). */
export interface ExtractInput {
  text?: string
  fileBase64?: string
  mimeType?: string
  instructions?: string
}

export interface ExtractResponse {
  ok: boolean
  error?: string
  data?: {
    deliveries: ExtractedDelivery[]
    raw_text: string
  }
}
