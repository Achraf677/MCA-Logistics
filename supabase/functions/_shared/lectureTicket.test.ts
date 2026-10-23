import { describe, expect, it } from 'vitest';
import { colonnesAPrerempli, fournisseurCorrespondant, normaliserLecture } from './lectureTicket';

const ok = { fournisseur: "O'TACOS", fournisseur_confiance: 0.9, date: '2026-10-21', date_confiance: 0.9, total_ttc: 17.5, total_confiance: 0.95, taux_tva: 10, tva_confiance: 0.9, categorie: 'repas', categorie_confiance: 0.8 };

describe('lectureTicket', () => {
  it('garde une lecture sûre', () => {
    expect(normaliserLecture(ok, '2026-10-23')).toEqual({ fournisseur: "O'TACOS", date: '2026-10-21', total_ttc_cts: 1750, taux_tva: 10, categorie: 'repas' });
  })
  it('écarte ce qui est douteux ou invraisemblable', () => {
    const l = normaliserLecture({ ...ok, total_confiance: 0.4, date: '2031-01-01', taux_tva: 7, categorie: 'cadeau' }, '2026-10-23');
    expect(l).toMatchObject({ total_ttc_cts: null, date: null, taux_tva: null, categorie: null });
    expect(normaliserLecture({ ...ok, total_ttc: 99999 }, '2026-10-23').total_ttc_cts).toBeNull();
    expect(normaliserLecture(null, '2026-10-23').total_ttc_cts).toBeNull();
  })
  it('un taux 0 % lu est gardé', () => {
    expect(normaliserLecture({ ...ok, taux_tva: 0 }, '2026-10-23').taux_tva).toBe(0);
  })
  it('rapproche le fournisseur sans deviner', () => {
    const f = [{ id: '1', name: 'Total Energies' }, { id: '2', name: 'Carrefour' }, { id: '3', name: 'Carrefour Market' }];
    expect(fournisseurCorrespondant('TOTAL ENERGIES', f)).toBe('1');
    expect(fournisseurCorrespondant('Carrefour', f)).toBeNull(); // 2 candidats
    expect(fournisseurCorrespondant('abc', f)).toBeNull();
  })
  it('ne remplit que les cases vides', () => {
    const l = normaliserLecture(ok, '2026-10-23');
    expect(colonnesAPrerempli({}, l, '9')).toEqual({ montant_ttc_cts: 1750, date_depense: '2026-10-21', categorie: 'repas', tva_rate: 10, supplier_id: '9' });
    expect(colonnesAPrerempli({ montant_ttc_cts: 500, date_depense: '2026-10-20', categorie: 'autre', tva_rate: 0, supplier_id: '1' }, l, '9')).toEqual({});
  })
})
