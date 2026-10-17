import { describe, it, expect } from 'vitest';
import { decouperNumeros, lignesEnArrets, nettoyerLecture, separerCommune, type LigneFeuille } from './feuilleRoute.ts';
import { choisirResultat } from './geocodeArret.ts';

const ligne = (p: Partial<LigneFeuille>): LigneFeuille => ({
  commune: 'OSTWALD', cp: '67540', rue: 'RUE DES VOSGES', nb_colis: null, numeros: null, crbt: null, ...p,
});

describe('decouperNumeros', () => {
  it('« 12, 14 (2), RC 3 » → 3 numéros, quantité et relais', () => {
    expect(decouperNumeros('12, 14 (2), RC 3')).toEqual([
      { numero: '12', quantite: null, type: 'c' },
      { numero: '14', quantite: 2, type: 'c' },
      { numero: '3', quantite: null, type: 'rc' },
    ]);
  });
  it('collecte [C], devant ou derrière', () => {
    expect(decouperNumeros('[C] 7, 9 [C] (2)')).toEqual([
      { numero: '7', quantite: null, type: 'col' },
      { numero: '9', quantite: 2, type: 'col' },
    ]);
  });
  it('case vide → la rue entière', () => {
    expect(decouperNumeros('')).toEqual([{ numero: null, quantite: null, type: 'c' }]);
    expect(decouperNumeros(null)).toEqual([{ numero: null, quantite: null, type: 'c' }]);
  });
  it('bis / ter, espaces, séparateurs vides ignorés', () => {
    expect(decouperNumeros(' 5BIS ,, 7 ter ;  8B ')).toEqual([
      { numero: '5 bis', quantite: null, type: 'c' },
      { numero: '7 ter', quantite: null, type: 'c' },
      { numero: '8B', quantite: null, type: 'c' },
    ]);
  });
  it('« RC » seul = relais sans numéro ; « (0) » ramené à 1', () => {
    expect(decouperNumeros('RC')).toEqual([{ numero: null, quantite: null, type: 'rc' }]);
    expect(decouperNumeros('4 (0)')[0].quantite).toBe(1);
  });
});

describe('separerCommune', () => {
  it('CP dans la commune, devant ou entre parenthèses', () => {
    expect(separerCommune('67540 Ostwald', null)).toEqual({ commune: 'OSTWALD', cp: '67540' });
    expect(separerCommune('ILLKIRCH-GRAFFENSTADEN (67400)', null)).toEqual({ commune: 'ILLKIRCH-GRAFFENSTADEN', cp: '67400' });
    expect(separerCommune('Ostwald', '67540')).toEqual({ commune: 'OSTWALD', cp: '67540' });
    expect(separerCommune(null, null)).toEqual({ commune: null, cp: null });
  });
});

describe('lignesEnArrets', () => {
  it('un arrêt par numéro, ordre de la feuille, somme = Nb Colis', () => {
    const a = lignesEnArrets([ligne({ numeros: '12, 14 (2), RC 3', nb_colis: 4 })]);
    expect(a.map(x => [x.numero, x.quantite, x.type])).toEqual([['12', 1, 'c'], ['14', 2, 'c'], ['3', 1, 'rc']]);
    expect(a.every(x => !x.a_verifier)).toBe(true);
  });
  it('un seul numéro sans (n) reçoit tous les colis de la ligne', () => {
    const a = lignesEnArrets([ligne({ numeros: '5', nb_colis: 3 })]);
    expect(a[0].quantite).toBe(3);
    expect(a[0].a_verifier).toBe(false);
  });
  it('écart avec Nb Colis → à vérifier', () => {
    const a = lignesEnArrets([ligne({ numeros: '1, 3', nb_colis: 5 })]);
    expect(a.every(x => x.a_verifier)).toBe(true);
  });
  it('les collectes ne comptent pas dans Nb Colis', () => {
    const a = lignesEnArrets([ligne({ numeros: '2 (2), [C] 4', nb_colis: 2 })]);
    expect(a.every(x => !x.a_verifier)).toBe(true);
  });
  it('commune vide : reprise de la ligne du dessus ; CRBT sur le premier arrêt', () => {
    const a = lignesEnArrets([
      ligne({ commune: '67540 OSTWALD', cp: null, rue: 'RUE A', numeros: '1' }),
      ligne({ commune: null, cp: null, rue: 'RUE B', numeros: '2, 4', crbt: '35,00' }),
    ]);
    expect(a[1]).toMatchObject({ commune: 'OSTWALD', cp: '67540', rue: 'RUE B', note: 'CRBT : 35,00' });
    expect(a[2].note).toBeNull();
  });
  it('rue « RC … » = point relais ; ligne sans rue ni numéro ignorée ; rue illisible à vérifier', () => {
    const a = lignesEnArrets([
      ligne({ rue: 'RC TABAC DU CENTRE', numeros: '10' }),
      ligne({ rue: null, numeros: null }),
      ligne({ rue: null, numeros: '8' }),
    ]);
    expect(a).toHaveLength(2);
    expect(a[0].type).toBe('rc');
    expect(a[1].a_verifier).toBe(true);
  });
});

describe('nettoyerLecture', () => {
  it('types vérifiés, champs inconnus ignorés, illisible = null', () => {
    const r = nettoyerLecture({
      entete: { date: '17/10/2026', vehicule: 'FG-788-FB', nb_colis: '118', pirate: 'x' },
      lignes: [{ district: '67540 OSTWALD', rue: ' Rue  A ', nb_colis: 'deux', numeros: 12 }, 'bruit'],
    });
    expect(r.entete).toEqual({ date: '17/10/2026', vehicule: 'FG-788-FB', nb_colis: 118 });
    expect(r.lignes).toEqual([{ commune: '67540 OSTWALD', cp: null, rue: 'Rue A', nb_colis: null, numeros: '12', crbt: null }]);
  });
  it('réponse vide ou absurde → aucune ligne', () => {
    expect(nettoyerLecture(null)).toEqual({ entete: null, lignes: [] });
    expect(nettoyerLecture({ lignes: 'non' })).toEqual({ entete: null, lignes: [] });
  });
});

describe('choisirResultat (BAN)', () => {
  const f = (type: string, score: number, postcode: string, city = 'Ostwald') => ({
    geometry: { coordinates: [7.71, 48.54] }, properties: { type, score, postcode, city },
  });
  it('bon type, bon CP, score suffisant', () => {
    expect(choisirResultat([f('housenumber', 0.9, '67540')], { type: 'housenumber', cp: '67540', commune: 'OSTWALD' }))
      .toEqual({ lat: 48.54, lng: 7.71 });
  });
  it('refuse : autre type, autre CP, score faible', () => {
    const att = { type: 'housenumber' as const, cp: '67540', commune: 'OSTWALD' };
    expect(choisirResultat([f('street', 0.9, '67540')], att)).toBeNull();
    expect(choisirResultat([f('housenumber', 0.9, '67000')], att)).toBeNull();
    expect(choisirResultat([f('housenumber', 0.3, '67540')], att)).toBeNull();
    expect(choisirResultat(undefined, att)).toBeNull();
  });
  it('sans CP : la commune doit correspondre (accents, casse)', () => {
    expect(choisirResultat([f('street', 0.8, '67400', 'Illkirch-Graffenstaden')],
      { type: 'street', cp: null, commune: 'ILLKIRCH GRAFFENSTADEN' })).not.toBeNull();
    expect(choisirResultat([f('street', 0.8, '67000', 'Strasbourg')],
      { type: 'street', cp: null, commune: 'OSTWALD' })).toBeNull();
  });
});
