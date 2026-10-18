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
  it('sans référentiel : rien ne change', () => {
    const vide = indexer([]);
    const [a] = appliquerReferentiel([{ commune: 'OSTWALD', cp: '67540', secteur: null, rue: 'rue a', numero: '1', type: 'c' as const }], vide);
    expect(a).toMatchObject({ commune: 'OSTWALD', rue: 'rue a', lat: null, rue_connue: false, ref_rang: null });
  });
});
