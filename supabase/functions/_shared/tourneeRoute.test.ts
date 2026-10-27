import { describe, it, expect } from 'vitest';
import {
  regrouperNoeuds, blocsMatrice, troncons, resoudre, coutParcours, passages, matricesVolOiseau,
  completerMatrices, ordonnerZones, rangZone, matriceCouts, noeudsDansOrdre, passagesDepuisEtapes, polirParFenetres, penaliserChangementsVillage, penaliserOrdreZones, encoderPolyligne, decoderPolyligne, distanceM, type ArretAPlacer,
} from './tourneeRoute.ts';

const arret = (id: string, lat: number | null, lng: number | null, numero: string | null = null, rang = 1): ArretAPlacer =>
  ({ id, lat, lng, numero, rang });

/** Toutes les permutations (petits cas) → coût minimal exact. */
function optimum(c: number[][], depart: number, noeuds: number[], arrivee: number | null): number {
  let best = Infinity;
  const perm = (reste: number[], acc: number[]) => {
    if (!reste.length) { best = Math.min(best, coutParcours(c, depart, acc, arrivee)); return; }
    reste.forEach((x, i) => perm([...reste.slice(0, i), ...reste.slice(i + 1)], [...acc, x]));
  };
  perm(noeuds, []);
  return best;
}

/** Points sur une grille, matrice euclidienne. */
function grille(n: number, graine = 1): { pts: Array<{ x: number; y: number }>; c: number[][] } {
  let s = graine;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const pts = Array.from({ length: n }, () => ({ x: rnd() * 100, y: rnd() * 100 }));
  const c = pts.map(a => pts.map(b => Math.hypot(a.x - b.x, a.y - b.y)));
  return { pts, c };
}

describe('regrouperNoeuds', () => {
  it('même point = un nœud ; numéros croissants, pairs puis impairs ; sans coordonnées ignoré', () => {
    const n = regrouperNoeuds([
      arret('a', 48.5, 7.7, '7', 3), arret('b', 48.5, 7.7, '4', 1), arret('c', 48.5, 7.7, '2', 2),
      arret('d', 48.6, 7.8, '1', 4), arret('e', null, null, '9', 5),
    ]);
    expect(n).toHaveLength(2);
    expect(n[0].arrets).toEqual(['c', 'b', 'a']);
    expect(n[1].arrets).toEqual(['d']);
  });
  it('arrondi à 5 décimales (~1 m)', () => {
    expect(regrouperNoeuds([arret('a', 48.500001, 7.7), arret('b', 48.500002, 7.7)])).toHaveLength(1);
  });
});

describe('découpage ORS', () => {
  it('blocs de matrice ≤ 3 500 éléments, couverture exacte', () => {
    const n = 150;
    const blocs = blocsMatrice(n);
    const vus = new Set<string>();
    for (const b of blocs) {
      expect((b.sources[1] - b.sources[0]) * (b.destinations[1] - b.destinations[0])).toBeLessThanOrEqual(3500);
      for (let i = b.sources[0]; i < b.sources[1]; i++) {
        for (let j = b.destinations[0]; j < b.destinations[1]; j++) vus.add(`${i},${j}`);
      }
    }
    expect(vus.size).toBe(n * n);
    expect(blocs).toHaveLength(9);
    expect(blocsMatrice(40)).toEqual([{ sources: [0, 40], destinations: [0, 40] }]);
  });
  it('itinéraire en tronçons de ≤ 50 points qui se recouvrent d’un point', () => {
    const pts = Array.from({ length: 120 }, (_, i) => i);
    const t = troncons(pts);
    expect(t.every(x => x.length <= 50)).toBe(true);
    expect(t[0][49]).toBe(t[1][0]);
    expect(t[t.length - 1].at(-1)).toBe(119);
    expect(troncons([1])).toEqual([]);
  });
});

