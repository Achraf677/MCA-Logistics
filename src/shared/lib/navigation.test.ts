import { describe, it, expect } from 'vitest'
import {
  lienNavigation, plansStopUrl, plansAdresseUrl, APPS_NAVIGATION,
  googleMapsRouteUrl,
} from './navigation'

describe('lienNavigation', () => {
  const point = { lat: 48.58, lng: 7.75, adresse: '1 rue de Belfort, Strasbourg' }
  const texte = { adresse: '3 Rue De Pitard, 28360 Theuville' }

  it('préfère les coordonnées à l’adresse quand on a les deux', () => {
    // Un point est exact ; une adresse, Google la résout de son côté.
    expect(lienNavigation('google', point)).toContain('destination=48.58,7.75')
    expect(lienNavigation('google', point)).not.toContain('Belfort')
  })

  it('retombe sur l’adresse écrite quand il n’y a pas de coordonnées', () => {
    expect(lienNavigation('google', texte)).toContain(encodeURIComponent(texte.adresse))
  })

  it('bâtit le bon lien pour chaque application, sur un point', () => {
    expect(lienNavigation('google', point)).toContain('google.com/maps')
    expect(lienNavigation('waze', point)).toContain('waze.com')
    expect(lienNavigation('plans', point)).toContain('maps.apple.com')
  })

  it('bâtit le bon lien pour chaque application, sur une adresse', () => {
    expect(lienNavigation('google', texte)).toContain('google.com/maps')
    expect(lienNavigation('waze', texte)).toContain('waze.com')
    expect(lienNavigation('plans', texte)).toContain('maps.apple.com')
  })

  it('passe l’évitement des péages à Google et Waze sur un point', () => {
    expect(lienNavigation('google', point, { eviterPeages: true })).toContain('avoid=tolls')
    expect(lienNavigation('waze', point, { eviterPeages: true })).toContain('avoid_tolls=true')
  })

  it('n’invente pas d’évitement des péages pour Plans', () => {
    // Apple n'expose aucune option d'évitement sur ce schéma d'URL : ajouter
    // un paramètre ignoré laisserait croire que la consigne est passée.
    expect(lienNavigation('plans', point, { eviterPeages: true })).not.toContain('tolls')
  })

  it('n’invente pas d’évitement des péages pour Waze sur une adresse écrite', () => {
    expect(lienNavigation('waze', texte, { eviterPeages: true })).not.toContain('avoid_tolls')
  })

  it('renvoie null quand il n’y a rien à viser', () => {
    expect(lienNavigation('google', { adresse: '   ' })).toBeNull()
  })
})

describe('liens Plans', () => {
  it('demande un itinéraire en voiture', () => {
    expect(plansStopUrl(48.5, 7.7)).toContain('dirflg=d')
    expect(plansAdresseUrl('Strasbourg')).toContain('dirflg=d')
  })
  it('encode l’adresse', () => {
    expect(plansAdresseUrl('1 rue de la Paix, Paris')).toContain('1%20rue%20de%20la%20Paix')
  })
})

describe('APPS_NAVIGATION', () => {
  it('expose les trois applications, sans doublon de clé', () => {
    const cles = APPS_NAVIGATION.map(a => a.cle)
    expect(cles).toEqual(['google', 'waze', 'plans'])
    expect(new Set(cles).size).toBe(3)
  })
})

describe('googleMapsRouteUrl', () => {
  it('ordonne les étapes par stop_order, pas par ordre d’arrivée', () => {
    const url = googleMapsRouteUrl(
      { lat: 48.5, lng: 7.7 },
      [
        { stop_order: 2, lat: 49, lng: 8 },
        { stop_order: 1, lat: 48.9, lng: 7.9 },
      ],
    ) as string
    expect(url).toContain(encodeURIComponent('48.9,7.9|49,8'))
  })

  it('renvoie null sans dépôt : l’itinéraire complet part et revient du dépôt', () => {
    expect(googleMapsRouteUrl(null, [{ stop_order: 1, lat: 48, lng: 7 }])).toBeNull()
  })
})
