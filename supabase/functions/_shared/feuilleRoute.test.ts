import { describe, it, expect } from 'vitest';
import {
  controlerLigne, decouperNumeros, lignesEnArrets, lirePage, marquerCollectes, nettoyerLecture, separerCommune, type LigneFeuille,
} from './feuilleRoute.ts';
import { choisirResultat, communeBan } from './geocodeArret.ts';

const ligne = (p: Partial<LigneFeuille>): LigneFeuille => ({
  commune_bandeau: null, secteur: '(HC) 610 - KRIEGSHEIM', rue: 'RUE DES VOSGES', nb_colis: null, nb_pgeo: null,
  numeros: null, collectes: [], crbt: null, ...p,
});

describe('decouperNumeros', () => {
  it('« 5(2), RC13(21), [C]11 » → domicile 2 colis, relais 21 colis, collecte', () => {
    expect(decouperNumeros('5(2), RC13(21), [C]11')).toEqual([
      { numero: '5', quantite: 2, type: 'c', illisible: false },
      { numero: '13', quantite: 21, type: 'rc', illisible: false },
      { numero: '11', quantite: null, type: 'col', illisible: false },
    ]);
  });
  it('avec espaces aussi : « 12, 14 (2), RC 3 »', () => {
    expect(decouperNumeros('12, 14 (2), RC 3').map(n => [n.numero, n.quantite, n.type]))
      .toEqual([['12', null, 'c'], ['14', 2, 'c'], ['3', null, 'rc']]);
  });
  it('chiffre illisible « ? » repéré', () => {
    expect(decouperNumeros('1?, 4(?)').map(n => [n.numero, n.illisible])).toEqual([['1?', true], ['4', true]]);
  });
  it('case vide → la rue entière ; bis / ter ; « RC » seul', () => {
    expect(decouperNumeros('')).toEqual([{ numero: null, quantite: null, type: 'c', illisible: false }]);
    expect(decouperNumeros(' 5BIS ,, 7 ter ').map(n => n.numero)).toEqual(['5 bis', '7 ter']);
    expect(decouperNumeros('RC')[0]).toMatchObject({ numero: null, type: 'rc' });
  });
});

describe('separerCommune (bandeau)', () => {
  it('« 67170 KRIEGSHEIM » et variantes', () => {
    expect(separerCommune('67170 KRIEGSHEIM')).toEqual({ commune: 'KRIEGSHEIM', cp: '67170' });
    expect(separerCommune('Brumath (67170)')).toEqual({ commune: 'BRUMATH', cp: '67170' });
    expect(separerCommune(null)).toEqual({ commune: null, cp: null });
  });
});

