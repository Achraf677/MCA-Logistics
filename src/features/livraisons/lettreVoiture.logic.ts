// Logique pure Lettre de Voiture Nationale — testable sans DB ni DOM.
//
// Deux exports principaux :
//   - buildLettreVoiture(inputs) → { data, missing[] }
//     Assemble toutes les mentions obligatoires du décret 99-752 / art. L132-9
//     Code de commerce à partir des données livraison + société + véhicule +
//     chauffeur + client. Signale ce qui manque pour bloquer une génération
//     PDF incomplète (les mentions manquantes = LV non opposable en contrôle).
//   - lvNumero(existants, année) → « LV-AAAA-N » séquentiel (max+1 sur l'année).
//     Ne consulte pas la DB : l'appelant fournit la liste des lv_numero déjà
//     attribués pour l'année en cours (via une requête in-année).
//
// Pas de dépendance React / Supabase — pur, sans effets de bord.

import { formatMoney } from '../../shared/lib/money'

export interface LvDeliveryInput {
  /** Date planifiée / de livraison (YYYY-MM-DD). Utilisée comme date d'établissement. */
  date: string
  pickup_address: string | null
  delivery_address: string | null
  description: string | null
  // Mentions LV renseignées par l'utilisateur.
  expediteur_nom: string | null
  expediteur_siren: string | null
  destinataire_nom: string | null
  marchandise_desc: string | null
  nb_colis: number | null
  poids_kg_reel: number | null
  // Prix (TTC prioritaire ; sinon HT ; sinon montant_ttc_cts legacy)
  amount_ttc_cts: number | null
  amount_ht_cts: number | null
  montant_ttc_cts?: number | null
  /** Numéro déjà attribué (généré → reste stable). Null = à générer. */
  lv_numero: string | null
}

export interface LvCompanyInput {
  name: string
  siren: string | null
  address: string | null
  licence_transport: string | null
}

export interface LvVehicleInput {
  /** Nom/modèle du véhicule (ex "MOVANO") — affiché à côté de la plaque, jamais utilisé comme immat. */
  label: string | null
  /** Immatriculation réelle (ex "EB-612-SK") — seul champ utilisé comme n° d'immat sur la LV. */
  plate: string | null
}

export interface LvDriverInput {
  full_name: string | null
}

export interface LvClientInput {
  /** Nom client — fallback pour le destinataire si destinataire_nom est vide. */
  name: string | null
}

export interface LettreVoitureData {
  /** Numéro (existant ou à attribuer par l'appelant). */
  numero: string | null
  /** Date d'établissement (YYYY-MM-DD). */
  date_etablissement: string
  expediteur: {
    nom: string
    adresse: string
    siren: string | null
  }
  destinataire: {
    nom: string
    adresse: string
  }
  transporteur: {
    nom: string
    adresse: string | null
    siren: string | null
    licence: string | null
  }
  marchandise: {
    description: string
    nb_colis: number
    poids_kg: number
  }
  /** Nom/modèle du véhicule (ex "MOVANO") — affichage seulement, jamais l'immat. */
  vehicule_nom: string | null
  vehicule_immat: string
  chauffeur: string
  prix_ttc_formate: string | null
}

export interface LettreVoitureResult {
  data: LettreVoitureData
  /** Mentions manquantes (libellés lisibles). Vide = LV complète, PDF générable. */
  missing: string[]
}

