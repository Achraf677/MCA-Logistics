import { describe, it, expect } from 'vitest'
import { erreurAcces, libelleErreurAcces } from './equipe.logic'

describe('accès au site (lot S0)', () => {
  it('e-mail obligatoire et valide', () => {
    expect(erreurAcces({ email: 'x', mode: 'invitation', motDePasse: '' })).toBe('E-mail invalide.')
    expect(erreurAcces({ email: ' a@b.fr ', mode: 'invitation', motDePasse: '' })).toBeNull()
  })
  it('mot de passe de 8 caractères en mode mot de passe seulement', () => {
    expect(erreurAcces({ email: 'a@b.fr', mode: 'mot_de_passe', motDePasse: '1234567' })).toMatch(/8 caractères/)
    expect(erreurAcces({ email: 'a@b.fr', mode: 'mot_de_passe', motDePasse: '12345678' })).toBeNull()
  })
  it('codes d erreur traduits, sinon le détail', () => {
    expect(libelleErreurAcces('fiche_deja_reliee')).toMatch(/déjà reliée/)
    expect(libelleErreurAcces('autre', 'boom')).toBe('boom')
    expect(libelleErreurAcces(null)).toBe('Erreur inconnue.')
  })
})
