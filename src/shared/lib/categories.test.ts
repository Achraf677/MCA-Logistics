import { describe, it, expect } from 'vitest'
import { slugifyCategoryName, isDuplicateCategorySlug, prepareCategorieCreation } from './categories'

describe('slugifyCategoryName', () => {
  it('minuscules + espaces → underscore', () => {
    expect(slugifyCategoryName('Lave Glace')).toBe('lave_glace')
  })

  it('supprime les accents', () => {
    expect(slugifyCategoryName('Réparation moteur')).toBe('reparation_moteur')
  })

  it('caractères non alphanumériques → underscore, jamais en tête/queue', () => {
    expect(slugifyCategoryName('  AdBlue !!  ')).toBe('adblue')
    expect(slugifyCategoryName('Pneus (été)')).toBe('pneus_ete')
  })

  it('déjà un slug propre → inchangé', () => {
    expect(slugifyCategoryName('carburant')).toBe('carburant')
  })
})

describe('isDuplicateCategorySlug', () => {
  it('slug présent → true', () => {
    expect(isDuplicateCategorySlug('adblue', [{ slug: 'carburant' }, { slug: 'adblue' }])).toBe(true)
  })

  it('slug absent → false', () => {
    expect(isDuplicateCategorySlug('adblue', [{ slug: 'carburant' }])).toBe(false)
  })

  it('liste vide → false', () => {
    expect(isDuplicateCategorySlug('adblue', [])).toBe(false)
  })
})

describe('prepareCategorieCreation', () => {
  it('création valide → slug généré', () => {
    const r = prepareCategorieCreation({ name: 'AdBlue' }, [{ slug: 'carburant' }])
    expect(r).toEqual({ ok: true, name: 'AdBlue', slug: 'adblue' })
  })

  it('type transmis mais ignoré par la validation (juste passthrough côté appelant)', () => {
    const r = prepareCategorieCreation({ name: 'Lave-glace', type: 'entretien' }, [])
    expect(r.ok).toBe(true)
    expect(r.slug).toBe('lave_glace')
  })

  it('nom < 2 caractères → rejeté', () => {
    expect(prepareCategorieCreation({ name: 'A' }, []).ok).toBe(false)
    expect(prepareCategorieCreation({ name: ' ' }, []).ok).toBe(false)
    expect(prepareCategorieCreation({ name: '' }, []).ok).toBe(false)
  })

  it('doublon (même slug déjà existant) → rejeté', () => {
    const r = prepareCategorieCreation({ name: 'AdBlue' }, [{ slug: 'adblue' }])
    expect(r.ok).toBe(false)
    expect(r.error).toContain('existe déjà')
  })

  it('doublon insensible à la casse/accents (même slug résultant)', () => {
    const r = prepareCategorieCreation({ name: 'adblue' }, [{ slug: 'adblue' }])
    expect(r.ok).toBe(false)
  })

  it('noms différents → slugs différents, pas de faux doublon', () => {
    const r = prepareCategorieCreation({ name: 'Lave-glace' }, [{ slug: 'adblue' }])
    expect(r.ok).toBe(true)
    expect(r.slug).toBe('lave_glace')
  })

  it('après création, la nouvelle catégorie rejoint la liste locale et bloque un second doublon', () => {
    // Simule le flux UI : liste locale → création → append → re-tentative du même nom.
    let localList: { slug: string }[] = [{ slug: 'carburant' }]

    const first = prepareCategorieCreation({ name: 'AdBlue', type: 'entretien' }, localList)
    expect(first.ok).toBe(true)

    localList = [...localList, { slug: first.slug! }]
    expect(localList).toContainEqual({ slug: 'adblue' })

    // Une 2e tentative du même nom, une fois la liste locale mise à jour, est rejetée.
    const second = prepareCategorieCreation({ name: 'AdBlue' }, localList)
    expect(second.ok).toBe(false)
  })
})
