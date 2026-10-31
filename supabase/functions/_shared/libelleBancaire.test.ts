import { describe, expect, it } from 'vitest';
import { libelleComptable } from './libelleBancaire.ts';

describe('libelleComptable', () => {
  it('ajoute la référence au libellé', () => {
    expect(libelleComptable('MCA LOGISTICS', 'COMPTE A COMPTE QONTO TO PENNYLANE 29/10/2026'))
      .toBe('MCA LOGISTICS - COMPTE A COMPTE QONTO TO PENNYLANE 29/10/2026');
  });
  it('ne double pas une référence déjà dans le libellé', () => {
    expect(libelleComptable('URSSAF - COTISATIONS T3', 'COTISATIONS T3')).toBe('URSSAF - COTISATIONS T3');
  });
  it('sans référence, garde le libellé ; sans rien, null', () => {
    expect(libelleComptable('Total Energies', '  ')).toBe('Total Energies');
    expect(libelleComptable(null, null)).toBeNull();
    expect(libelleComptable(null, 'REF 1')).toBe('REF 1');
  });
});