describe('lignesEnArrets', () => {
  it('le bandeau vaut pour toutes les lignes jusqu’au suivant', () => {
    const a = lignesEnArrets([
      ligne({ commune_bandeau: '67170 KRIEGSHEIM', rue: 'RUE A', numeros: '1' }),
      ligne({ rue: 'RUE B', numeros: '2' }),
      ligne({ rue: 'RUE C', numeros: '3' }),
      ligne({ commune_bandeau: '67170 MITTELHAUSEN', secteur: '612 - MITTELHAUSEN', rue: 'RUE D', numeros: '4' }),
      ligne({ secteur: '612 - MITTELHAUSEN', rue: 'RUE E', numeros: '5' }),
    ]);
    expect(a.map(x => [x.rue, x.commune, x.cp])).toEqual([
      ['RUE A', 'KRIEGSHEIM', '67170'], ['RUE B', 'KRIEGSHEIM', '67170'], ['RUE C', 'KRIEGSHEIM', '67170'],
      ['RUE D', 'MITTELHAUSEN', '67170'], ['RUE E', 'MITTELHAUSEN', '67170'],
    ]);
  });
  it('le secteur (District) n’est jamais pris pour la commune', () => {
    const a = lignesEnArrets([
      ligne({ commune_bandeau: '67170 GEUDERTHEIM', secteur: '601 - GEUDERTHEIM EGLISE', rue: 'RUE A', numeros: '1' }),
    ]);
    expect(a[0]).toMatchObject({ commune: 'GEUDERTHEIM', secteur: '601 - GEUDERTHEIM EGLISE' });
    const sansBandeau = lignesEnArrets([ligne({ rue: 'RUE A', numeros: '1' })]);
    expect(sansBandeau[0]).toMatchObject({ commune: null, a_verifier: true });
    expect(sansBandeau[0].motif).toContain('commune absente');
  });
  it('« 5(2), RC13(21), [C]11 » cohérent avec Nb Colis 24 et Nb PGEO 3 → rien à vérifier', () => {
    const a = lignesEnArrets([ligne({ commune_bandeau: '67170 KRIEGSHEIM', numeros: '5(2), RC13(21), [C]11', nb_colis: 24, nb_pgeo: 3 })]);
    expect(a.map(x => [x.numero, x.quantite, x.type])).toEqual([['5', 2, 'c'], ['13', 21, 'rc'], ['11', 1, 'col']]);
    expect(a.every(x => !x.a_verifier && x.motif === null)).toBe(true);
  });
  it('exposant mal lu : Nb Colis imprimé fait foi quand aucun numéro n’est perdu', () => {
    const seul = lignesEnArrets([ligne({ commune_bandeau: '67170 KRIEGSHEIM', numeros: 'RC13(2)', nb_colis: 3, nb_pgeo: 1 })]);
    expect(seul[0]).toMatchObject({ quantite: 3, type: 'rc', a_verifier: false, motif: null });
    const deux = lignesEnArrets([ligne({ commune_bandeau: '67170 KRIEGSHEIM', numeros: '1, 3(4)', nb_colis: 4, nb_pgeo: 2 })]);
    expect(deux.map(x => [x.numero, x.quantite, x.a_verifier])).toEqual([['1', 1, false], ['3', 3, false]]);
  });
  it('écart ambigu (plusieurs exposants ou numéros perdus) → ligne à vérifier, avec le motif', () => {
    const a = lignesEnArrets([ligne({ commune_bandeau: '67170 KRIEGSHEIM', numeros: '1(2), 3(2)', nb_colis: 5, nb_pgeo: 2 })]);
    expect(a.every(x => x.a_verifier)).toBe(true);
    expect(a[0].motif).toBe('4 colis lus, 5 annoncés');
  });
  it('numéros manquants (moins de colis ET moins de numéros) → ligne « n° illisible » ajoutée d’office', () => {
    const a = lignesEnArrets([ligne({ commune_bandeau: '67170 KRIEGSHEIM', rue: 'RUE A', numeros: '1, 3(2)', nb_colis: 4, nb_pgeo: 3 })]);
    expect(a.map(x => [x.numero, x.quantite, x.a_verifier])).toEqual([['1', 1, false], ['3', 2, false], [null, 1, true]]);
    expect(a[2].motif).toBe('1 colis sans numéro lisible (4 colis / 3 PGEO annoncés)');
  });
  it('case vide = la rue entière avec ses colis ; CRBT sur le premier arrêt', () => {
    const a = lignesEnArrets([
      ligne({ commune_bandeau: '67170 KRIEGSHEIM', numeros: '', nb_colis: 2, nb_pgeo: 1 }),
      ligne({ numeros: '2, 4', crbt: '35,00' }),
    ]);
    expect(a[0]).toMatchObject({ numero: null, quantite: 2, a_verifier: false });
    expect(a[1].note).toBe('CRBT : 35,00');
    expect(a[2].note).toBeNull();
  });
  it('chiffre illisible → à vérifier', () => {
    const a = lignesEnArrets([ligne({ commune_bandeau: '67170 KRIEGSHEIM', numeros: '1?', nb_colis: 1, nb_pgeo: 1 })]);
    expect(a[0]).toMatchObject({ a_verifier: true, motif: 'chiffre illisible' });
  });
});

describe('controlerLigne', () => {
  it('cohérent → aucun motif ; nombres absents → pas de contrôle', () => {
    expect(controlerLigne({ nb_colis: 3, nb_pgeo: 2, numeros: '1, 2(2)' }, decouperNumeros('1, 2(2)'))).toEqual([]);
    expect(controlerLigne({ nb_colis: null, nb_pgeo: null, numeros: '1' }, decouperNumeros('1'))).toEqual([]);
  });
});

