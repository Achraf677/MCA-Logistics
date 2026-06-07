import { describe, it, expect } from 'vitest'
import { parsePhotonResponse, photonUrl } from './photon'

describe('parsePhotonResponse', () => {
  it('parse une adresse avec housenumber + street', () => {
    const json = {
      features: [
        {
          geometry: { coordinates: [7.7521, 48.5839] },
          properties: {
            housenumber: '12',
            street: 'Rue de la Gare',
            postcode: '67000',
            city: 'Strasbourg',
          },
        },
      ],
    }
    expect(parsePhotonResponse(json)).toEqual([
      { address: '12 Rue de la Gare, 67000 Strasbourg', lat: 48.5839, lng: 7.7521 },
    ])
  })

  it('parse un lieu avec name seul (sans rue)', () => {
    const json = {
      features: [
        {
          geometry: { coordinates: [2.2945, 48.8584] },
          properties: { name: 'Tour Eiffel', postcode: '75007', city: 'Paris' },
        },
      ],
    }
    expect(parsePhotonResponse(json)).toEqual([
      { address: 'Tour Eiffel, 75007 Paris', lat: 48.8584, lng: 2.2945 },
    ])
  })

  it('ignore les features sans coordonnées', () => {
    const json = { features: [{ properties: { name: 'X' } }] }
    expect(parsePhotonResponse(json)).toEqual([])
  })

  it('renvoie [] sur une réponse vide ou invalide', () => {
    expect(parsePhotonResponse(null)).toEqual([])
    expect(parsePhotonResponse({})).toEqual([])
  })

  it('construit une URL biaisée Strasbourg avec la requête encodée', () => {
    const url = photonUrl('12 rue de la gare')
    expect(url).toContain('q=12%20rue%20de%20la%20gare')
    expect(url).toContain('lat=48.58')
    expect(url).toContain('lon=7.75')
    expect(url).toContain('lang=fr')
  })
})
