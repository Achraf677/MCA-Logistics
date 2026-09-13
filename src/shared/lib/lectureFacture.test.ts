import { describe, it, expect } from 'vitest'
import {
  lireLibelleCharge, trouverVehicule, parseLectureOcr, descriptionDepuisLibelle,
  type VehiculeConnu,
} from './lectureFacture'

// Le parc réel : un seul camion.
const PARC: VehiculeConnu[] = [
  { id: 'v-movano', label: 'MOVANO', plate: 'FG-788-FB' },
]

describe('lireLibelleCharge', () => {
  it('lit un libellé Pennylane réel', () => {
    expect(lireLibelleCharge('TOTALENERGIES GAZOLE FG-788-FB OPEL MOVANO'))
      .toEqual({ typeCarburant: 'diesel', plaque: 'FG-788-FB' })
  })

  it('reconnaît les synonymes de gazole', () => {
    for (const mot of ['GAZOLE', 'Gasoil', 'GAS-OIL', 'diesel', 'GNR', 'B7']) {
      expect(lireLibelleCharge(`STATION ${mot} FG-788-FB`).typeCarburant).toBe('diesel')
    }
  })

  it('reconnaît l’essence sous ses formes courantes', () => {
    for (const mot of ['SP95', 'SP 98', 'E10', 'E85', 'Essence', 'SANS PLOMB']) {
      expect(lireLibelleCharge(`STATION ${mot}`).typeCarburant).toBe('essence')
    }
  })

  it('NE PREND PAS l’AdBlue pour du carburant', () => {
    // L'AdBlue est un additif. Le compter comme un plein créerait un plein
    // fantôme qui fausserait le coût au kilomètre.
    expect(lireLibelleCharge('E.LECLERC AD BLUE FG-788-FB OPEL MOVANO').typeCarburant).toBeNull()
    expect(lireLibelleCharge('ADBLUE 10L').typeCarburant).toBeNull()
  })

  it('ne voit pas de carburant dans un dépôt de garantie', () => {
    // Le libellé contient « CARBURANT » mais ne nomme aucun produit.
    expect(lireLibelleCharge('FLEET PRO DEPOT DE GARANTIE CARTE CARBURANT').typeCarburant).toBeNull()
  })

  it('normalise la plaque quels que soient les séparateurs', () => {
    expect(lireLibelleCharge('x fg 788 fb y').plaque).toBe('FG-788-FB')
    expect(lireLibelleCharge('x FG788FB y').plaque).toBe('FG-788-FB')
  })

  it('supporte un libellé sans plaque, et les espaces en trop', () => {
    expect(lireLibelleCharge('E.LECLERC GAZOLE BERLINGO'))
      .toEqual({ typeCarburant: 'diesel', plaque: null })
    expect(lireLibelleCharge('RAIFFEISEN GAZOLE FG-788-FB OPEL MOVANO ').plaque).toBe('FG-788-FB')
  })

  it('libellé vide ou absent → rien, jamais d’exception', () => {
    expect(lireLibelleCharge(null)).toEqual({ typeCarburant: null, plaque: null })
    expect(lireLibelleCharge('   ')).toEqual({ typeCarburant: null, plaque: null })
  })
})

describe('trouverVehicule', () => {
  it('retrouve le véhicule par sa plaque', () => {
    expect(trouverVehicule('TOTALENERGIES GAZOLE FG-788-FB OPEL MOVANO', PARC)).toBe('v-movano')
  })

  it('retrouve le véhicule par son nom quand il n’y a pas de plaque', () => {
    expect(trouverVehicule('ELEPHANT BLEU LAVAGE MOVANO', PARC)).toBe('v-movano')
  })

  it('ne désigne RIEN quand la plaque est inconnue du parc', () => {
    // Une plaque explicite qui ne correspond à aucun camion parle d'un autre
    // véhicule : on ne retombe pas sur le nom du modèle.
    expect(trouverVehicule('GAZOLE AB-123-CD MOVANO', PARC)).toBeNull()
  })

  it('ne désigne rien sur un modèle absent du parc', () => {
    expect(trouverVehicule('E.LECLERC GAZOLE BERLINGO', PARC)).toBeNull()
  })

  it('ne tranche pas entre deux véhicules du même modèle', () => {
    // Pré-sélectionner l'un des deux au hasard serait pire que ne rien faire :
    // l'erreur passerait inaperçue.
    const deux: VehiculeConnu[] = [
      { id: 'a', label: 'MOVANO', plate: 'AA-111-AA' },
      { id: 'b', label: 'MOVANO', plate: 'BB-222-BB' },
    ]
    expect(trouverVehicule('GAZOLE MOVANO', deux)).toBeNull()
  })

  it('libellé vide ou parc vide → rien', () => {
    expect(trouverVehicule('', PARC)).toBeNull()
    expect(trouverVehicule('GAZOLE FG-788-FB', [])).toBeNull()
  })
})