describe('lirePage', () => {
  it('« 2/3 » et variantes ; incohérent → null', () => {
    expect(lirePage('2/3')).toEqual({ numero: 2, total: 3 });
    expect(lirePage('page 1 / 4')).toEqual({ numero: 1, total: 4 });
    expect(lirePage('4/3')).toBeNull();
    expect(lirePage(null)).toBeNull();
  });
});

describe('nettoyerLecture', () => {
  it('types vérifiés, en-tête Colissimo, page, champs inconnus ignorés', () => {
    const r = nettoyerLecture({
      entete: { date: '17/10/2026', societe: 'MCA', depart: '07:45', nb_colis: '118', nb_pgeo: 92, pirate: 'x' },
      page: '1/3',
      lignes: [{ commune_bandeau: '67170 KRIEGSHEIM', secteur: '(HC) 610 - KRIEGSHEIM', rue: ' Rue  A ', nb_colis: 'deux', nb_pgeo: 1, numeros: 12 }, 'bruit'],
    });
    expect(r.entete).toEqual({ date: '17/10/2026', societe: 'MCA', depart: '07:45', nb_colis: 118, nb_pgeo: 92 });
    expect(r.page).toEqual({ numero: 1, total: 3 });
    expect(r.lignes).toEqual([{
      commune_bandeau: '67170 KRIEGSHEIM', secteur: '(HC) 610 - KRIEGSHEIM', rue: 'Rue A', nb_colis: null, nb_pgeo: 1,
      numeros: '12', collectes: [], crbt: null,
    }]);
  });
  it('réponse vide ou absurde → aucune ligne', () => {
    expect(nettoyerLecture(null)).toEqual({ entete: null, page: null, lignes: [] });
    expect(nettoyerLecture({ lignes: 'non' })).toEqual({ entete: null, page: null, lignes: [] });
  });
});

describe('communeBan (alias des communes déléguées)', () => {
  it('Mittelhausen, Hohatzenheim, Gingsheim → Wingersheim les Quatre Bans 67170', () => {
    for (const c of ['MITTELHAUSEN', 'Hohatzenheim', 'gingsheim']) {
      expect(communeBan(c, '67170')).toEqual({ commune: 'Wingersheim les Quatre Bans', cp: '67170' });
    }
  });
  it('Keffendorf → Ohlungen 67590 (même si le bandeau donne un autre CP)', () => {
    expect(communeBan('KEFFENDORF', '67170')).toEqual({ commune: 'Ohlungen', cp: '67590' });
  });
  it('commune ordinaire inchangée', () => {
    expect(communeBan('KRIEGSHEIM', '67170')).toEqual({ commune: 'KRIEGSHEIM', cp: '67170' });
  });
});

describe('choisirResultat (BAN)', () => {
  const f = (type: string, score: number, postcode: string, city = 'Kriegsheim') => ({
    geometry: { coordinates: [7.71, 48.54] }, properties: { type, score, postcode, city },
  });
  it('avec un CP : filtre par CP, pas par nom de commune', () => {
    expect(choisirResultat([f('housenumber', 0.9, '67170', 'Wingersheim les Quatre Bans')],
      { type: 'housenumber', cp: '67170', commune: 'MITTELHAUSEN' })).toEqual({ lat: 48.54, lng: 7.71 });
    expect(choisirResultat([f('housenumber', 0.9, '67000')], { type: 'housenumber', cp: '67170', commune: 'KRIEGSHEIM' })).toBeNull();
  });
  it('refuse : autre type, score faible, rien', () => {
    const att = { type: 'housenumber' as const, cp: '67170', commune: 'KRIEGSHEIM' };
    expect(choisirResultat([f('street', 0.9, '67170')], att)).toBeNull();
    expect(choisirResultat([f('housenumber', 0.3, '67170')], att)).toBeNull();
    expect(choisirResultat([f('municipality', 0.9, '67170')], { ...att, type: 'street' })).toBeNull();
    expect(choisirResultat(undefined, att)).toBeNull();
  });
  it('sans CP : la commune doit correspondre (accents, casse)', () => {
    expect(choisirResultat([f('street', 0.8, '67400', 'Illkirch-Graffenstaden')],
      { type: 'street', cp: null, commune: 'ILLKIRCH GRAFFENSTADEN' })).not.toBeNull();
    expect(choisirResultat([f('street', 0.8, '67000', 'Strasbourg')], { type: 'street', cp: null, commune: 'OSTWALD' })).toBeNull();
  });
});

