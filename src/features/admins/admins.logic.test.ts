import { describe, it, expect } from 'vitest'
import {
  optionsRole, separerComptes, filtrerComptes, filtresActifs, FILTRES_VIDES, grilleDuProfil, nbEcransVisibles, PROFILS_DROITS,
} from './admins.logic'
import { ROLE_LABELS, ROLE_OPTIONS } from './admins.types'
import type { AdminMember } from './admins.types'
import { PERMISSION_CATALOG } from '../../shared/permissions/catalog'

const m = (id: string, full_name: string, role: AdminMember['role'], active = true): AdminMember =>
  ({ id, full_name, role, active, email: `${id}@fictif.example` })
const comptes = [m('a', 'Marie Comptable', 'comptable'), m('b', 'Paul Directeur', 'dg', false), m('c', 'Lucas Livreur', 'chauffeur'), m('d', 'Président', 'president')]

describe('rôles depuis Système › Administrateurs', () => {
  it('« Salarié » (chauffeur) n’est plus créable ici', () => {
    expect(ROLE_OPTIONS.map(o => o.value)).not.toContain('chauffeur')
  })
  it('le rôle actuel reste dans la liste', () => {
    expect(optionsRole('chauffeur', ROLE_LABELS)[0]).toEqual({ value: 'chauffeur', label: 'Salarié' })
    expect(optionsRole('dg', ROLE_LABELS)).toBe(ROLE_OPTIONS)
  })
})

describe('séparation bureau / salariés', () => {
  it('les salariés ne sont jamais dans la liste du bureau', () => {
    const { bureau, salaries } = separerComptes(comptes)
    expect(bureau.map(x => x.id)).toEqual(['a', 'b', 'd'])
    expect(salaries.map(x => x.id)).toEqual(['c'])
  })
})

describe('filtres', () => {
  const lib = (r: AdminMember['role']) => ROLE_LABELS[r]
  it('sans filtre : tout', () => {
    expect(filtrerComptes(comptes, FILTRES_VIDES, lib)).toHaveLength(4)
    expect(filtresActifs(FILTRES_VIDES)).toBe(false)
  })
  it('recherche sans accent ni casse, sur nom, e-mail et rôle', () => {
    expect(filtrerComptes(comptes, { ...FILTRES_VIDES, q: 'DIRECTEUR' }, lib).map(x => x.id)).toEqual(['b'])
    expect(filtrerComptes(comptes, { ...FILTRES_VIDES, q: 'a@fictif' }, lib).map(x => x.id)).toEqual(['a'])
    expect(filtrerComptes(comptes, { ...FILTRES_VIDES, q: 'président' }, lib).map(x => x.id)).toEqual(['d'])
  })
  it('rôle et actifs seulement', () => {
    expect(filtrerComptes(comptes, { ...FILTRES_VIDES, role: 'dg' }, lib)).toHaveLength(1)
    expect(filtrerComptes(comptes, { ...FILTRES_VIDES, statut: 'actifs' }, lib).map(x => x.id)).toEqual(['a', 'c', 'd'])
    expect(filtrerComptes(comptes, { ...FILTRES_VIDES, statut: 'coupes' }, lib).map(x => x.id)).toEqual(['b'])
    expect(filtresActifs({ ...FILTRES_VIDES, statut: 'actifs' })).toBe(true)
  })
})

describe('profils de droits', () => {
  const cles = PERMISSION_CATALOG.map(r => r.key)
  it('couvrent toutes les ressources du catalogue', () => {
    for (const p of PROFILS_DROITS) expect(Object.keys(grilleDuProfil(p.valeur)).sort()).toEqual([...cles].sort())
  })
  it('aucun profil ne donne accès à Système ni ne supprime', () => {
    for (const p of PROFILS_DROITS) {
      const g = grilleDuProfil(p.valeur)
      expect(g['systeme.parametres'].voir).toBe(false)
      expect(g['systeme.documents'].voir).toBe(false)
      expect(Object.values(g).some(x => x.supprimer)).toBe(false)
    }
  })
  it('lecture seule : voir sans modifier', () => {
    const g = grilleDuProfil('lecture')
    expect(g['finance.charges']).toMatchObject({ voir: true, creer: false, modifier: false })
    expect(nbEcransVisibles(g)).toBe(cles.length - 2)
  })
  it('comptable : saisit en Finance et Tiers, lit les livraisons, rien en Flotte', () => {
    const g = grilleDuProfil('comptable')
    expect(g['finance.charges']).toMatchObject({ voir: true, creer: true, modifier: true })
    expect(g['tiers.clients'].modifier).toBe(true)
    expect(g['livraisons.livraisons']).toMatchObject({ voir: true, modifier: false })
    expect(g['flotte.vehicules'].voir).toBe(false)
  })
  it('directeur général : tout sauf Système', () => {
    const g = grilleDuProfil('dg')
    expect(g['planning.tournees'].modifier).toBe(true)
    expect(nbEcransVisibles(g)).toBe(cles.length - 2)
  })
})

describe('mot de passe généré', () => {
  it('longueur, alphabet lisible et trois familles de caractères', async () => {
    const { genererMotDePasse } = await import('./admins.logic')
    for (let i = 0; i < 50; i++) {
      const p = genererMotDePasse()
      expect(p).toHaveLength(12)
      expect(p).toMatch(/[A-Z]/); expect(p).toMatch(/[a-z]/); expect(p).toMatch(/[0-9]/)
      expect(p).not.toMatch(/[0OlI1]/)
    }
  })
})