describe('parseLectureOcr', () => {
  it('accepte une lecture complète', () => {
    expect(parseLectureOcr({ litres: 42.15, prix_par_litre: 1.859, kilometrage: 128400, confiance: 0.9 }))
      .toEqual({ litres: 42.15, prixParLitre: 1.859, kilometrage: 128400, confiance: 0.9, raison: undefined })
  })

  it('ramène à null tout ce qui n’est pas un nombre positif', () => {
    const r = parseLectureOcr({ litres: 0, prix_par_litre: -1, kilometrage: 'beaucoup', confiance: 0.9 })
    expect(r.litres).toBeNull()
    expect(r.prixParLitre).toBeNull()
    expect(r.kilometrage).toBeNull()
  })

  it('encaisse une réponse malformée sans lever', () => {
    expect(parseLectureOcr(null).confiance).toBe(0)
    expect(parseLectureOcr('oui').litres).toBeNull()
    expect(parseLectureOcr({}).litres).toBeNull()
  })

  it('remonte la raison quand il n’y a rien à lire', () => {
    expect(parseLectureOcr({ ...{}, raison: 'aucun justificatif' }).raison).toBe('aucun justificatif')
  })

  it('ramène une confiance hors bornes à 0', () => {
    expect(parseLectureOcr({ confiance: 2 }).confiance).toBe(0)
    expect(parseLectureOcr({ confiance: -1 }).confiance).toBe(0)
  })
})

describe('descriptionDepuisLibelle', () => {
  it('retire le fournisseur en tête et tout ce qui suit la plaque', () => {
    expect(descriptionDepuisLibelle('E.LECLERC MASTIC FG-788-FB OPEL MOVANO', 'E.LECLERC'))
      .toBe('MASTIC')
  })

  it('retire la plaque même sans fournisseur connu', () => {
    expect(descriptionDepuisLibelle('ACTION BOMBES PEINTURES FG-788-FB OPEL MOVANO'))
      .toBe('ACTION BOMBES PEINTURES')
  })

  it('garde le libellé intact quand il n’y a rien à retirer', () => {
    expect(descriptionDepuisLibelle('ELEPHANT BLEU ACHAT CLE LAVAGE + CREDIT LAVAGE'))
      .toBe('ELEPHANT BLEU ACHAT CLE LAVAGE + CREDIT LAVAGE')
  })

  it('ne rend jamais une chaîne vide : le libellé d’origine fait foi', () => {
    // Nettoyage total : mieux vaut trop que rien.
    expect(descriptionDepuisLibelle('TOTAL ENERGIES FG-788-FB', 'TOTAL ENERGIES'))
      .toBe('TOTAL ENERGIES FG-788-FB')
  })

  it('nettoie la ponctuation de liaison laissée par la découpe', () => {
    expect(descriptionDepuisLibelle('CARREFOUR — VIDANGE — FG-788-FB', 'CARREFOUR'))
      .toBe('VIDANGE')
  })

  it('ignore la casse du fournisseur', () => {
    expect(descriptionDepuisLibelle('e.leclerc MASTIC', 'E.LECLERC')).toBe('MASTIC')
  })

  it('libellé vide → chaîne vide, jamais d’exception', () => {
    expect(descriptionDepuisLibelle(null)).toBe('')
    expect(descriptionDepuisLibelle('  ')).toBe('')
  })
})
