import { describe, it, expect } from 'vitest';
import {
  controlerLigne, decouperNumeros, lignesEnArrets, lirePage, nettoyerLecture, separerCommune, type LigneFeuille,
} from './feuilleRoute.ts';
import { choisirResultat, communeBan } from './geocodeArret.ts';

const ligne = (p: Partial<LigneFeuille>): LigneFeuille => ({
  commune_bandeau: null, secteur: '(HC) 610 - KRIEGSHEIM', rue: 'RUE DES VOSGES', nb_colis: null, nb_pgeo: null,
  numeros: null, crbt: null, ...p,
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
  it('écart Nb Colis ou Nb PGEO → toute la ligne à vérifier, avec le motif', () => {
    const a = lignesEnArrets([ligne({ commune_bandeau: '67170 KRIEGSHEIM', numeros: '1, 3(2)', nb_colis: 4, nb_pgeo: 3 })]);
    expect(a.every(x => x.a_verifier)).toBe(true);
    expect(a[0].motif).toBe('3 colis lus, 4 annoncés · 2 numéros lus, 3 PGEO');
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
      numeros: '12', crbt: null,
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
