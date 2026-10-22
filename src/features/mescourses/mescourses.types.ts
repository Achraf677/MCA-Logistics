/**
 * Course telle que vue par le chauffeur : strictement ce qu'il lui faut pour
 * rouler et livrer. Pas de montant, pas de client facturé, pas de TVA — un
 * chauffeur n'a pas besoin de savoir combien la course est vendue, et ne pas
 * charger l'information est plus simple que de la charger puis la masquer.
 */
export interface CourseChauffeur {
  id: string
  date: string
  statut: string
  description: string | null
  pickup_address: string | null
  delivery_address: string | null
  delivery_lat: number | null
  delivery_lng: number | null
  pod_captured_at: string | null
  weight_kg: number | null
  /** Horodatage du chargement (migration 20260913090000). null = pas encore chargé. */
  charge_le: string | null
  expediteur_nom: string | null
  destinataire_nom: string | null
  pod_recipient_name: string | null
  /**
   * Position de l'arrêt de LIVRAISON dans la séquence de la journée
   * (partagée avec les tournées).
   */
  stop_order: number | null
  /** Position de l'arrêt de RETRAIT dans la MÊME séquence. */
  pickup_order: number | null
  /** Téléphone de qui remet la marchandise. Distinct du client facturé. */
  expediteur_tel: string | null
  /** Téléphone de qui la reçoit. */
  destinataire_tel: string | null
  /** Tournée de rattachement, quand le bureau en a composé une. */
  tour_id: string | null
  clients: { name: string; phone: string | null } | null
  vehicles: { label: string; plate: string } | null
  /** Consignes saisies au bureau (code, étage, horaires d'ouverture…). */
  notes: string | null
  /**
   * Heure de passage ESTIMÉE par la tournée, « HH:MM:SS » — pas un engagement.
   * Les engagements envers le client sont les `creneau_*`.
   */
  arrival_time: string | null
  nb_colis: number | null
  /** Fiche équipe du chauffeur (team_members.id). */
  driver_id: string | null
  /** Nom du chauffeur — null si la RLS de team_members ne le rend pas. */
  team_members: { full_name: string } | null
  /** Échec signalé sur le terrain (migration 20260930090000). */
  probleme_motif: string | null
  probleme_note: string | null
  probleme_le: string | null
  /** Fiche unique (migration 20261001090000). */
  urgent: boolean | null
  reference_client: string | null
  creneau_retrait_debut: string | null
  creneau_retrait_fin: string | null
  creneau_livraison_debut: string | null
  creneau_livraison_fin: string | null
}

/** Pièce jointe à une course, telle que le chauffeur la voit. */
export interface DocumentCourse {
  id: string
  entity_id: string
  file_name: string
  mime_type: string | null
  category: string | null
  storage_path: string | null
  /** Dernier recours pour les pièces pas encore rapatriées de Google Drive. */
  drive_link: string | null
  created_at: string
  /** Compte qui a déposé la pièce : sert à ne pas relister au chauffeur ses propres photos. */
  uploaded_by: string | null
}

/**
 * La tournée du jour, réduite à ce qui sert au volant.
 *
 * Pas de `geometry`, pas de `notes`, pas d'`optimized_at` : un téléphone en
 * 4G qui charge un tracé de plusieurs dizaines de kilo-octets pour ne jamais
 * l'afficher, c'est de l'attente pure. Le tracé reste côté bureau, sur la
 * carte d'ensemble, là où il sert.
 */
export interface TourneeChauffeur {
  id: string
  date: string
  status: 'brouillon' | 'optimisee' | 'en_cours' | 'terminee'
  vehicle_id: string | null
  depot_lat: number | null
  depot_lng: number | null
  total_km: number | null
  total_duration_min: number | null
  eviter_peages: boolean
}

/**
 * Fiche Équipe du compte connecté, telle que l'espace salarié la lit (Ma journée, Moi).
 * Pas de salaire, pas de contrat : seulement ce qui le concerne au quotidien.
 * `tarif_*` et `clients_messagerie` viennent de la migration 20261012110000 : absents
 * (null / []) tant qu'elle n'est pas appliquée (`complete = false`).
 */
export interface MaFiche {
  id: string
  full_name: string
  phone: string | null
  email: string | null
  licence_b_expiry: string | null
  medical_visit_expiry: string | null
  tarif_domicile_cts: number | null
  tarif_relais_cts: number | null
  clients_messagerie: string[]
  /** false = colonnes de la journée de colis absentes de la base. */
  complete: boolean
}

/** Lecture de la fiche, partagée par les onglets Ma journée et Moi. */
export interface EtatFiche {
  chargee: boolean
  /** null (chargée, sans erreur) = compte non relié à une fiche Équipe. */
  data: MaFiche | null
  erreur: string | null
}
