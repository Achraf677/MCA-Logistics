import { describe, it, expect } from 'vitest';
import { codeTvaFournisseur, corpsImportFournisseur, manquesEnvoiPennylane, ventilerTtc } from './justificatifPennylane';

describe('ventilerTtc', () => {
  it('20 % : 12,00 € TTC = 10,00 HT + 2,00 TVA', () => {
    expect(ventilerTtc(1200, 20)).toEqual({ htCts: 1000, tvaCts: 200 });
  })
  it('arrondi : le HT est toujours TTC − TVA (aucun centime perdu)', () => {
    const v = ventilerTtc(180, 20);
    expect(v.htCts + v.tvaCts).toBe(180);
    expect(v).toEqual({ htCts: 150, tvaCts: 30 });
  })
  it('0 % : pas de TVA', () => {
    expect(ventilerTtc(500, 0)).toEqual({ htCts: 500, tvaCts: 0 });
  })
})

describe('corpsImportFournisseur', () => {
  const base = { fileAttachmentId: 42, supplierPennylaneId: '777', date: '2026-10-22', libelle: 'Cb perso', ttcCts: 180, tauxPct: 20 };
  it('tous les champs exigés par Pennylane sont là', () => {
    const c = corpsImportFournisseur(base);
    for (const k of ['supplier_id', 'date', 'deadline', 'currency_amount_before_tax', 'currency_amount', 'currency_tax', 'invoice_lines']) {
      expect(c).toHaveProperty(k);
    }
    expect(c).toMatchObject({ file_attachment_id: 42, supplier_id: 777, date: '2026-10-22', deadline: '2026-10-22', currency: 'EUR',
      currency_amount_before_tax: '1.50', currency_amount: '1.80', currency_tax: '0.30' });
  })
  it('une ligne, code TVA Pennylane', () => {
    const l = (corpsImportFournisseur(base).invoice_lines as Array<Record<string, unknown>>);
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ label: 'Cb perso', quantity: 1, raw_currency_unit_price: '1.50', vat_rate: 'FR_200' });
  })
  it('refuse un taux inconnu plutôt que de deviner', () => {
    expect(() => corpsImportFournisseur({ ...base, tauxPct: 7 })).toThrow();
  })
})

describe('codes TVA fournisseur', () => {
  it('ne reprend pas les codes d’une facture client (FR_055 / FR_021 / FR_000 refusés par Pennylane)', () => {
    expect(codeTvaFournisseur(5.5)).toBe('FR_55');
    expect(codeTvaFournisseur(2.1)).toBe('FR_21');
    expect(codeTvaFournisseur(10)).toBe('FR_100');
    expect(codeTvaFournisseur(20)).toBe('FR_200');
    expect(codeTvaFournisseur(0)).toBe('exempt');
    expect(codeTvaFournisseur(7)).toBeNull();
  })
})

describe('manquesEnvoiPennylane', () => {
  it('seul le montant est exigé (fournisseur et TVA ont une valeur par défaut)', () => {
    expect(manquesEnvoiPennylane({})).toEqual(['montant']);
    expect(manquesEnvoiPennylane({ montant_ttc_cts: 180 })).toEqual([]);
    expect(manquesEnvoiPennylane({ montant_ttc_cts: 180, tva_rate: 20 })).toEqual([]);
  })
  it('un taux renseigné mais inconnu est refusé', () => {
    expect(manquesEnvoiPennylane({ montant_ttc_cts: 180, tva_rate: 7 })).toEqual(['taux de TVA reconnu']);
  })
})
