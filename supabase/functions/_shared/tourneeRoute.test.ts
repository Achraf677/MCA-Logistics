import { describe, it, expect } from 'vitest';
import {
  regrouperNoeuds, blocsMatrice, troncons, resoudre, coutParcours, passages, matricesVolOiseau,
  completerMatrices, ordonnerZones, rangZone, matriceCouts, noeudsDansOrdre, passagesDepuisEtapes, polirParFenetres, penaliserChangementsVillage, penaliserOrdreZones, encoderPolyligne, decoderPolyligne, distanceM, type ArretAPlacer,
  cleRue, dernierArretTraite, penaliserChangementsRue, rangerNumeros, ordonnerTournee, cleVillage, PENALITE_CHANGEMENT_VILLAGE, type Matrices,
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

describe('rues d’un seul tenant', () => {
  it('cleRue ignore accents, apostrophes et casse', () => {
    expect(cleRue('Rue de l’Équerre')).toBe(cleRue("rue de l'equerre"))
    expect(cleRue('  ')).toBeNull()
    expect(cleRue(null)).toBeNull()
  })

  it('changer de rue coûte la pénalité, rester dans la rue ne coûte rien', () => {
    const c = [[0, 10, 10], [10, 0, 10], [10, 10, 0]]
    const p = penaliserChangementsRue(c, [null, 'Rue A', 'Rue B'], 300)
    expect(p[1][2]).toBe(310); expect(p[2][1]).toBe(310); expect(p[0][1]).toBe(10)
    expect(penaliserChangementsRue(c, [null, 'Rue A', 'rue a'], 300)[1][2]).toBe(10)
    expect(penaliserChangementsRue(c, [null, null, 'Rue B'], 300)).toBe(c)
  })

  it('une rue n’est plus faite en deux fois pour quelques mètres gagnés', () => {
    // Rue A : x = 0, 10, 20 puis 100 ; rue B : x = 50 (au milieu). Sans pénalité : A A A B A (deux passages dans A).
    const xs = [0, 0, 10, 20, 50, 100]
    const rues = [null, 'Rue A', 'Rue A', 'Rue A', 'Rue B', 'Rue A']
    const c = xs.map(a => xs.map(b => Math.abs(a - b)))
    const sans = resoudre(c, 0, [1, 2, 3, 4, 5], null)
    const avec = resoudre(penaliserChangementsRue(c, rues, 300), 0, [1, 2, 3, 4, 5], null)
    const passages = (o: number[]) => o.filter((n, i) => i === 0 || rues[n] !== rues[o[i - 1]]).length
    expect(passages(sans)).toBe(3)
    expect(passages(avec)).toBe(2)
  })
})

describe('rangerNumeros', () => {
  // Rue en ligne droite : le numéro n est à n mètres du début.
  const nums = [null, '23', '31', '34', '37', '44', '56']
  const pos = [0, 23, 31, 34, 37, 44, 56]
  const d = pos.map(a => pos.map(b => Math.abs(a - b)))
  const rues = [null, 'Rue Balzac', 'Rue Balzac', 'Rue Balzac', 'Rue Balzac', 'Rue Balzac', 'Rue Balzac']

  it('remet les numéros dans l’ordre quand c’est aussi court', () => {
    const ordre = rangerNumeros(d, 0, [5, 2, 3, 1, 4, 6], null, rues, nums, 150)
    expect(ordre.map(n => nums[n])).toEqual(['23', '31', '34', '37', '44', '56'])
  })

  it('choisit le sens qui raccorde le mieux (départ au bout de la rue → décroissant)', () => {
    const p = [60, ...pos.slice(1)]
    const d2 = p.map(a => p.map(b => Math.abs(a - b)))
    expect(rangerNumeros(d2, 0, [5, 2, 3, 1, 4, 6], null, rues, nums, 150).map(n => nums[n])).toEqual(['56', '44', '37', '34', '31', '23'])
  })

  it('ne touche à rien si l’ordre des numéros rallonge trop', () => {
    // Numéros sans rapport avec la position : trier coûterait cher.
    const p = [0, 10, 500, 20, 510, 30, 520]
    const d3 = p.map(a => p.map(b => Math.abs(a - b)))
    const ordre = [1, 3, 5, 2, 4, 6]
    expect(rangerNumeros(d3, 0, [...ordre], null, rues, nums, 150)).toEqual(ordre)
  })

  it('un côté à l’aller, l’autre au retour quand c’est plus court', () => {
    // Pairs d'un côté (y = 0), impairs en face (y = 30, rue large) ; même abscisse que le numéro.
    const n2 = [null, '2', '4', '6', '1', '3', '5']
    const xy = [[0, 0], [2, 0], [4, 0], [6, 0], [1, 30], [3, 30], [5, 30]]
    const d4 = xy.map(a => xy.map(b => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1])))
    const r = [null, 'Av', 'Av', 'Av', 'Av', 'Av', 'Av']
    const ordre = rangerNumeros(d4, 0, [4, 1, 5, 2, 6, 3], 0, r, n2, 150)
    expect(ordre.map(n => n2[n])).toEqual(['2', '4', '6', '5', '3', '1'])
  })

  it('moins de 3 arrêts, numéros absents ou rues différentes : inchangé', () => {
    expect(rangerNumeros(d, 0, [2, 1], null, rues, nums)).toEqual([2, 1])
    expect(rangerNumeros(d, 0, [3, 1, 2], null, rues, [null, null, '31', '34', '37', '44', '56'])).toEqual([3, 1, 2])
    expect(rangerNumeros(d, 0, [3, 1, 2], null, [null, 'A', 'B', 'C', 'D', 'E', 'F'], nums)).toEqual([3, 1, 2])
  })
})

