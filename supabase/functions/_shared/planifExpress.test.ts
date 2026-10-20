import { describe, it, expect } from 'vitest';
import { construireProbleme, lireRoute, coursesNonPlacees, dureeRouteMin, type CourseAOptimiser } from './vroom.ts';
import { planifier, pointsDuProbleme, type ProblemeVroom, type ResultatPlanification } from './planifExpress.ts';
import type { Matrices } from './tourneeRoute.ts';

const DEPOT = { lat: 48.5, lng: 7.7 };
const VITESSE = 10; // m/s

/** Matrices euclidiennes (1 degré = 100 km) : distances et durées cohérentes, symétriques. */
function matrices(pb: ProblemeVroom): Matrices {
  const { points } = pointsDuProbleme(pb);
  const d = points.map(a => points.map(b => Math.hypot((a.lat - b.lat) * 111_000, (a.lng - b.lng) * 73_000)));
  return { distances: d, durees: d.map(l => l.map(x => x / VITESSE)) };
}

const course = (id: string, dx: number, dy: number, p: Partial<CourseAOptimiser> = {}): CourseAOptimiser =>
  ({ id, delivery_lat: DEPOT.lat + dy, delivery_lng: DEPOT.lng + dx, retrait: null, ...p });

function resoudre(courses: CourseAOptimiser[], nbVeh = 1, cap = 99, depart = 8 * 3600) {
  const pb = construireProbleme(courses, Array.from({ length: nbVeh }, (_, i) => ({ ref: i + 1 })),
    { depot: DEPOT, departSec: depart, capacite: cap });
  const res = planifier(pb as ProblemeVroom, matrices(pb as ProblemeVroom), { budgetMs: 400 });
  return { pb, res };
}

const idsRoute = (r: ResultatPlanification, v: number, pb: ReturnType<typeof construireProbleme>) =>
  lireRoute(r.routes.find(x => x.vehicle === v)?.steps ?? [], pb.refs).map(p => p.courseId);