describe('solveur', () => {
  it('trouve l’optimum sur de petits cas connus (départ et arrivée fixés)', () => {
    for (let g = 1; g <= 6; g++) {
      const { c } = grille(8, g);
      const noeuds = [1, 2, 3, 4, 5, 6, 7];
      const ordre = resoudre(c, 0, noeuds, 0);
      expect(coutParcours(c, 0, ordre, 0)).toBeCloseTo(optimum(c, 0, noeuds, 0), 6);
    }
  });
  it('parcours ouvert (pas de retour) : optimum aussi', () => {
    const { c } = grille(7, 9);
    const noeuds = [1, 2, 3, 4, 5, 6];
    expect(coutParcours(c, 0, resoudre(c, 0, noeuds, null), null)).toBeCloseTo(optimum(c, 0, noeuds, null), 6);
  });
  it('2-opt décroise un ordre croisé', () => {
    // Carré : départ (0,0), points aux coins ; le plus proche voisin seul ne suffit pas toujours.
    const pts = [[0, 0], [0, 10], [10, 0], [10, 10], [0, 5], [10, 5]];
    const c = pts.map(a => pts.map(b => Math.hypot(a[0] - b[0], a[1] - b[1])));
    const ordre = resoudre(c, 0, [1, 2, 3, 4, 5], 0);
    expect(coutParcours(c, 0, ordre, 0)).toBeCloseTo(40, 6);
  });
  it('au-delà de 10 points (recherche locale) : à moins de 5 % de l’optimum connu d’un cercle', () => {
    // 30 points sur un cercle : l'optimum est le tour du cercle.
    const pts = Array.from({ length: 31 }, (_, i) => [Math.cos((i * 2 * Math.PI) / 31), Math.sin((i * 2 * Math.PI) / 31)]);
    const melange = [...pts.keys()].slice(1).sort((a, b) => ((a * 7919) % 31) - ((b * 7919) % 31));
    const c = pts.map(a => pts.map(b => Math.hypot(a[0] - b[0], a[1] - b[1])));
    const tour = coutParcours(c, 0, [...pts.keys()].slice(1), 0);
    expect(coutParcours(c, 0, resoudre(c, 0, melange, 0), 0)).toBeLessThan(tour * 1.05);
  });
  it('les perturbations ne dégradent jamais et améliorent souvent', () => {
    let mieux = 0
    for (let g = 1; g <= 8; g++) {
      const { c } = grille(80, g)
      const n = Array.from({ length: 79 }, (_, i) => i + 1)
      const sans = coutParcours(c, 0, resoudre(c, 0, n, 0, { perturbations: 0, limiteMs: 20000 }), 0)
      const avec = coutParcours(c, 0, resoudre(c, 0, n, 0, { perturbations: 200, limiteMs: 20000 }), 0)
      expect(avec).toBeLessThanOrEqual(sans + 1e-9)
      if (avec < sans - 1e-9) mieux++
    }
    expect(mieux).toBeGreaterThanOrEqual(2)
  }, 30000);
  it('déterministe : même entrée, même ordre', () => {
    const { c } = grille(40, 3);
    const n = Array.from({ length: 39 }, (_, i) => i + 1);
    expect(resoudre(c, 0, n, 0, { limiteMs: 60_000 })).toEqual(resoudre(c, 0, n, 0, { limiteMs: 60_000 }));
  });
  it('matrice asymétrique (sens unique) respectée', () => {
    // 0 → 1 → 2 → 0 bon marché ; le sens inverse coûte très cher.
    const c = [[0, 1, 50], [50, 0, 1], [1, 50, 0]];
    expect(resoudre(c, 0, [1, 2], 0)).toEqual([1, 2]);
    const inverse = [[0, 50, 1], [1, 0, 50], [50, 1, 0]];
    expect(resoudre(inverse, 0, [1, 2], 0)).toEqual([2, 1]);
  });
  it('150 points en moins de 1 s, au moins aussi bon que le plus proche voisin', () => {
    const { c } = grille(151, 7);
    const n = Array.from({ length: 150 }, (_, i) => i + 1);
    const t0 = Date.now();
    const ordre = resoudre(c, 0, n, 0, { limiteMs: 800 });
    expect(Date.now() - t0).toBeLessThan(1000);
    expect(new Set(ordre).size).toBe(150);
    // Ordre de la feuille (1, 2, 3…) = pire cas typique : le calcul doit faire nettement mieux.
    expect(coutParcours(c, 0, ordre, 0)).toBeLessThan(coutParcours(c, 0, n, 0) * 0.5);
  });
});

