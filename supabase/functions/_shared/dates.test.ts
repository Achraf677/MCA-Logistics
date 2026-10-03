import { describe, it, expect } from 'vitest';
import { jourParis, anneeParis, jourParisDe, horodatageDuJour } from './dates.ts';

describe('dates Paris (U5)', () => {
  it('entre 0 h et 2 h à Paris : le jour de Paris, pas la veille UTC', () => {
    expect(jourParis(new Date('2026-10-02T23:30:00Z'))).toBe('2026-10-03'); // 1 h 30 à Paris (été)
    expect(jourParis(new Date('2026-12-31T23:30:00Z'))).toBe('2027-01-01'); // 0 h 30 (hiver)
    expect(jourParis(new Date('2026-10-03T10:00:00Z'))).toBe('2026-10-03');
  });
  it('année civile à Paris', () => {
    expect(anneeParis(new Date('2026-12-31T23:30:00Z'))).toBe(2027);
    expect(anneeParis(new Date('2026-12-31T22:30:00Z'))).toBe(2026);
  });
  it('jour d’un horodatage stocké', () => {
    expect(jourParisDe('2026-10-02T23:15:00.000Z')).toBe('2026-10-03');
    expect(jourParisDe('2026-10-02')).toBe('2026-10-02');
    expect(jourParisDe(null)).toBeNull();
    expect(jourParisDe('n’importe quoi')).toBeNull();
  });
  it('un jour sans heure reste le même jour à Paris, été comme hiver', () => {
    expect(jourParisDe(horodatageDuJour('2026-07-15'))).toBe('2026-07-15');
    expect(jourParisDe(horodatageDuJour('2026-01-15'))).toBe('2026-01-15');
  });
});
