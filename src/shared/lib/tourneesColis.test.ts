import { describe, it, expect } from 'vitest'
import {
  familleStatut, colisRemis, compteursTournee, avancementPct, statutApresGeste, arretsDepuisLecture,
  manquesApercu, ordreHabituel, totauxApercu, modifierArretLu, lignesArrets, fusionnerEntetes, arretVide,
  pageDepuisLecture, pagesManquantes, pagesEnDouble, ordonnerParPage, retirerPhoto,
  STATUT_FAIT, AUTRES_STATUTS, type ArretColis, type StatutArretColis,
} from './tourneesColis'

function a(p: Partial<ArretColis>): ArretColis {
  return {
    id: 'x', tournee_id: 't', company_id: 'c', rang: 1, commune: 'OSTWALD', cp: '67540', rue: 'RUE A',
    numero: '1', type: 'c', quantite: 1, colis_remis: null, lat: null, lng: null, geo_precision: null,
    statut: null, statut_le: null, statut_par: null, note: null, ...p,
  }
}

describe('familles', () => {
  it('chaque statut a une famille ; null = non traité', () => {
    const tous: StatutArretColis[] = ['livre', 'avise', 'instance', 'refuse', 'npai', 'adresse', 'acces',
      'endommage', 'nonpres', 'rc_remis', 'rc_ferme', 'rc_sature', 'col_ok', 'col_rien', 'col_nf']
    for (const s of tous) expect(familleStatut(s)).not.toBeNull()
    expect(familleStatut(null)).toBeNull()
    expect(familleStatut('rc_remis')).toBe('livre')
    expect(familleStatut('avise')).toBe('attente')
    expect(familleStatut('npai')).toBe('retour')
  })
  it('familles de l’outil des livreurs (18/10/2026)', () => {
    const attendu: Record<string, StatutArretColis[]> = {
      livre: ['livre', 'rc_remis', 'col_ok'],
      attente: ['avise', 'instance'],
      retour: ['refuse', 'npai', 'adresse', 'acces', 'endommage', 'nonpres', 'rc_ferme', 'rc_sature', 'col_nf'],
      neutre: ['col_rien'],
    }
    for (const [famille, statuts] of Object.entries(attendu)) {
      for (const s of statuts) expect(familleStatut(s)).toBe(famille)
    }
  })
  it('les statuts proposés par type sont cohérents (le « fait » est livré)', () => {
    for (const t of ['c', 'rc', 'col'] as const) {
      expect(familleStatut(STATUT_FAIT[t])).toBe('livre')
      expect(AUTRES_STATUTS[t]).not.toContain(STATUT_FAIT[t])
    }
  })
})

describe('colisRemis', () => {
  it('neutre (rien à collecter) = 0 colis remis', () => {
    expect(colisRemis({ statut: 'col_rien', quantite: 2, colis_remis: 2 })).toBe(0)
  })
  it('livré sans précision = tout ; partiel borné ; non livré = 0', () => {
    expect(colisRemis({ statut: 'livre', quantite: 3, colis_remis: null })).toBe(3)
    expect(colisRemis({ statut: 'livre', quantite: 3, colis_remis: 2 })).toBe(2)
    expect(colisRemis({ statut: 'livre', quantite: 3, colis_remis: 9 })).toBe(3)
    expect(colisRemis({ statut: 'avise', quantite: 3, colis_remis: 3 })).toBe(0)
  })
})