// ── Tournée de Brumath (feuille du 20/10/2026) : zones, code postal, collecte, relais ───────────
import { forcerBrumath, estSecteurBrumath, cpDeCommune } from './feuilleRoute.ts'

const L = (rue: string, nb_colis: number, nb_pgeo: number, numeros: string, secteur: string | null, commune_bandeau: string | null = null) =>
  ({ commune_bandeau, secteur, rue, nb_colis, nb_pgeo, numeros, crbt: null as string | null })

describe('tournée de Brumath', () => {
  const page1 = [
    L('rue balzac', 8, 6, '23, 31, 34(3), 37, 44, 56', '(HC) 0 - District inconnu', '67170 BRUMATH'),
    L('avenue de strasbourg', 18, 11, '24, 55, 56, 64, 125, RC141(6), 144, 167, 177, [C]179, 182(3)', '(HC) 0 - District inconnu'),
    L('rue de bilwisheim', 1, 1, '', '630 - ZONE 1 (Brumath)'),
    L('rue de la hardt', 1, 1, '15', null),
    L('rue de krautwiller', 3, 3, '25(2), 30', '631 - ZONE 2'),
  ]
  it('reconnaît les secteurs « ZONE n »', () => {
    expect(estSecteurBrumath('630 - ZONE 1 (Brumath)')).toBe(true)
    expect(estSecteurBrumath('634 - ZONE 5')).toBe(true)
    expect(estSecteurBrumath('(HC) 610 - KRIEGSHEIM')).toBe(false)
    expect(estSecteurBrumath(null)).toBe(false)
  })
  it('code postal connu', () => {
    expect(cpDeCommune('Brumath')).toBe('67170')
    expect(cpDeCommune('BRUMATH')).toBe('67170')
    expect(cpDeCommune('Donnenheim')).toBeNull()
  })
  it('avenue de Strasbourg : 18 colis = 11 numéros, relais 141 (6 colis), collecte 179 : rien « à vérifier »', () => {
    const a = lignesEnArrets(forcerBrumath(page1)).filter(x => x.rue === 'avenue de strasbourg')
    expect(a).toHaveLength(11)
    expect(a.some(x => x.a_verifier)).toBe(false)
    expect(a.find(x => x.numero === '141')).toMatchObject({ type: 'rc', quantite: 6 })
    expect(a.find(x => x.numero === '179')?.type).toBe('col')
    expect(a.find(x => x.numero === '182')?.quantite).toBe(3)
    expect(a.reduce((s, x) => s + x.quantite, 0)).toBe(18)
  })
  it('tout est à Brumath 67170, même sans bandeau, bandeau erroné ou secteur manquant', () => {
    const lignes = [
      L('rue de bilwisheim', 1, 1, '', '630 - ZONE 1 (Brumath)', '67170 BILWISHEIM'), // la vision a pris la rue pour un bandeau
      L('rue de la hardt', 1, 1, '15', null),
      L('rue de krautwiller', 3, 3, '25(2), 30', '631 - ZONE 2'),
    ]
    const a = lignesEnArrets(forcerBrumath(lignes))
    expect(a.every(x => x.commune === 'BRUMATH' && x.cp === '67170')).toBe(true)
  })
  it('page 2 sans aucun bandeau : les zones suffisent', () => {
    const p2 = [
      L('rue des jardiniers', 2, 1, '3A(2)', '634 - ZONE 5'),
      L('rue du general de gaulle', 2, 2, '11, 19B', null),
      L('rue de l industrie', 6, 5, '6, 9(2), 19, 26, 38', '635 - ZONE 6'),
      L('rue des carrieres', 5, 2, 'RC4A(4), 7', null),
      L('rue de la scierie', 4, 3, '2, 3(2), 10', '636 - ZONE 7'),
    ]
    const a = lignesEnArrets(forcerBrumath(p2))
    expect(a.every(x => x.commune === 'BRUMATH' && x.cp === '67170')).toBe(true)
    expect(a.every(x => !x.a_verifier)).toBe(true)
    expect(a.find(x => x.numero === '4A')).toMatchObject({ type: 'rc', quantite: 4 })
  })
  it('une feuille d\'un autre secteur n\'est pas touchée', () => {
    const l = [L('rue du stade', 1, 1, '5', '(HC) 610 - KRIEGSHEIM', '67170 KRIEGSHEIM')]
    expect(forcerBrumath(l)).toEqual(l)
  })

  it('feuille du 16/10/2026 : relais RC141(8) et collectes encadrées en noir', () => {
    const a = lignesEnArrets([
      ligne({ commune_bandeau: '67170 BRUMATH', rue: 'avenue de strasbourg', numeros: '1(2), 22A, 37(2), RC141(8), 144', nb_colis: 14, nb_pgeo: 5 }),
      ligne({ rue: 'rue de vendenheim', numeros: '[C]28A', nb_colis: 1, nb_pgeo: 1 }),
      ligne({ rue: 'rue jacques kable', numeros: 'RC4(22)', nb_colis: 22, nb_pgeo: 1 }),
    ])
    expect(a.find(x => x.numero === '141')).toMatchObject({ type: 'rc', quantite: 8 })
    expect(a.find(x => x.numero === '28A')).toMatchObject({ type: 'col', quantite: 1 })
    expect(a.find(x => x.numero === '4')).toMatchObject({ type: 'rc', quantite: 22 })
    expect(a.filter(x => x.a_verifier)).toEqual([])
  })
})

