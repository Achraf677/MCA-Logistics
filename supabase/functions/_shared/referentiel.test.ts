import { describe, it, expect } from 'vitest';
import {
  cle, cleSouple, indexer, trouverCommune, trouverRue, localiserNumero, estRelais, appliquerReferentiel, type RueRef,
} from './referentiel.ts';

const rue = (commune: string, nom: string, rang: number | null, numeros: Record<string, [number, number]> = {}, relais: string[] = []): RueRef => ({
  commune, commune_cle: cle(commune), rue: nom, rue_cle: cle(nom), rue_souple: cleSouple(nom), rang, numeros,
  centre: Object.keys(numeros).length ? numeros[Object.keys(numeros)[0]] : null, relais,
});

const REF = indexer([
  rue('Kriegsheim', "Rue de l'Etang", 30, { '6': [48.75, 7.73], '9': [48.751, 7.731], '10': [48.752, 7.732] }),
  rue('Kriegsheim', "Grand'Rue", 31, { '13': [48.76, 7.74] }, ['13']),
  rue('Geudertheim', 'Rue du Général de Gaulle', 0, { '52': [48.72, 7.75] }),
  rue('Bernolsheim', 'Route de Brumath', 60, { '1': [48.77, 7.70] }, ['*']),
  rue('Waltenheim-sur-Zorn', 'Rue des Prés', 90, {}),
  rue('Brumath', 'Rue des Prés', 400, {}),
]);

describe('clés', () => {
  it('accents, apostrophes, mots vides, pluriels', () => {
    expect(cle("Rue de l'Étang")).toBe('rue de l etang');
    expect(cleSouple('rue des pres')).toBe(cleSouple('Rue du Pré'));
  });
});

describe('commune', () => {
  it('trouvée dans le secteur, la plus longue d’abord', () => {
    expect(trouverCommune(REF, '601 - GEUDERTHEIM EGLISE')).toBe('Geudertheim');
    expect(trouverCommune(REF, '(HC) 615 - WALTENHEIM SUR ZORN')).toBe('Waltenheim-sur-Zorn');
    expect(trouverCommune(REF, '67170 KRIEGSHEIM')).toBe('Kriegsheim');
    expect(trouverCommune(REF, 'ailleurs')).toBeNull();
  });
});

describe('rue et position', () => {
  it('nom lu → nom officiel (exact ou souple)', () => {
    expect(trouverRue(REF, 'Kriegsheim', 'rue de l etang')?.rue).toBe("Rue de l'Etang");
    expect(trouverRue(REF, 'Kriegsheim', 'GRAND RUE')?.rue).toBe("Grand'Rue");
    expect(trouverRue(REF, 'Geudertheim', 'rue du general de gaulle')?.rang).toBe(0);
    expect(trouverRue(REF, 'Kriegsheim', 'rue inconnue')).toBeNull();
  });
  it('numéro exact, voisin même côté, sinon milieu de rue', () => {
    const r = trouverRue(REF, 'Kriegsheim', "rue de l'etang")!;
    expect(localiserNumero(r, '9')).toEqual({ lat: 48.751, lng: 7.731, precision: 'numero' });
    expect(localiserNumero(r, '8')).toMatchObject({ lat: 48.75, precision: 'rue' }); // 6 et 10 : premier trouvé, même côté
    expect(localiserNumero(r, '11')).toMatchObject({ lat: 48.751, precision: 'rue' });
    expect(localiserNumero(r, '200')).toMatchObject({ precision: 'rue' }); // trop loin : milieu de rue
    expect(localiserNumero(trouverRue(REF, 'Brumath', 'rue des pres')!, '3')).toBeNull();
  });
  it('relais connus : un numéro ou toute la rue', () => {
    expect(estRelais(trouverRue(REF, 'Kriegsheim', 'grand rue')!, '13')).toBe(true);
    expect(estRelais(trouverRue(REF, 'Kriegsheim', 'grand rue')!, '14')).toBe(false);
    expect(estRelais(trouverRue(REF, 'Bernolsheim', 'route de brumath')!, '7')).toBe(true);
  });
});

