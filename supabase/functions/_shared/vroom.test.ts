import { describe, it, expect } from 'vitest';
import {
  heureEnSecondes, secondesEnHeure, fenetre, construireProbleme, lireRoute,
  coursesNonPlacees, dureeRouteMin, TEMPS_ARRET_SEC, FIN_JOURNEE_SEC,
} from './vroom.ts';

const base = { delivery_lat: 48.5, delivery_lng: 7.7, retrait: null };

describe('heures', () => {
  it('lit HH:MM et HH:MM:SS, refuse le reste', () => {
    expect(heureEnSecondes('08:00')).toBe(8 * 3600);
    expect(heureEnSecondes('13:30:15')).toBe(13 * 3600 + 30 * 60 + 15);
    expect(heureEnSecondes('24:00')).toBeNull();
    expect(heureEnSecondes('8h')).toBeNull();
    expect(heureEnSecondes(null)).toBeNull();
  });
  it('rend HH:MM:SS, plafonné à la journée', () => {
    expect(secondesEnHeure(8 * 3600 + 65)).toBe('08:01:05');
    expect(secondesEnHeure(30 * 3600)).toBe('23:59:59');
  });
});

describe('fenetre', () => {
  it('créneau complet, début seul, fin seule', () => {
    expect(fenetre('09:00:00', '12:00:00')).toEqual([[9 * 3600, 12 * 3600]]);
    expect(fenetre('14:00', null)).toEqual([[14 * 3600, FIN_JOURNEE_SEC]]);
    expect(fenetre(null, '10:00')).toEqual([[0, 10 * 3600]]);
  });
  it('rien ou incohérent : pas de fenêtre', () => {
    expect(fenetre(null, null)).toBeUndefined();
    expect(fenetre('12:00', '09:00')).toBeUndefined();
  });
});

describe('construireProbleme', () => {
  const depot = { lat: 48.53, lng: 7.71 };
  it('livraison simple : 5 min d arrêt, créneau, urgence ; véhicule partant à l heure choisie', () => {
    const p = construireProbleme(
      [{ ...base, id: 'a', urgent: true, creneau_livraison_debut: '10:00:00', creneau_livraison_fin: '11:00:00' }],
      [{ ref: 1 }],
      { depot, departSec: 7 * 3600, capacite: 3 },
    );
    expect(p.shipments).toEqual([]);
    expect(p.jobs).toEqual([{
      id: 1, location: [7.7, 48.5], service: TEMPS_ARRET_SEC,
      time_windows: [[10 * 3600, 11 * 3600]], amount: [1], priority: 100,
    }]);
    expect(p.vehicles[0]).toMatchObject({
      id: 1, start: [7.71, 48.53], end: [7.71, 48.53], capacity: [3], time_window: [7 * 3600, FIN_JOURNEE_SEC],
    });
    expect(p.refs.get(1)).toEqual({ courseId: 'a', type: 'livraison' });
  });
  it('retrait localisé : une paire retrait → livraison', () => {
    const p = construireProbleme(
      [{ ...base, id: 'x', retrait: { lat: 48.6, lng: 7.8 }, creneau_retrait_fin: '09:00' }],
      [{ ref: 1 }],
      { depot, departSec: 8 * 3600, capacite: 1 },
    );
    expect(p.jobs).toEqual([]);
    expect(p.shipments).toEqual([{
      amount: [1],
      pickup: { id: 1, location: [7.8, 48.6], service: TEMPS_ARRET_SEC, time_windows: [[0, 9 * 3600]] },
      delivery: { id: 2, location: [7.7, 48.5], service: TEMPS_ARRET_SEC },
    }]);
    expect(p.refs.get(1)).toEqual({ courseId: 'x', type: 'retrait' });
    expect(p.refs.get(2)).toEqual({ courseId: 'x', type: 'livraison' });
  });
});

describe('lireRoute', () => {
  const refs = new Map([
    [1, { courseId: 'A', type: 'retrait' as const }],
    [2, { courseId: 'A', type: 'livraison' as const }],
    [3, { courseId: 'B', type: 'retrait' as const }],
    [4, { courseId: 'B', type: 'livraison' as const }],
    [5, { courseId: 'C', type: 'livraison' as const }],
  ]);
  it('une seule séquence pour retraits et livraisons ; heure = arrivée à la livraison', () => {
    const steps = [
      { type: 'start', arrival: 28800 },
      { type: 'pickup', id: 1, arrival: 29400 },
      { type: 'pickup', id: 3, arrival: 30000 },
      { type: 'delivery', id: 2, arrival: 31000 },
      { type: 'job', id: 5, arrival: 32000 },
      { type: 'delivery', id: 4, arrival: 33000 },
      { type: 'end', arrival: 34000 },
    ];
    expect(lireRoute(steps, refs)).toEqual([
      { courseId: 'A', pickup_order: 1, stop_order: 3, arrival_time: '08:36:40' },
      { courseId: 'B', pickup_order: 2, stop_order: 5, arrival_time: '09:10:00' },
      // Sans retrait : pickup_order = stop_order (un retrait coché plus tard passe juste avant).
      { courseId: 'C', pickup_order: 4, stop_order: 4, arrival_time: '08:53:20' },
    ]);
  });
  it('non placées : une paire compte une fois', () => {
    expect(coursesNonPlacees([{ id: 1 }, { id: 2 }, { id: 5 }, { id: 99 }], refs)).toEqual(['A', 'C']);
  });
});

it('durée = conduite + arrêts + attente', () => {
  expect(dureeRouteMin({ duration: 3600, service: 900, waiting_time: 300 })).toBe(80);
  expect(dureeRouteMin({ duration: 1800 })).toBe(30);
});
