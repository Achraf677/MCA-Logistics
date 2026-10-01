import { describe, it, expect } from 'vitest';
import { echeanceTransport } from './paymentTerms';

describe('echeanceTransport (L441-11)', () => {
  it('plafonne à 30 jours date de facture', () => {
    expect(echeanceTransport('60', '2026-10-01', 30)).toBe('2026-10-31');
    expect(echeanceTransport('30_fin_mois', '2026-10-01', 30)).toBe('2026-10-31');
    expect(echeanceTransport('15', '2026-10-01', 30)).toBe('2026-10-16');
    expect(echeanceTransport('reception', '2026-10-01', 30)).toBe('2026-10-01');
  });
});