describe('planifier', () => {
  it('toutes les courses placées, chacune une seule fois, route cohérente', () => {
    const cs = ['a', 'b', 'c', 'd', 'e'].map((id, i) => course(id, 0.01 * (i + 1), 0.02 * ((i * 3) % 5)));
    const { pb, res } = resoudre(cs);
    expect(res.unassigned).toEqual([]);
    const ids = idsRoute(res, 1, pb);
    expect([...ids].sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
    const r = res.routes[0];
    expect(r.steps[0]).toMatchObject({ type: 'start', arrival: 8 * 3600 });
    expect(r.service).toBe(5 * 300);
    expect(dureeRouteMin(r)).toBeGreaterThan(0);
  });

  it('optimal sur une petite instance (comparé à toutes les permutations)', () => {
    const pts: Array<[number, number]> = [[0.03, 0.01], [-0.02, 0.04], [0.05, -0.03], [-0.04, -0.02], [0.01, 0.06], [0.06, 0.05], [-0.05, 0.03]];
    const cs = pts.map(([x, y], i) => course(`c${i}`, x, y));
    const { pb, res } = resoudre(cs);
    const m = matrices(pb as ProblemeVroom);
    const cout = (ordre: number[]) => {
      let prev = 0; let dist = 0; let dur = 0;
      for (const n of ordre) { dist += m.distances[prev][n]; dur += m.durees[prev][n]; prev = n; }
      dist += m.distances[prev][0]; dur += m.durees[prev][0];
      return dist + 0.05 * dur;
    };
    const permutations = (a: number[]): number[][] => (a.length <= 1 ? [a] : a.flatMap((x, i) => permutations([...a.slice(0, i), ...a.slice(i + 1)]).map(p => [x, ...p])));
    const optimal = Math.min(...permutations(pts.map((_, i) => i + 1)).map(cout));
    const r = res.routes[0];
    expect(r.distance + 0.05 * r.duration).toBeLessThanOrEqual(optimal * 1.0001);
  });

  it('retrait avant livraison, dans le même véhicule', () => {
    const cs = [
      course('x', 0.05, 0.05, { retrait: { lat: DEPOT.lat - 0.03, lng: DEPOT.lng - 0.03 } }),
      course('y', 0.02, 0.01),
      course('z', -0.03, 0.02, { retrait: { lat: DEPOT.lat + 0.04, lng: DEPOT.lng } }),
    ];
    const { pb, res } = resoudre(cs, 2, 2);
    expect(res.unassigned).toEqual([]);
    for (const r of res.routes) {
      const types = r.steps.filter(s => s.id != null);
      for (const c of ['x', 'z']) {
        const idR = [...pb.refs.entries()].find(([, v]) => v.courseId === c && v.type === 'retrait')?.[0];
        const idL = [...pb.refs.entries()].find(([, v]) => v.courseId === c && v.type === 'livraison')?.[0];
        const iR = types.findIndex(s => s.id === idR); const iL = types.findIndex(s => s.id === idL);
        if (iR >= 0 || iL >= 0) { expect(iR).toBeGreaterThanOrEqual(0); expect(iL).toBeGreaterThan(iR); }
      }
    }
  });

  it('créneau : attente comptée, jamais d arrivée hors fenêtre', () => {
    const cs = [
      course('tot', 0.01, 0.01),
      course('tard', 0.02, 0.0, { creneau_livraison_debut: '14:00:00', creneau_livraison_fin: '15:00:00' }),
    ];
    const { pb, res } = resoudre(cs);
    expect(res.unassigned).toEqual([]);
    const tard = lireRoute(res.routes[0].steps, pb.refs).find(p => p.courseId === 'tard')!;
    expect(tard.arrival_time! >= '14:00:00' && tard.arrival_time! <= '15:00:00').toBe(true);
    expect(res.routes[0].waiting_time).toBeGreaterThan(0);
  });

  it('créneau impossible : course non placée, les autres restent placées', () => {
    const cs = [
      course('ok', 0.01, 0.01),
      course('jamais', 0.02, 0.0, { creneau_livraison_debut: '06:00', creneau_livraison_fin: '07:00' }), // départ à 8 h
    ];
    const { pb, res } = resoudre(cs);
    expect(coursesNonPlacees(res.unassigned, pb.refs)).toEqual(['jamais']);
    expect(idsRoute(res, 1, pb)).toEqual(['ok']);
  });

  it('capacité : au plus `cap` courses par véhicule, partage équilibré', () => {
    const cs = Array.from({ length: 6 }, (_, i) => course(`c${i}`, 0.01 * (i + 1), 0.01 * (6 - i)));
    const { pb, res } = resoudre(cs, 2, 3);
    expect(res.unassigned).toEqual([]);
    expect(idsRoute(res, 1, pb)).toHaveLength(3);
    expect(idsRoute(res, 2, pb)).toHaveLength(3);
  });

  it('trop de courses pour la capacité : l urgente est servie, pas une autre', () => {
    const cs = [course('a', 0.01, 0), course('b', 0.02, 0), course('urgente', 0.3, 0.3, { urgent: true })];
    const { pb, res } = resoudre(cs, 1, 2);
    const placees = idsRoute(res, 1, pb);
    expect(placees).toContain('urgente');
    expect(placees).toHaveLength(2);
    expect(coursesNonPlacees(res.unassigned, pb.refs)).toHaveLength(1);
  });

  it('fin de journée dépassée : course non placée', () => {
    const { pb, res } = resoudre([course('loin', 1.2, 0), course('pres', 0.01, 0)], 1, 99, 20 * 3600);
    expect(coursesNonPlacees(res.unassigned, pb.refs)).toEqual(['loin']);
  });

  it('déterministe', () => {
    const cs = Array.from({ length: 12 }, (_, i) => course(`c${i}`, 0.02 * ((i * 7) % 11) - 0.1, 0.02 * ((i * 5) % 9) - 0.08));
    const a = resoudre(cs, 2, 6); const b = resoudre(cs, 2, 6);
    expect(a.res.routes.map(r => r.steps.map(s => s.id))).toEqual(b.res.routes.map(r => r.steps.map(s => s.id)));
  });

  it('plus de véhicules que de courses : les véhicules vides sont omis', () => {
    const { res } = resoudre([course('a', 0.01, 0.01)], 3, 1);
    expect(res.routes).toHaveLength(1);
  });

  it('50 courses, 4 véhicules : bien sous la seconde de calcul utile, tout placé', () => {
    const cs = Array.from({ length: 50 }, (_, i) => course(`c${i}`, 0.05 * Math.sin(i * 1.7), 0.05 * Math.cos(i * 2.3)));
    const t0 = Date.now();
    const { res } = resoudre(cs, 4, 13);
    expect(res.unassigned).toEqual([]);
    expect(res.routes.reduce((n, r) => n + r.steps.filter(s => s.id != null).length, 0)).toBe(50);
    expect(Date.now() - t0).toBeLessThan(3000);
  });
});
