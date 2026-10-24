export type DocumentCategory =
  | 'Administratif'
  | 'Comptable'
  | 'RH'
  | 'Véhicule'
  | 'Client'
  | 'POD'
  // Photo prise AU CHARGEMENT, distincte de la preuve de livraison : les deux
  // jalons d'une meme course, pris a deux endroits et devant deux personnes
  // differentes. Les confondre rendrait impossible de savoir lequel manque.
  | 'Chargement'
  | 'LV'
  // Photo du compteur de l'appareil de scan, preuve d'une journée de colis (lot S1).
  | 'Compteur appareil'
  | 'Autre'

export interface DocumentRow {
  id: string
  company_id: string
  storage_path: string | null
  drive_file_id: string | null
  drive_link: string | null
  file_name: string
  mime_type: string | null
  size_bytes: number | null
  category: string | null
  entity_type: string | null
  entity_id: string | null
  uploaded_by: string | null
  notes: string | null
  created_at: string
  /** Onglet Documents (migration 20261024110000) : Inbox → proposition de l'IA → classé. */
  statut_tri?: 'a_trier' | 'propose' | 'classe'
  type_document?: string | null
  date_document?: string | null
  tiers?: string | null
  reference?: string | null
  montant_ttc_cts?: number | null
  resume?: string | null
  proposition?: PropositionDocument | null
  trie_le?: string | null
}

/** Ce que l'IA propose pour un document (Edge `trier-documents`), en attendant la confirmation. */
export interface PropositionDocument {
  type: string | null
  date: string | null
  tiers: string | null
  montant_ttc_cts: number | null
  reference: string | null
  resume: string | null
  confiance: { type: number; date: number; tiers: number; montant: number }
  /** Nom rangé proposé. */
  nom: string
  /** Le tiers lu correspond à une fiche client / fournisseur / salarié (son nom est alors celui de la fiche). */
  tiers_connu?: boolean
  /** Plaque d'un véhicule de la flotte reconnue sur le document. */
  vehicule?: string | null
  /** Dossier du Drive proposé (de la racine de rangement au dossier final) et, par niveau, « n'existe pas encore ». */
  chemin?: string[]
  chemin_nouveaux?: boolean[]
  chemin_confiance?: number
  /** Autres emplacements possibles (convention par défaut). */
  alternatives?: Array<{ chemin: string[]; nouveaux: boolean[] }>
  lu_via: 'image' | 'texte'
  propose_le: string
}

export interface UploadDocumentOptions {
  category?: DocumentCategory
  entity_type?: string
  entity_id?: string
  notes?: string
}