describe('compteursTournee', () => {
  it('arrêts / colis traités, livrés, attente, retour ; collectes à part', () => {
    const c = compteursTournee([
      a({ quantite: 3, statut: 'livre', colis_remis: 2 }),
      a({ quantite: 1, statut: 'avise' }),
      a({ quantite: 2, statut: 'refuse' }),
      a({ quantite: 4 }),
      a({ type: 'rc', quantite: 5, statut: 'rc_remis' }),
      a({ type: 'col', quantite: 2, statut: 'col_ok' }),
      a({ type: 'col', quantite: 1 }),
    ])
    expect(c).toEqual({
      arrets: 5, arretsTraites: 4, colis: 15, colisTraites: 11, colisLivres: 7, colisAttente: 2,
      colisRetour: 2, collectes: 2, collectesTraitees: 1,
    })
    expect(avancementPct(c)).toBe(71)
  })
  it('accès impossible, relais fermé, non présenté = retour ; neutre traité sans colis', () => {
    const c = compteursTournee([
      a({ quantite: 2, statut: 'acces' }),
      a({ type: 'rc', quantite: 3, statut: 'rc_ferme' }),
      a({ quantite: 1, statut: 'nonpres' }),
      a({ quantite: 4, statut: 'instance' }),
      a({ quantite: 1, statut: 'col_rien' }),
      a({ type: 'col', quantite: 1, statut: 'col_rien' }),
    ])
    expect(c).toMatchObject({
      arrets: 5, arretsTraites: 5, colis: 11, colisTraites: 10, colisLivres: 0, colisAttente: 4,
      colisRetour: 6, collectes: 1, collectesTraitees: 1,
    })
  })
  it('tournée vide → 0 %', () => {
    expect(avancementPct(compteursTournee([]))).toBe(0)
  })
  it('premier geste : à faire → en cours ; clôturée reste clôturée', () => {
    expect(statutApresGeste('a_faire', 1)).toBe('en_cours')
    expect(statutApresGeste('a_faire', 0)).toBe('a_faire')
    expect(statutApresGeste('cloturee', 3)).toBe('cloturee')
  })
})

describe('aperçu', () => {
  it('réponse de l’Edge revérifiée (type, quantité, précision)', () => {
    const r = arretsDepuisLecture([
      { commune: 'OSTWALD', rue: 'RUE A', numero: '12', quantite: 2, type: 'rc', a_verifier: true, lat: 48.5, lng: 7.7, geo_precision: 'numero' },
      { commune: ' ', rue: 'RUE B', quantite: 0, type: 'zz', geo_precision: 'ville' },
      null,
    ], 2)
    expect(r).toHaveLength(2)
    expect(r[0]).toMatchObject({ type: 'rc', quantite: 2, a_verifier: true, geo_precision: 'numero', page: 2 })
    expect(arretsDepuisLecture([{ rue: 'R', secteur: '601 - GEUDERTHEIM EGLISE', motif: '3 colis lus, 4 annoncés' }], 1)[0])
      .toMatchObject({ secteur: '601 - GEUDERTHEIM EGLISE', motif: '3 colis lus, 4 annoncés', a_verifier: true })
    expect(r[1]).toMatchObject({ commune: null, type: 'c', quantite: 1, geo_precision: null, lat: null })
    expect(arretsDepuisLecture('non', 1)).toEqual([])
  })
  it('manques : rien ne bloque sauf une feuille vide (commune / rue illisibles créées quand même)', () => {
    expect(manquesApercu([])).toEqual(['Aucun arrêt'])
    const v = arretVide(1)
    expect(manquesApercu([v, { ...v, commune: 'X', rue: 'Y' }])).toEqual([])
    expect(lignesArrets([v], 't', 'c')[0]).toMatchObject({ commune: 'Commune inconnue', rue: 'Rue illisible' })
  })
  it('ordre habituel : villages puis rues du fichier ; rue inconnue après la précédente ; village inconnu à la fin', () => {
    const a = (commune: string, ref_rang: number | null, ref_rang_commune: number | null) => ({ commune, ref_rang, ref_rang_commune })
    expect(ordreHabituel([a('X', null, null)])).toBeNull()
    // Feuille : Geudertheim (rangs 5, ?, 2), Kriegsheim (rang 30), village inconnu, Bietlenheim (rang 0).
    expect(ordreHabituel([
      a('Geudertheim', 5, 2), a('Geudertheim', null, 2), a('Geudertheim', 2, 2),
      a('Kriegsheim', 30, 30), a('Ailleurs', null, null), a('Bietlenheim', 0, 0),
    ])).toEqual([3, 4, 2, 5, 6, 1])
  })
  it('totaux : colis hors collectes, à vérifier', () => {
    const v = arretVide(1)
    expect(totauxApercu([{ ...v, quantite: 3 }, { ...v, type: 'col', quantite: 2, a_verifier: true }]))
      .toEqual({ arrets: 1, colis: 3, collectes: 1, aVerifier: 1, relais: 0, villages: 0, connus: 0, aPlacer: 2 })
    expect(totauxApercu([{ ...v, commune: 'A', type: 'rc', rue_connue: true, lat: 1, lng: 2 }, { ...v, commune: 'a' }]))
      .toMatchObject({ arrets: 2, relais: 1, villages: 1, connus: 1, aPlacer: 1 })
  })
  it('changer l’adresse efface la position ; quantité bornée', () => {
    const v = { ...arretVide(1), rue: 'RUE A', lat: 1, lng: 2, geo_precision: 'numero' as const }
    expect(modifierArretLu(v, { note: 'x' }).lat).toBe(1)
    expect(modifierArretLu(v, { numero: '4' })).toMatchObject({ lat: null, lng: null, geo_precision: null })
    expect(modifierArretLu(v, { quantite: 0 }).quantite).toBe(1)
  })
  it('lignes à écrire : rang = ordre de la feuille, vides → null, ordre habituel posé', () => {
    const v = { ...arretVide(1), commune: 'Ostwald', rue: ' Rue A ', numero: ' ', note: '' }
    expect(lignesArrets([v, v], 't', 'c').map(l => [l.rang, l.commune, l.rue, l.numero, l.note, l.ordre]))
      .toEqual([[1, 'Ostwald', 'Rue A', null, null, null], [2, 'Ostwald', 'Rue A', null, null, null]])
    const l = lignesArrets([{ ...v, ref_rang: 9, ref_rang_commune: 1 }, { ...v, ref_rang: 1, ref_rang_commune: 1 }], 't', 'c')
    expect(l.map(x => [x.rang, x.ordre, x.rang_habituel])).toEqual([[1, 2, 2], [2, 1, 1]])
  })
  it('en-têtes fusionnés : premières valeurs, plus grand total', () => {
    expect(fusionnerEntetes([{ date: '17/10', nb_colis: 60 }, null, { date: 'x', vehicule: 'V1', nb_colis: 118, nb_pgeo: 90 }], 3))
      .toEqual({ pages: 3, date: '17/10', vehicule: 'V1', nb_colis: 118, nb_pgeo: 90 })
  })
})