describe('appliquer à une page lue', () => {
  it('commune par le secteur, rue officielle, position, relais, rang ; page sans bandeau', () => {
    const lus = appliquerReferentiel([
      { commune: 'GEUDERTHEIM', cp: '67170', secteur: '601 - GEUDERTHEIM EGLISE', rue: 'rue du general de gaulle', numero: '52', type: 'c' as const },
      { commune: null, cp: null, secteur: null, rue: 'grand rue', numero: '13', type: 'c' as const },
      { commune: null, cp: null, secteur: '(HC) 612 - BERNOLSHEIM', rue: 'route de brumath', numero: '1', type: 'c' as const },
      { commune: 'BERNOLSHEIM', cp: null, secteur: null, rue: 'rue nouvelle', numero: '2', type: 'col' as const },
    ], REF, 'Kriegsheim');
    expect(lus[0]).toMatchObject({ commune: 'Geudertheim', rue: 'Rue du Général de Gaulle', lat: 48.72, geo_precision: 'numero', ref_rang: 0, rue_connue: true });
    expect(lus[1]).toMatchObject({ commune: 'Geudertheim', rue: 'grand rue', rue_connue: false }); // suit la commune précédente
    expect(lus[2]).toMatchObject({ commune: 'Bernolsheim', type: 'rc', ref_rang: 60 });
    expect(lus[3]).toMatchObject({ commune: 'Bernolsheim', type: 'col', rue_connue: false, ref_rang: null, ref_rang_commune: 60 });
  });
  it('commune retrouvée par le secteur : plus de « bandeau non lu » à vérifier', () => {
    const [a] = appliquerReferentiel([
      { commune: null, cp: null, secteur: '601 - GEUDERTHEIM EGLISE', rue: 'rue des pres', numero: '2', type: 'c' as const, a_verifier: true, motif: 'commune absente (bandeau non lu)' },
    ], REF);
    const [b] = appliquerReferentiel([
      { commune: null, cp: null, secteur: 'inconnu', rue: 'x', numero: '1', type: 'c' as const, a_verifier: true, motif: 'commune absente (bandeau non lu) · 2 colis lus, 3 annoncés' },
    ], REF);
    expect(a).toMatchObject({ commune: 'Geudertheim', a_verifier: false, motif: null });
    expect(b).toMatchObject({ a_verifier: true, motif: 'commune absente (bandeau non lu) · 2 colis lus, 3 annoncés' });
  });
  it('sans référentiel : rien ne change', () => {
    const vide = indexer([]);
    const [a] = appliquerReferentiel([{ commune: 'OSTWALD', cp: '67540', secteur: null, rue: 'rue a', numero: '1', type: 'c' as const }], vide);
    expect(a).toMatchObject({ commune: 'OSTWALD', rue: 'rue a', lat: null, rue_connue: false, ref_rang: null });
  });
});

import { cle as cleAbrev } from './referentiel.ts'
describe('abréviations de la feuille', () => {
  it('« rue du Mal de Lattre de Tassigny » = Maréchal', () => {
    expect(cleAbrev('rue du mal de lattre de tassigny')).toBe(cleAbrev('Rue du Maréchal de Lattre de Tassigny'))
    expect(cleAbrev('rue du Gal de Gaulle')).toBe(cleAbrev('Rue du Général de Gaulle'))
  })
})

// ── Feuille de Brumath du 20/10/2026 : ce que la vision a mal lu ─────────────
import { corrigerNumero, trouverRueProche, trouverRueParPlace, distanceEdition } from './referentiel.ts'

const rueB = (rue: string, rang: number, nums: string[] = [], relais: string[] = []): RueRef => ({
  commune: 'Brumath', commune_cle: 'brumath', rue, rue_cle: cle(rue), rue_souple: cleSouple(rue), rang,
  numeros: Object.fromEntries(nums.map(n => [n, [48.7, 7.7] as [number, number]])), centre: [48.7, 7.7], relais,
});
const BRUMATH = indexer([
  rueB('Rue des Jardiniers', 573, ['3A', '19', '22']),
  rueB('Rue de Hochstett', 604, ['1B', '6']),
  rueB('Rue des Gravières', 642, ['6', '16']),
  rueB('Rue des Carrières', 644, ['4A', '7'], ['4A']),
  rueB('Rue de l’Equerre', 645, ['12']),
  rueB('Rue des Grumes', 646, ['4', '6']),
  rueB('Rue de la Charpente', 650, ['8']),
  rueB('Rue du Tonneau', 651, ['1', '2']),
  rueB('Rue des Ebénistes', 652, ['26', '30']),
  rueB('Rue de la Scierie', 653, ['2', '9', '10']),
  rueB('Rue du Maréchal de Lattre de Tassigny', 496, ['1A', '7']),
]);
const lu = (rue: string, numero: string | null, type: 'c' | 'rc' | 'col' = 'c') =>
  ({ commune: 'BRUMATH', cp: '67170', secteur: '632 - ZONE 3', rue, numero, type });

