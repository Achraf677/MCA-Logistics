// Parité Edge ↔ front : le TTC déclaré payé chez Pennylane = le TTC dû à l'écran.
import { describe, it, expect } from 'vitest';
import { totalTtcCourseCts } from './totaux.ts';
import { deliveryTotalTtcCts } from '../../../src/shared/lib/money.ts';

const cas = [
  { amount_ht_cts: 10000, amount_ttc_cts: 12000, autoliquidation: false, extra_lines: [] },
  { amount_ht_cts: 10000, amount_ttc_cts: 12000, autoliquidation: false,
    extra_lines: [{ label: 'Attente', quantity: 2, amount_ht_cts: 1500, tva_rate: 20 },
      { label: 'Péage', quantity: 1, amount_ht_cts: 333, tva_rate: 5.5 }] },
  { amount_ht_cts: 10000, amount_ttc_cts: 10000, autoliquidation: true,
    extra_lines: [{ label: 'Hayon', quantity: 1, amount_ht_cts: 2000, tva_rate: 20 }] },
  { amount_ht_cts: 5000, amount_ttc_cts: 6000, autoliquidation: null,
    extra_lines: [{ label: 'X', quantity: 0, amount_ht_cts: 999, tva_rate: 10 }] },
];

describe('totalTtcCourseCts (miroir de deliveryTotalTtcCts)', () => {
  for (const [i, c] of cas.entries()) {
    it(`cas ${i + 1}`, () => {
      expect(totalTtcCourseCts(c)).toBe(deliveryTotalTtcCts(c));
    });
  }
  it('TTC inconnu → null (rien déclaré, à faire dans Pennylane)', () => {
    expect(totalTtcCourseCts({ amount_ht_cts: 1000, amount_ttc_cts: null })).toBeNull();
  });
});
