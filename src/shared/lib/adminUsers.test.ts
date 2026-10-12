import { describe, it, expect } from 'vitest'
import {
  libelleErreurAdmin, estEmailDejaUtilise, confirmationMonCompte, libelleDerniereConnexion,
} from './adminUsers'

describe('erreurs de l’Edge admin-users', () => {
  it('codes traduits', () => {
    expect(libelleErreurAdmin({ error: 'fiche_deja_reliee' })).toMatch(/déjà reliée/)
    expect(libelleErreurAdmin({ error: 'forbidden_president_only' })).toBe('Réservé au président.')
  })
  it('link_failed ne propose plus « C’est mon compte »', () => {
    const m = libelleErreurAdmin({ error: 'link_failed', detail: 'x' })
    expect(m).not.toMatch(/mon compte/i)
    expect(m).toMatch(/Ne recrée pas/)
  })
  it('e-mail déjà inscrit → message clair', () => {
    expect(estEmailDejaUtilise('create_failed', 'A user with this email address has already been registered')).toBe(true)
    expect(estEmailDejaUtilise('email_deja_utilise')).toBe(true)
    expect(estEmailDejaUtilise('create_failed', 'boom')).toBe(false)
    expect(libelleErreurAdmin({ error: 'create_failed', detail: 'already registered' })).toMatch(/déjà un compte/)
  })
  it('repli : message de l’Edge, puis détail, puis code', () => {
    expect(libelleErreurAdmin({ error: 'zz', message: 'msg', detail: 'det' })).toBe('msg')
    expect(libelleErreurAdmin({ error: 'zz', detail: 'det' })).toBe('det')
    expect(libelleErreurAdmin({ error: 'zz' })).toBe('zz')
    expect(libelleErreurAdmin(null)).toBe('Erreur inconnue.')
  })
  it('refus générique : détail ajouté', () => {
    expect(libelleErreurAdmin({ error: 'create_failed', detail: 'mot de passe faible' })).toMatch(/mot de passe faible/)
  })
})

describe('« C’est mon compte »', () => {
  it('simple si même e-mail (casse ignorée) ou fiche sans e-mail', () => {
    expect(confirmationMonCompte('A@B.fr ', 'a@b.fr')).toBe('simple')
    expect(confirmationMonCompte(null, 'a@b.fr')).toBe('simple')
  })
  it('double si la fiche porte l’e-mail d’un autre', () => {
    expect(confirmationMonCompte('autre@b.fr', 'a@b.fr')).toBe('double')
    expect(confirmationMonCompte('autre@b.fr', null)).toBe('double')
  })
})

describe('dernière connexion', () => {
  it('jamais si absente ou invalide', () => {
    expect(libelleDerniereConnexion(null)).toBe('Jamais connecté')
    expect(libelleDerniereConnexion('n/a')).toBe('Jamais connecté')
  })
  it('date française', () => {
    expect(libelleDerniereConnexion('2026-10-12T08:05:00')).toMatch(/^12\/10\/2026/)
  })
})