/** Champs obligatoires — chaque échec renvoie un libellé lisible affiché à l'utilisateur. */
export function buildLettreVoiture(inputs: {
  delivery: LvDeliveryInput
  company: LvCompanyInput
  vehicle: LvVehicleInput | null
  driver: LvDriverInput | null
  client: LvClientInput | null
}): LettreVoitureResult {
  const { delivery, company, vehicle, driver, client } = inputs

  const missing: string[] = []
  const need = (label: string, ok: boolean) => { if (!ok) missing.push(label) }

  // Expéditeur : nom + adresse + SIREN (le SIREN n'est pas systématiquement
  // requis par le décret, mais il est utile aux contrôles ; on le signale
  // sans bloquer si absent — voir "optionnels" ci-dessous, on ne le pousse
  // pas dans missing).
  const expediteur_nom = (delivery.expediteur_nom ?? '').trim()
  const expediteur_addr = (delivery.pickup_address ?? '').trim()
  need('Nom de l\'expéditeur', expediteur_nom.length > 0)
  need('Adresse d\'enlèvement (expéditeur)', expediteur_addr.length > 0)

  // Destinataire : nom + adresse.
  const destinataire_nom = (delivery.destinataire_nom ?? '').trim() || (client?.name ?? '').trim()
  const destinataire_addr = (delivery.delivery_address ?? '').trim()
  need('Nom du destinataire', destinataire_nom.length > 0)
  need('Adresse de livraison (destinataire)', destinataire_addr.length > 0)

  // Transporteur : nom société + SIREN + licence DREAL.
  need('Raison sociale du transporteur', company.name.trim().length > 0)
  need('SIREN du transporteur', (company.siren ?? '').trim().length > 0)
  need('Licence de transport (DREAL)', (company.licence_transport ?? '').trim().length > 0)

  // Marchandise : description + colis + poids réel.
  const marchandise_desc = (delivery.marchandise_desc ?? '').trim() || (delivery.description ?? '').trim()
  const nb_colis = Number.isFinite(delivery.nb_colis) ? Number(delivery.nb_colis) : 0
  const poids_kg = Number.isFinite(delivery.poids_kg_reel) ? Number(delivery.poids_kg_reel) : 0
  need('Description de la marchandise', marchandise_desc.length > 0)
  need('Nombre de colis (> 0)', nb_colis > 0)
  need('Poids réel en kg (> 0)', poids_kg > 0)

  // Véhicule + chauffeur. L'immatriculation vient TOUJOURS de `plate` — le
  // `label` (nom/modèle, ex "MOVANO") n'est qu'un complément d'affichage.
  const vehicule_nom = (vehicle?.label ?? '').trim() || null
  const immat = (vehicle?.plate ?? '').trim()
  const chauffeur = (driver?.full_name ?? '').trim()
  need('Immatriculation du véhicule', immat.length > 0)
  need('Nom du chauffeur', chauffeur.length > 0)

  // Prix : TTC prioritaire, sinon HT, sinon legacy montant_ttc_cts. Le prix
  // n'est pas juridiquement obligatoire sur toutes les LV (peut être « port dû »
  // ou « port payé ») — on l'affiche s'il existe, on ne bloque pas l'utilisateur.
  const prix_cts = delivery.amount_ttc_cts ?? delivery.amount_ht_cts ?? delivery.montant_ttc_cts ?? null
  const prix_ttc_formate = prix_cts != null ? formatMoney(prix_cts) : null

  const data: LettreVoitureData = {
    numero: delivery.lv_numero,
    date_etablissement: delivery.date,
    expediteur: {
      nom: expediteur_nom,
      adresse: expediteur_addr,
      siren: (delivery.expediteur_siren ?? '').trim() || null,
    },
    destinataire: {
      nom: destinataire_nom,
      adresse: destinataire_addr,
    },
    transporteur: {
      nom: company.name.trim(),
      adresse: (company.address ?? '').trim() || null,
      siren: (company.siren ?? '').trim() || null,
      licence: (company.licence_transport ?? '').trim() || null,
    },
    marchandise: {
      description: marchandise_desc,
      nb_colis,
      poids_kg,
    },
    vehicule_nom,
    vehicule_immat: immat,
    chauffeur,
    prix_ttc_formate,
  }

  return { data, missing }
}

/**
 * Attribue le prochain « LV-AAAA-N » séquentiel pour l'année donnée.
 * `existants` est la liste des lv_numero déjà attribués (peu importe l'année
 * mixée dedans — on filtre sur le préfixe LV-AAAA-). Le compteur repart à 1
 * chaque année civile.
 */
export function lvNumero(
  existants: (string | null | undefined)[] | null | undefined,
  year: number,
): string {
  const prefix = `LV-${year}-`
  let max = 0
  for (const n of existants ?? []) {
    if (!n) continue
    if (!n.startsWith(prefix)) continue
    const tail = n.slice(prefix.length)
    const v = parseInt(tail, 10)
    if (Number.isFinite(v) && v > max) max = v
  }
  return `${prefix}${max + 1}`
}