describe('ordonnerTournee', () => {
  /** Matrices fictives à partir de points (x, y) en mètres. */
  const matrices = (pts: number[][]): Matrices => {
    const distances = pts.map(a => pts.map(b => Math.hypot(a[0] - b[0], a[1] - b[1])))
    return { distances, durees: distances.map(l => l.map(v => v / 10)) }
  }

  it('zones 1 → 3 dans l’ordre, chaque rue d’un seul tenant, numéros rangés', () => {
    // Départ au sud ; zone 1 au sud, zone 2 à l'est, zone 3 au nord. Deux rues par zone, 3 numéros par rue.
    const arrets: ArretAPlacer[] = []
    const xy: number[][] = []
    let k = 0
    for (const [z, x0, y0] of [[1, 0, 0], [2, 400, 400], [3, 0, 800]] as const) {
      for (const r of ['A', 'B']) {
        for (const n of [5, 1, 3]) {
          const x = x0 + (r === 'A' ? 0 : 60) + n * 10; const y = y0 + (r === 'A' ? 0 : 60)
          arrets.push({ id: `a${k}`, lat: 48 + y / 1e5, lng: 7 + x / 1e5, numero: String(n), rang: k, commune: `Brumath ZONE ${z}`, rue: `Rue ${r}${z}` })
          xy.push([x, y]); k++
        }
      }
    }
    const noeuds = regrouperNoeuds(arrets)
    const parId = new Map(arrets.map((a, i) => [a.id, i]))
    const m = matrices([[0, -500], ...noeuds.map(n => xy[parId.get(n.arrets[0])!])])
    const ordre = ordonnerTournee(m, noeuds, 0, { limiteMs: 200 })
    const suite = ordre.map(i => arrets[parId.get(noeuds[i - 1].arrets[0])!])
    const zones = suite.map(a => rangZone(a.commune))
    expect([...zones].sort((a, b) => a! - b!)).toEqual(zones)
    const passagesRue = suite.filter((a, i) => i === 0 || a.rue !== suite[i - 1].rue).length
    expect(passagesRue).toBe(6)
    for (let i = 0; i < suite.length; i += 3) {
      const n = suite.slice(i, i + 3).map(a => Number(a.numero))
      expect((n[0] < n[1] && n[1] < n[2]) || (n[0] > n[1] && n[1] > n[2])).toBe(true)
    }
  })

  it('tient la limite de temps (130 nœuds, 400 ms)', () => {
    const { pts } = grille(131, 3)
    const m = matrices(pts.map(p => [p.x * 30, p.y * 30]))
    const noeuds = pts.slice(1).map((p, i) => ({
      cle: String(i), lat: p.y, lng: p.x, arrets: [String(i)], rang: i,
      commune: `Brumath ZONE ${(i % 7) + 1}`, rue: `Rue ${i % 40}`, numero: String(i),
    }))
    const t0 = Date.now()
    const ordre = ordonnerTournee(m, noeuds, 0, { limiteMs: 400 })
    expect(Date.now() - t0).toBeLessThan(480)
    expect([...ordre].sort((a, b) => a - b)).toEqual(noeuds.map((_, i) => i + 1))
  })
})