describe('pages de la feuille', () => {
  it('page manquante détectée (1/3 et 3/3 lues → 2)', () => {
    expect(pagesManquantes([{ numero: 1, total: 3 }, { numero: 3, total: 3 }])).toEqual([2])
    expect(pagesManquantes([{ numero: 1, total: 2 }, null, { numero: 2, total: 2 }])).toEqual([])
    expect(pagesManquantes([null, undefined])).toEqual([])
  })
  it('photo sans « x/y » lisible (pied de page rogné) : elle prend la place libre', () => {
    expect(pagesManquantes([{ numero: 1, total: 2 }, null])).toEqual([])
    expect(pagesManquantes([{ numero: 1, total: 3 }, null])).toEqual([3])
  })
  it('page en double', () => {
    expect(pagesEnDouble([{ numero: 2, total: 3 }, { numero: 2, total: 3 }, { numero: 1, total: 3 }])).toEqual([2])
  })
  it('« x/y » de l’Edge revérifié', () => {
    expect(pageDepuisLecture({ numero: 2, total: 3 })).toEqual({ numero: 2, total: 3 })
    expect(pageDepuisLecture({ numero: 4, total: 3 })).toBeNull()
    expect(pageDepuisLecture('2/3')).toBeNull()
  })
  it('ordre de la feuille : la page 2 photographiée en dernier reprend sa place', () => {
    const v = (page: number, rue: string) => ({ ...arretVide(page), rue })
    const r = ordonnerParPage([v(1, 'A'), v(1, 'B'), v(2, 'E'), v(3, 'C')],
      [{ numero: 1, total: 3 }, { numero: 3, total: 3 }, { numero: 2, total: 3 }])
    expect(r.map(a => a.rue)).toEqual(['A', 'B', 'C', 'E'])
  })
  it('retirer une photo : ses arrêts partent, les suivantes remontent', () => {
    const v = (page: number, rue: string) => ({ ...arretVide(page), rue })
    expect(retirerPhoto([v(1, 'A'), v(2, 'B'), v(3, 'C')], 2).map(a => [a.page, a.rue])).toEqual([[1, 'A'], [2, 'C']])
  })
})