describe('détection des collectes', () => {
  const col = (t: string) => decouperNumeros(t).map(n => [n.numero, n.type])

  it.each([
    ['[C]11', '11'], ['[c] 11', '11'], ['(C)11', '11'], ['[COL]11', '11'], ['[Collecte] 11', '11'],
    ['C]11', '11'], ['[C11', '11'], ['COL 11', '11'], ['■11', '11'], ['█ 11', '11'], ['{C}11', '11'],
  ])('« %s » = collecte n° %s', (texte, numero) => {
    expect(col(texte)).toEqual([[numero, 'col']])
  })

  it('une lettre C collée au numéro n\'est pas une collecte', () => {
    expect(col('12C, 5C')).toEqual([['12C', 'c'], ['5C', 'c']])
  })

  it('un seul carré noir noyé dans la liste', () => {
    expect(col('2, 4, [C]6, 8, 10')).toEqual([['2', 'c'], ['4', 'c'], ['6', 'col'], ['8', 'c'], ['10', 'c']])
  })

  it('collecte avec exposant et même adresse deux fois', () => {
    expect(decouperNumeros('[C]10(2), 6, [C]6')).toEqual([
      { numero: '10', quantite: 2, type: 'col', illisible: false },
      { numero: '6', quantite: null, type: 'c', illisible: false },
      { numero: '6', quantite: null, type: 'col', illisible: false },
    ])
  })

  it('numéro listé à part dans « collectes » → collecte, même sans [C] dans la case', () => {
    const arrets = lignesEnArrets([ligne({ commune_bandeau: '67170 KRIEGSHEIM', nb_colis: 3, nb_pgeo: 3, numeros: '2, 6, 8', collectes: ['6'] })])
    expect(arrets.map(a => [a.numero, a.type])).toEqual([['2', 'c'], ['6', 'col'], ['8', 'c']])
  })

  it('« collectes » lues avec accents de format et lettres', () => {
    const n = decouperNumeros('28A, 5')
    marquerCollectes(n, ['28 a', '[C]99'])
    expect(n.map(x => x.type)).toEqual(['col', 'c'])
  })

  it('ne touche ni relais ni numéros absents', () => {
    const n = decouperNumeros('RC13(21), 4')
    marquerCollectes(n, ['13', '9'])
    expect(n.map(x => x.type)).toEqual(['rc', 'c'])
  })

  it('nettoyerLecture : « collectes » en liste ou en texte', () => {
    const brut = { lignes: [{ rue: 'A', numeros: '1', collectes: ['1', ' 3 '] }, { rue: 'B', numeros: '2', collectes: '2, 4' }, { rue: 'C', numeros: '3' }] }
    expect(nettoyerLecture(brut).lignes.map(l => l.collectes)).toEqual([['1', '3'], ['2', '4'], []])
  })
})