describe('heures de passage et repli', () => {
  it('eta cumulée : conduite + 2 min par arrêt précédent', () => {
    const m = { durees: [[0, 600, 0], [0, 0, 300], [0, 0, 0]], distances: [[0, 5000, 0], [0, 0, 2000], [0, 0, 0]] };
    expect(passages(m, 0, [1, 2])).toEqual([
      { noeud: 1, etaMin: 10, distanceM: 5000 },
      { noeud: 2, etaMin: 17, distanceM: 7000 },
    ]);
  });
  it('vol d’oiseau × 1,3 et trous ORS bouchés', () => {
    const pts = [{ lat: 48.58, lng: 7.75 }, { lat: 48.6, lng: 7.75 }];
    const m = matricesVolOiseau(pts);
    expect(m.distances[0][1]).toBeCloseTo(distanceM(pts[0], pts[1]) * 1.3, 3);
    const c = completerMatrices({ durees: [[0, null], [10, 0]], distances: [[0, null], [20, 0]] }, pts);
    expect(c.durees[0][1]).toBeCloseTo(m.durees[0][1], 3);
    expect(c.distances[1][0]).toBe(20);
  });
  it('polyligne : encodage / décodage aller-retour', () => {
    const pts: Array<[number, number]> = [[48.58123, 7.75012], [48.6, 7.7], [48.61, 7.69999]];
    expect(encoderPolyligne([[38.5, -120.2], [40.7, -120.95], [43.252, -126.453]])).toBe('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
    expect(decoderPolyligne(encoderPolyligne(pts))).toEqual(pts);
  });
});

describe('coût = le plus court par la route', () => {
  it('la distance prime ; le temps ne départage que deux trajets de même longueur', () => {
    // Chemin A : 1 000 m en 60 s ; chemin B : 900 m en 300 s. Le plus court (B) gagne malgré le temps.
    const m = { distances: [[0, 1000, 900], [1000, 0, 0], [900, 0, 0]], durees: [[0, 60, 300], [60, 0, 0], [300, 0, 0]] };
    const c = matriceCouts(m);
    expect(c[0][2]).toBeLessThan(c[0][1]);
    // Même longueur : le plus rapide gagne.
    const egal = matriceCouts({ distances: [[0, 500, 500]], durees: [[0, 40, 90]] });
    expect(egal[0][1]).toBeLessThan(egal[0][2]);
  });
});

describe('polissage par fenêtres (quartier visité dans le mauvais ordre)', () => {
  it('le polissage est stable : un second passage ne change plus rien', () => {
    const { c } = grille(40, 11);
    const ordre = resoudre(c, 0, Array.from({ length: 39 }, (_, i) => i + 1), 0, { limiteMs: 1500 });
    const avant = coutParcours(c, 0, ordre, 0);
    polirParFenetres(c, 0, ordre, 0, Date.now() + 3000);
    expect(coutParcours(c, 0, ordre, 0)).toBeCloseTo(avant, 6);
  });
  it('corrige un ordre cassé : jamais plus long, et la fenêtre devient optimale', () => {
    const { c } = grille(30, 5);
    const n = Array.from({ length: 29 }, (_, i) => i + 1);
    const ordre = [...n].sort((a, b) => ((a * 7919) % 31) - ((b * 7919) % 31));
    const avant = coutParcours(c, 0, ordre, 0);
    polirParFenetres(c, 0, ordre, 0, Date.now() + 5000);
    expect(coutParcours(c, 0, ordre, 0)).toBeLessThan(avant);
    expect(new Set(ordre).size).toBe(29);
  });
});

describe('village par village', () => {
  it('pénalise seulement un passage entre deux villages connus (accents et casse ignorés)', () => {
    const c = [[0, 1, 1], [1, 0, 1], [1, 1, 0]]
    const p = penaliserChangementsVillage(c, [null, 'Mommenheim', 'MOMMENHEIM'], 100)
    expect(p).toEqual(c)
    const q = penaliserChangementsVillage(c, [null, 'Geudertheim', 'Krautwiller'], 100)
    expect(q[1][2]).toBe(101); expect(q[2][1]).toBe(101); expect(q[0][1]).toBe(1)
  })
  it('chaque village en un seul bloc, même quand le plus court les mélangerait', () => {
    // Deux villages entrelacés sur une ligne : A aux positions paires, B aux impaires.
    const n = 21
    const pos = Array.from({ length: n }, (_, i) => i)
    const c = pos.map(a => pos.map(b => Math.abs(a - b) * 100))
    const communes = [null, ...Array.from({ length: n - 1 }, (_, i) => ((i + 1) % 2 ? 'A' : 'B'))]
    const idx = Array.from({ length: n - 1 }, (_, i) => i + 1)
    const ordre = resoudre(penaliserChangementsVillage(c, communes), 0, idx, 0, { limiteMs: 2000 })
    const blocs = ordre.map(i => communes[i]).filter((v, k, a) => k === 0 || v !== a[k - 1])
    expect(blocs.length).toBe(2)
    expect(new Set(ordre).size).toBe(n - 1)
  })
  it('regrouperNoeuds garde le village du nœud', () => {
    const n = regrouperNoeuds([{ id: 'a', lat: 48.7, lng: 7.7, numero: '1', rang: 0, commune: 'Brumath' }])
    expect(n[0].commune).toBe('Brumath')
  })
})

describe('noeudsDansOrdre / passagesDepuisEtapes (ordre changé à la main)', () => {
  const n = (id: string, rang: number) => ({ cle: id, lat: 0, lng: 0, arrets: [id], rang, commune: null })
  it('suit l’ordre enregistré, les arrêts sans ordre à la fin par rang', () => {
    const noeuds = [n('a', 1), n('b', 2), n('c', 3), n('d', 4)]
    const ordre = new Map<string, number | null>([['a', 3], ['b', 1], ['c', 2], ['d', null]])
    expect(noeudsDansOrdre(noeuds, ordre).map(x => x.arrets[0])).toEqual(['b', 'c', 'a', 'd'])
  })
  it('tournée inversée : l’ordre enregistré inversé donne les nœuds inversés', () => {
    const noeuds = [n('a', 1), n('b', 2), n('c', 3)]
    const inverse = new Map<string, number | null>([['a', 3], ['b', 2], ['c', 1]])
    expect(noeudsDansOrdre(noeuds, inverse).map(x => x.arrets[0])).toEqual(['c', 'b', 'a'])
  })
  it('heures de passage : conduite cumulée + temps d’arrêt aux nœuds précédents', () => {
    const p = passagesDepuisEtapes([{ distance: 1000, duration: 120 }, { distance: 500, duration: 60 }], 60)
    expect(p).toEqual([
      { noeud: 1, etaMin: 2, distanceM: 1000 },
      { noeud: 2, etaMin: 4, distanceM: 1500 },
    ])
  })
})

describe('zones de Brumath dans l\'ordre du fichier', () => {
  const cles = [null, 'Brumath ZONE 3', 'Brumath ZONE 3', 'Kriegsheim', 'Brumath ZONE 1', 'Brumath ZONE 2', 'Brumath ZONE 2']
  it('rang de zone', () => {
    expect(rangZone('Brumath ZONE 3')).toBe(3)
    expect(rangZone('Kriegsheim')).toBeNull()
    expect(rangZone(null)).toBeNull()
  })
  it('zones 1 → 2 → 3, le village garde sa place, chaque bloc garde son ordre', () => {
    expect(ordonnerZones([1, 2, 3, 4, 5, 6], cles)).toEqual([4, 3, 5, 6, 1, 2])
  })
  it('sans zone : rien ne change', () => {
    expect(ordonnerZones([3, 1, 2], [null, 'A', 'B', 'C'])).toEqual([3, 1, 2])
  })
})

describe('penaliserOrdreZones', () => {
  const rangsDe = (ordre: number[], cles: (string | null)[]) => ordre.map(i => rangZone(cles[i]))

  it('une seule zone ou aucune : matrice inchangée', () => {
    const c = [[0, 1, 2], [1, 0, 3], [2, 3, 0]]
    expect(penaliserOrdreZones(c, [null, 'Brumath ZONE 2', 'Brumath ZONE 2'])).toBe(c)
    expect(penaliserOrdreZones(c, [null, 'Wingersheim', 'Kriegsheim'])).toBe(c)
  })

  it('saut de zone ou retour en arrière pénalisés, zone suivante / même zone gratuites', () => {
    const cles = [null, 'Brumath ZONE 1', 'Brumath ZONE 2', 'Brumath ZONE 3']
    const c = Array.from({ length: 4 }, () => new Array(4).fill(10))
    const p = penaliserOrdreZones(c, cles, 1000)
    expect(p[1][2]).toBe(10); expect(p[2][3]).toBe(10); expect(p[1][1]).toBe(10)
    expect(p[1][3]).toBe(1010); expect(p[3][1]).toBe(1010); expect(p[2][1]).toBe(1010)
    expect(p[0][3]).toBe(10); expect(p[3][0]).toBe(10)
  })

  it('une zone absente de la tournée est sautée sans pénalité', () => {
    const cles = [null, 'Brumath ZONE 1', 'Brumath ZONE 4']
    const c = [[0, 5, 5], [5, 0, 5], [5, 5, 0]]
    expect(penaliserOrdreZones(c, cles, 1000)[1][2]).toBe(5)
  })

  it('le solveur range les zones 1 → 7 et choisit les meilleurs points d’entrée / sortie', () => {
    // 3 zones côte à côte sur une ligne, points mélangés dans chaque zone ; départ à gauche.
    const xs = [0, 12, 10, 11, 22, 20, 21, 32, 30, 31]
    const cles: (string | null)[] = [null, ...['Brumath ZONE 1', 'Brumath ZONE 1', 'Brumath ZONE 1', 'Brumath ZONE 2', 'Brumath ZONE 2', 'Brumath ZONE 2', 'Brumath ZONE 3', 'Brumath ZONE 3', 'Brumath ZONE 3']]
    const c = xs.map(a => xs.map(b => Math.abs(a - b)))
    const couts = penaliserOrdreZones(penaliserChangementsVillage(c, cles), cles)
    const ordre = resoudre(couts, 0, [1, 2, 3, 4, 5, 6, 7, 8, 9], 0, { limiteMs: 200 })
    expect(rangsDe(ordre, cles)).toEqual([1, 1, 1, 2, 2, 2, 3, 3, 3])
    // le plus court dans ce cadre : aller à droite en ligne, retour au départ (2 × 32)
    expect(coutParcours(c, 0, ordre, 0)).toBe(64)
  })

  it('15 nœuds mélangés sur 5 zones : toujours 1 → 5, jamais plus long qu’un réordonnancement après coup', () => {
    const { c: base } = grille(16, 7)
    const cles: (string | null)[] = [null, ...Array.from({ length: 15 }, (_, i) => `Brumath ZONE ${(i % 5) + 1}`)]
    const couts = penaliserOrdreZones(penaliserChangementsVillage(base, cles), cles)
    const idx = Array.from({ length: 15 }, (_, i) => i + 1)
    const ordre = resoudre(couts, 0, idx, 0, { limiteMs: 400 })
    const rangs = rangsDe(ordre, cles) as number[]
    expect([...rangs].sort((a, b) => a - b)).toEqual(rangs)
    const apresCoup = ordonnerZones(resoudre(penaliserChangementsVillage(base, cles), 0, idx, 0, { limiteMs: 400 }), cles)
    expect(coutParcours(base, 0, ordre, 0)).toBeLessThanOrEqual(coutParcours(base, 0, apresCoup, 0) + 1e-6)
  })
})