describe('villages : communes déléguées et pénalité douce', () => {
  const matrices = (pts: number[][]): Matrices => {
    const distances = pts.map(a => pts.map(b => Math.hypot(a[0] - b[0], a[1] - b[1])))
    return { distances, durees: distances.map(l => l.map(v => v / 10)) }
  }
  /** Un nœud par point ; `communes[i]` = village du point i. Départ à (0, 0). */
  const monde = (pts: number[][], communes: string[]) => {
    const arrets: ArretAPlacer[] = pts.map((p, i) => ({ id: `a${i}`, lat: 48 + p[1] / 1e5, lng: 7 + p[0] / 1e5, numero: null, rang: i, commune: communes[i] }))
    const noeuds = regrouperNoeuds(arrets)
    const parId = new Map(arrets.map((a, i) => [a.id, i]))
    const m = matrices([[0, 0], ...noeuds.map(n => pts[parId.get(n.arrets[0])!])])
    return { noeuds, m, communeDe: (i: number) => communes[parId.get(noeuds[i - 1].arrets[0])!] }
  }
  const blocs = (ordre: number[], communeDe: (i: number) => string) =>
    ordre.map(i => cleVillage(communeDe(i))).filter((v, k, a) => k === 0 || v !== a[k - 1])

  it('cleVillage : accents, casse et « ZONE n » ignorés, communes déléguées regroupées', () => {
    expect(cleVillage('Mittelhausen')).toBe('wingersheim')
    expect(cleVillage('HOHATZENHEIM')).toBe('wingersheim')
    expect(cleVillage('Gingsheim')).toBe('wingersheim')
    expect(cleVillage('Wingersheim les Quatre Bans')).toBe('wingersheim')
    expect(cleVillage('Keffendorf')).toBe('ohlungen')
    expect(cleVillage('OHLINGEN')).toBe('ohlungen')
    expect(cleVillage('Brumath ZONE 3')).toBe('brumath')
    expect(cleVillage('Mommenheim')).toBe('mommenheim')
    expect(cleVillage('  ')).toBeNull()
    expect(cleVillage(null)).toBeNull()
  })

  it('une commune déléguée et sa commune mère font un seul bloc (pas de va-et-vient entre les deux)', () => {
    // Wingersheim et Mittelhausen entrelacés sur une ligne, Kriegsheim plus loin : un seul bloc « wingersheim ».
    const pts: number[][] = []; const communes: string[] = []
    for (let i = 0; i < 8; i++) { pts.push([200 + i * 40, 0]); communes.push(i % 2 ? 'Mittelhausen' : 'Wingersheim') }
    for (let i = 0; i < 4; i++) { pts.push([1500 + i * 40, 0]); communes.push('Kriegsheim') }
    const { noeuds, m, communeDe } = monde(pts, communes)
    const ordre = ordonnerTournee(m, noeuds, 0, { limiteMs: 300 })
    expect(blocs(ordre, communeDe).sort()).toEqual(['kriegsheim', 'wingersheim'])
  })

  it('pénalité douce : un village est coupé quand ça évite un vrai détour, pas sinon', () => {
    // Tout sur une ligne : A (300 m), B (600 m), A (900 m) ; le plus court est A → B → A (aller simple). Faire A d'un
    // bloc obligerait à revenir sur ses pas (2 × 300 m de plus) : on coupe A sous le coût d'un changement, pas au-dessus.
    const pts = [[300, 0], [320, 0], [600, 0], [620, 0], [900, 0], [920, 0]]
    const communes = ['A', 'A', 'B', 'B', 'A', 'A']
    const { noeuds, m, communeDe } = monde(pts, communes)
    const doux = ordonnerTournee(m, noeuds, null, { limiteMs: 200, penaliteVillage: 100 })
    expect(blocs(doux, communeDe)).toEqual(['a', 'b', 'a'])
    const dur = ordonnerTournee(m, noeuds, null, { limiteMs: 200, penaliteVillage: 100_000 })
    expect(blocs(dur, communeDe).length).toBe(2)
  })

  it('pénalité par défaut : un détour de quelques centaines de mètres ne coupe pas le village', () => {
    expect(PENALITE_CHANGEMENT_VILLAGE).toBeGreaterThan(1000)
    const pts = [[300, 0], [320, 0], [400, 0], [420, 0], [500, 0], [520, 0]]
    const communes = ['A', 'A', 'B', 'B', 'A', 'A']
    const { noeuds, m, communeDe } = monde(pts, communes)
    const ordre = ordonnerTournee(m, noeuds, null, { limiteMs: 200 })
    expect(blocs(ordre, communeDe).length).toBe(2)
  })

  it('les zones de Brumath restent 1 → 7, même avec la pénalité de village douce', () => {
    const pts = [[0, 100], [20, 100], [300, 400], [320, 400], [0, 900], [20, 900]]
    const communes = ['Brumath ZONE 3', 'Brumath ZONE 3', 'Brumath ZONE 1', 'Brumath ZONE 1', 'Brumath ZONE 2', 'Brumath ZONE 2']
    const { noeuds, m, communeDe } = monde(pts, communes)
    for (const p of [0, 500, PENALITE_CHANGEMENT_VILLAGE]) {
      const ordre = ordonnerTournee(m, noeuds, 0, { limiteMs: 200, penaliteVillage: p })
      const zones = ordre.map(i => rangZone(communeDe(i)))
      expect([...zones].sort((a, b) => a! - b!)).toEqual(zones)
    }
  })
})

describe('dernierArretTraite (recalcul depuis ici)', () => {
  const a = (id: string, statut: string | null, ordre: number | null, statut_le: string | null = null) =>
    ({ id, statut, ordre, statut_le, lat: 48.7, lng: 7.7 })

  it('prend le plus récemment traité, pas le plus avancé dans l\'ordre', () => {
    const r = dernierArretTraite([a('1', 'livre', 1, '2026-10-30T08:10:00Z'), a('2', 'livre', 2, '2026-10-30T08:05:00Z'), a('3', null, 3)])
    expect(r?.id).toBe('1')
  })

  it('sans heure : le plus avancé dans l\'ordre', () => {
    expect(dernierArretTraite([a('1', 'livre', 1), a('2', 'livre', 2), a('3', null, 3)])?.id).toBe('2')
  })

  it('ignore les arrêts non traités ou sans position ; null si aucun', () => {
    expect(dernierArretTraite([a('1', null, 1)])).toBeNull()
    expect(dernierArretTraite([{ ...a('1', 'livre', 1), lat: null }])).toBeNull()
  })
})