describe('feuille de Brumath : lectures approchées', () => {
  it('fautes de lecture sur le nom de rue', () => {
    expect(trouverRueProche(BRUMATH, 'Brumath', 'rue des carriers')?.rue).toBe('Rue des Carrières');
    expect(trouverRueProche(BRUMATH, 'Brumath', 'rue des graviers')?.rue).toBe('Rue des Gravières');
    expect(trouverRueProche(BRUMATH, 'Brumath', 'rue de lequierre')?.rue).toBe('Rue de l’Equerre');
    expect(trouverRueProche(BRUMATH, 'Brumath', 'rue du mal de latte de tassigny')?.rue).toBe('Rue du Maréchal de Lattre de Tassigny');
    expect(trouverRueProche(BRUMATH, 'Brumath', 'rue des eberlins')).toBeNull(); // trop éloigné : par la place
    expect(distanceEdition('carriers', 'carrieres')).toBe(1);
  });
  it('rue illisible : retrouvée par sa place et ses numéros', () => {
    // Entre la Charpente (650) et la Scierie (653) : Tonneau (1, 2) ou Ebénistes (26, 30) ?
    expect(trouverRueParPlace(BRUMATH, 'Brumath', ['26', '30'], 650, 653)?.rue).toBe('Rue des Ebénistes');
    expect(trouverRueParPlace(BRUMATH, 'Brumath', ['99'], 650, 653)).toBeNull();
  });
  it('chiffre pour lettre : 34 → 3A, 18 → 1B, uniquement si la variante existe', () => {
    const jardiniers = BRUMATH.exact.get('brumath|rue des jardiniers')!;
    expect(corrigerNumero(jardiniers, '34')).toBe('3A');
    expect(corrigerNumero(jardiniers, '19')).toBe('19');
    expect(corrigerNumero(jardiniers, '77')).toBe('77');
    const hochstett = BRUMATH.exact.get('brumath|rue de hochstett')!;
    expect(corrigerNumero(hochstett, '18')).toBe('1B');
  });
  it('arrêts de la feuille : rue officielle, numéro corrigé, relais du fichier', () => {
    const r = appliquerReferentiel([
      lu('Rue des Jardiniers', '34'),
      lu('rue de hochstett', '18'),
      lu('rue des graviers', '6'),
      lu('rue des carriers', '4A', 'c'),
      lu('rue des eberlins', '26'),
      lu('rue des eberlins', '30'),
    ].map(a => ({ ...a })), BRUMATH);
    expect(r.map(x => x.rue)).toEqual(['Rue des Jardiniers', 'Rue de Hochstett', 'Rue des Gravières', 'Rue des Carrières', 'Rue des Ebénistes', 'Rue des Ebénistes']);
    expect(r[0].numero).toBe('3A');
    expect(r[1].numero).toBe('1B');
    expect(r[3].type).toBe('rc'); // 4A est un relais connu
    expect(r.every(x => x.rue_connue && x.lat != null)).toBe(true);
  });
});

describe('recalage par les numéros (photo penchée)', () => {
  const nums = (...n: string[]) => n;
  const R = [
    rueB('Rue de la Gare', 491, nums('4', '17', '25')),
    rueB('Rue de Krautwiller', 495, nums('25', '30', '4')),
    rueB('Rue du Maréchal de Lattre de Tassigny', 496, nums('1A', '13', '20')),
    rueB('Rue des Tuiles', 500, nums('1A', '7', '3')),
    rueB('Rue du Général Duport', 501, nums('3', '13', '17', '39', '40', '53')),
    rueB('Rue de la Rivière', 490, nums('10', '4')),
  ];
  const REF2 = indexer(R);
  it('chaque bloc de numéros revient à la rue où ils existent tous', () => {
    // Lecture réelle : les numéros de chaque ligne étaient posés sur la rue d'au-dessus.
    const lus = [
      lu('rue de la gare', '4'), lu('rue de la gare', '17'),
      lu('rue de krautwiller', '25'), lu('rue de krautwiller', '30'),
      lu('rue du mal de lattre de tassigny', '1A'), lu('rue du mal de lattre de tassigny', '13'), lu('rue du mal de lattre de tassigny', '20'),
      lu('rue des tuiles', '1A'), lu('rue des tuiles', '7'),
      lu('rue du general duport', '3'), lu('rue du general duport', '13'), lu('rue du general duport', '17'),
      lu('rue du general duport', '10'), // la ligne suivante de la feuille (Rivière) : rien de voisin ne convient, elle reste
    ];
    // décalage : on décale les rues d'un cran (la rue de chaque ligne = la rue de la ligne précédente)
    const rues = ['rue de la riviere', 'rue de la gare', 'rue de krautwiller', 'rue du mal de lattre de tassigny', 'rue des tuiles', 'rue du general duport'];
    const blocs = [[0, 1], [2, 3], [4, 5, 6], [7, 8], [9, 10, 11], [12]];
    const decales = lus.map((a, i) => ({ ...a, rue: rues[blocs.findIndex(b => b.includes(i))] }));
    const r = appliquerReferentiel(decales, REF2);
    expect(r.map(x => x.rue)).toEqual([
      'Rue de la Gare', 'Rue de la Gare',
      'Rue de Krautwiller', 'Rue de Krautwiller',
      'Rue du Maréchal de Lattre de Tassigny', 'Rue du Maréchal de Lattre de Tassigny', 'Rue du Maréchal de Lattre de Tassigny',
      'Rue des Tuiles', 'Rue des Tuiles',
      'Rue du Général Duport', 'Rue du Général Duport', 'Rue du Général Duport',
      'Rue du Général Duport',
    ]);
  });
  it('rue correcte ou ambiguë : rien ne bouge', () => {
    const bon = appliquerReferentiel([lu('rue de la gare', '4'), lu('rue de krautwiller', '30')].map(a => ({ ...a })), REF2);
    expect(bon.map(x => x.rue)).toEqual(['Rue de la Gare', 'Rue de Krautwiller']);
    // « 4 » existe dans plusieurs rues voisines : ambigu
    const amb = appliquerReferentiel([lu('rue de la riviere', '77'), lu('rue de la gare', '4')].map(a => ({ ...a })), REF2);
    expect(amb[0].rue).toBe('Rue de la Rivière');
  });
});
