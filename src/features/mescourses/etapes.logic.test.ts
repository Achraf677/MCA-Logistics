import { describe, it, expect } from 'vitest'
import {
  etapeCourante, adresseDeNavigation, libelleAction, libelleEtat,
  type EtatCourse,
} from './etapes.logic'

const c = (o: Partial<EtatCourse> = {}): EtatCourse => ({
  statut: 'en_cours',
  charge_le: null,
  pickup_address: '8 rue Turenne, 67000 Strasbourg',
  delivery_address: '1 av. des Pins, 44240 Sucé-sur-Erdre',
  ...o,
})

describe('etapeCourante', () => {
  it('planifiee -> il n y a qu un geste : demarrer', () => {
    expect(etapeCourante(c({ statut: 'planifiee' }))).toBe('a_demarrer')
  })

  it('demarree et pas chargee -> on va au retrait', () => {
    expect(etapeCourante(c())).toBe('vers_chargement')
  })

  it('chargee -> on va chez le destinataire', () => {
    expect(etapeCourante(c({ charge_le: '2026-09-13T08:00:00Z' }))).toBe('vers_livraison')
  })

  it('SANS adresse de retrait, l etape de chargement est sautee', () => {
    // Le colis est deja dans le camion : imposer un « Charger » serait un clic
    // pour rien, repete a chaque course.
    expect(etapeCourante(c({ pickup_address: null }))).toBe('vers_livraison')
    expect(etapeCourante(c({ pickup_address: '   ' }))).toBe('vers_livraison')
  })

  it('livree, facturee, payee, annulee -> plus aucun geste', () => {
    for (const statut of ['livree', 'facturee', 'payee', 'annulee']) {
      expect(etapeCourante(c({ statut }))).toBe('terminee')
    }
  })

  it('un statut inconnu ne propose aucun geste plutot que d en inventer un', () => {
    expect(etapeCourante(c({ statut: 'zzz' }))).toBe('terminee')
  })
})

describe('adresseDeNavigation', () => {
  it('avant chargement -> adresse de retrait', () => {
    expect(adresseDeNavigation(c())).toBe('8 rue Turenne, 67000 Strasbourg')
  })

  it('apres chargement -> adresse de livraison', () => {
    expect(adresseDeNavigation(c({ charge_le: '2026-09-13T08:00:00Z' })))
      .toBe('1 av. des Pins, 44240 Sucé-sur-Erdre')
  })

  it('sans adresse de retrait -> directement la livraison', () => {
    expect(adresseDeNavigation(c({ pickup_address: null })))
      .toBe('1 av. des Pins, 44240 Sucé-sur-Erdre')
  })

  it('rien a viser -> null, l ecran masque le bouton', () => {
    expect(adresseDeNavigation(c({ pickup_address: null, delivery_address: null }))).toBeNull()
    expect(adresseDeNavigation(c({ pickup_address: null, delivery_address: '  ' }))).toBeNull()
  })

  it('les espaces autour de l adresse sont retires', () => {
    expect(adresseDeNavigation(c({ pickup_address: '  Nantes  ' }))).toBe('Nantes')
  })
})

describe('libelles', () => {
  it('le bouton principal suit l etape', () => {
    expect(libelleAction(c({ statut: 'planifiee' }))).toBe('Démarrer')
    expect(libelleAction(c())).toBe('Charger')
    expect(libelleAction(c({ charge_le: '2026-09-13T08:00:00Z' }))).toBe('Livrer')
    expect(libelleAction(c({ statut: 'livree' }))).toBeNull()
  })

  it('la pastille parle le langage du terrain', () => {
    expect(libelleEtat(c({ statut: 'planifiee' }))).toBe('À faire')
    expect(libelleEtat(c())).toBe('Vers le retrait')
    expect(libelleEtat(c({ charge_le: '2026-09-13T08:00:00Z' }))).toBe('Chargé')
    expect(libelleEtat(c({ statut: 'livree' }))).toBe('Livrée')
    expect(libelleEtat(c({ statut: 'annulee' }))).toBe('Annulée')
  })
})
