// Tests vitest du module PUR côté Edge (aucun import Deno), et parité avec
// l'aperçu front : ce que l'utilisateur voit doit être ce qui part.
import { describe, it, expect } from 'vitest';
import {
  codeTvaLegal, construireLignes, libelleCourse, tauxLignePrincipale, quantiteColis,
  construireLignesDevis, libelleDevis,
  type CourseAFacturer, type DevisAFacturer,
} from './lignesFacture.ts';
import { buildApercuPayload } from '../../../src/features/livraisons/apercuFacture.logic.ts';
import { lignesDevis } from '../../../src/shared/lib/lignesPennylane.ts';

const OPTS = { codeAutoliquidation: 'exempt', mentionAutoliquidation: 'Autoliquidation — TVA due par le preneur, art. 259-1 du CGI' };

const course = (over: Partial<CourseAFacturer> = {}): CourseAFacturer => ({
  id: 'd1',
  date: '2026-07-19',
  type: null,
  description: 'Transport palette',
  amount_ht_cts: 10000,
  tva_cts: 2000,
  tva_rate: 20,
  autoliquidation: false,
  extra_lines: [],
  ...over,
});

describe('codeTvaLegal', () => {
  it('taux légaux → codes Pennylane', () => {
    expect(codeTvaLegal(20)).toBe('FR_200');
    expect(codeTvaLegal(10)).toBe('FR_100');
    expect(codeTvaLegal(5.5)).toBe('FR_055');
    expect(codeTvaLegal(2.1)).toBe('FR_021');
    expect(codeTvaLegal(0)).toBe('FR_000');
  });
  it('autres → null', () => {
    expect(codeTvaLegal(8)).toBeNull();
    expect(codeTvaLegal(19)).toBeNull();
    expect(codeTvaLegal(Number.NaN)).toBeNull();
  });
});

describe('tauxLignePrincipale', () => {
  it('taux stocké légal et cohérent fait foi', () => {
    expect(tauxLignePrincipale(10000, 550, 5.5)).toBe(5.5);
    expect(tauxLignePrincipale(99, 20, 20)).toBe(20);
    expect(tauxLignePrincipale(10000, 1000, '10.00')).toBe(10);
  });
  it('TVA incohérente avec le taux stocké → taux déduit', () => {
    expect(tauxLignePrincipale(10000, 800, 20)).toBe(8);
  });
  it('sans taux stocké → déduit ; rien → 20', () => {
    expect(tauxLignePrincipale(1000, 55, null)).toBe(5.5);
    expect(tauxLignePrincipale(1000, null, null)).toBe(20);
  });
});

describe('libelleCourse', () => {
  it('description, sinon « Livraison <type> du <date> » sans double espace', () => {
    expect(libelleCourse({ description: ' X ', type: null, date: '2026-07-19' })).toBe('X');
    expect(libelleCourse({ description: null, type: null, date: '2026-07-19' })).toBe('Livraison du 2026-07-19');
    expect(libelleCourse({ description: '', type: 'professionnel', date: '2026-07-19' }))
      .toBe('Livraison professionnel du 2026-07-19');
  });
  it('messagerie : libellé du mois par défaut', () => {
    expect(libelleCourse({ description: null, type: null, date: '2026-09-30', prestation: 'messagerie' }))
      .toBe('Messagerie septembre 2026 — colis livrés');
  });
  it('référence client ajoutée une seule fois', () => {
    expect(libelleCourse({ description: 'Palette', type: null, date: '2026-07-19', reference_client: 'ODT 42' }))
      .toBe('Palette — Réf. ODT 42');
    expect(libelleCourse({ description: 'ODT 42 palette', type: null, date: '2026-07-19', reference_client: 'ODT 42' }))
      .toBe('ODT 42 palette');
  });
});

describe('relevé de messagerie', () => {
  it('quantité = colis, prix unitaire = prix au colis', () => {
    const r = construireLignes(course({ prestation: 'messagerie', nb_colis: 1240, prix_unitaire_cts: 100, amount_ht_cts: 124000, tva_cts: 24800 }), OPTS);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.lignes[0]).toMatchObject({ quantity: 1240, amountHtCts: 100 });
  });
  it('incohérent avec le HT : quantité 1', () => {
    expect(quantiteColis({ prestation: 'messagerie', nb_colis: 10, prix_unitaire_cts: 100, amount_ht_cts: 999 })).toBeNull();
  });
});

describe('construireLignes', () => {
  it('ligne principale + extras', () => {
    const r = construireLignes(course({
      extra_lines: [{ label: 'Attente', quantity: 2, amount_ht_cts: 1500, tva_rate: 10 }],
    }), OPTS);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.lignes).toEqual([
      { ref: 'd1', label: 'Transport palette', quantity: 1, amountHtCts: 10000, vatCode: 'FR_200', ratePct: 20 },
      { ref: 'd1#extra-0', label: 'Attente', quantity: 2, amountHtCts: 1500, vatCode: 'FR_100', ratePct: 10 },
    ]);
  });

  it('5,5 % passe (plus d’arrondi entier)', () => {
    const r = construireLignes(course({ tva_cts: 550, tva_rate: 5.5 }), OPTS);
    expect(r.ok && r.lignes[0].vatCode).toBe('FR_055');
  });

  it('AUTOLIQUIDATION : principale ET extras en code autoliquidation, mention au libellé', () => {
    const r = construireLignes(course({
      autoliquidation: true, tva_cts: 0, tva_rate: 0,
      extra_lines: [{ label: 'Attente', quantity: 1, amount_ht_cts: 1500, tva_rate: 20 }],
    }), OPTS);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.lignes.map((l) => l.vatCode)).toEqual(['exempt', 'exempt']);
    expect(r.lignes[0].label).toBe(`Transport palette — ${OPTS.mentionAutoliquidation}`);
    expect(r.lignes.every((l) => l.ratePct === null)).toBe(true);
  });

  it('refus : HT nul, taux non légal, extra sans libellé / HT ≤ 0 / taux non légal', () => {
    expect(construireLignes(course({ amount_ht_cts: 0 }), OPTS).ok).toBe(false);
    expect(construireLignes(course({ amount_ht_cts: null }), OPTS).ok).toBe(false);
    const taux = construireLignes(course({ tva_cts: 800, tva_rate: 20 }), OPTS);
    expect(taux.ok).toBe(false);
    if (!taux.ok) expect(taux.error).toContain('non légal (8 %)');
    expect(construireLignes(course({ extra_lines: [{ label: '', quantity: 1, amount_ht_cts: 100, tva_rate: 20 }] }), OPTS).ok).toBe(false);
    expect(construireLignes(course({ extra_lines: [{ label: 'A', quantity: 1, amount_ht_cts: 0, tva_rate: 20 }] }), OPTS).ok).toBe(false);
    const extra = construireLignes(course({ extra_lines: [{ label: 'A', quantity: 1, amount_ht_cts: 100, tva_rate: 8 }] }), OPTS);
    expect(extra.ok).toBe(false);
    if (!extra.ok) expect(extra.error).toContain('« A »');
  });

  it('message lisible avec la date de la course', () => {
    const r = construireLignes(course({ amount_ht_cts: 0 }), OPTS);
    expect(!r.ok && r.error).toContain('course du 19/07/2026');
  });

  it('quantité ≤ 0 ou absente → 1 ; extra sans taux → taux principal', () => {
    const r = construireLignes(course({
      tva_rate: 10, tva_cts: 1000,
      extra_lines: [{ label: 'A', quantity: 0, amount_ht_cts: 100 }],
    }), OPTS);
    expect(r.ok && r.lignes[1]).toMatchObject({ quantity: 1, vatCode: 'FR_100' });
  });
});

// ── Parité Edge ↔ aperçu front ───────────────────────────────────────────────
describe('parité avec l’aperçu front (buildApercuPayload)', () => {
  const cas: Array<[string, Partial<CourseAFacturer>]> = [
    ['simple 20 %', {}],
    ['5,5 %', { tva_cts: 550, tva_rate: 5.5 }],
    ['taux déduit', { tva_rate: null, tva_cts: 1000 }],
    ['taux non légal', { tva_cts: 800 }],
    ['HT nul', { amount_ht_cts: 0, tva_cts: 0 }],
    ['sans description', { description: null, type: 'particulier' }],
    ['autoliquidation + extras', { autoliquidation: true, tva_rate: 0, tva_cts: 0,
      extra_lines: [{ label: 'A', quantity: 2, amount_ht_cts: 300, tva_rate: 8 }] }],
    ['extras mixtes', { extra_lines: [
      { label: 'A', quantity: 1, amount_ht_cts: 300, tva_rate: 10 },
      { label: 'B', quantity: 3, amount_ht_cts: 200, tva_rate: 5.5 },
    ] }],
    ['extra invalide', { extra_lines: [{ label: 'A', quantity: 1, amount_ht_cts: 300, tva_rate: 7 }] }],
  ];

  for (const [nom, over] of cas) {
    it(nom, () => {
      const c = course(over);
      const edge = construireLignes(c, OPTS);
      const front = buildApercuPayload({
        id: c.id, date: c.date ?? '', description: c.description, type: c.type, client_id: 'c1',
        amount_ht_cts: c.amount_ht_cts, tva_cts: c.tva_cts, amount_ttc_cts: null,
        tva_rate: c.tva_rate, autoliquidation: c.autoliquidation,
        extra_lines: c.extra_lines as never,
      });
      const frontBloque = front.blocagePrincipal !== null || front.invalidExtras.length > 0;
      expect(frontBloque).toBe(!edge.ok);
      if (edge.ok) {
        expect(front.lines).toEqual(edge.lignes.map((l) => ({
          label: l.label, quantity: l.quantity, amount_ht_cts: l.amountHtCts, vat_rate_pct: l.ratePct,
        })));
      }
    });
  }
});

// ── Devis (lot U3) : mêmes lignes que la facture ─────────────────────────────
const devis = (over: Partial<DevisAFacturer> = {}): DevisAFacturer => ({
  id: 'q1',
  date: '2026-10-03',
  description: null,
  reference_client: null,
  prestation: 'messagerie',
  quantite: 1240,
  prix_unitaire_cts: 100,
  amount_ht_cts: 124000 + 1500,
  tva_cts: 25100,
  tva_rate: 20,
  autoliquidation: false,
  extra_lines: [{ label: 'Hayon', quantity: 1, amount_ht_cts: 1500, tva_rate: 20 }],
  ...over,
});

describe('construireLignesDevis', () => {
  it('messagerie 1 240 colis × 1,00 € + supplément → 2 lignes, quantité = colis', () => {
    const r = construireLignesDevis(devis(), OPTS);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.lignes).toEqual([
      { ref: 'q1', label: 'Messagerie — prix au colis', quantity: 1240, amountHtCts: 100, vatCode: 'FR_200', ratePct: 20 },
      { ref: 'q1#extra-0', label: 'Hayon', quantity: 1, amountHtCts: 1500, vatCode: 'FR_200', ratePct: 20 },
    ]);
  });
  it('autoliquidation : code exempt + mention sur la ligne principale, suppléments compris', () => {
    const r = construireLignesDevis(devis({ autoliquidation: true, tva_cts: 0, tva_rate: 0 }), OPTS);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.lignes.map((l) => l.vatCode)).toEqual(['exempt', 'exempt']);
    expect(r.lignes[0].label).toContain('art. 259-1');
    expect(r.lignes[0].ratePct).toBeNull();
  });
  it('libellé : description, puis référence client (comme la facture)', () => {
    expect(libelleDevis({ description: 'Navette Ostwald', date: '2026-10-03', reference_client: 'ODT-9', prestation: 'express' }))
      .toBe('Navette Ostwald — Réf. ODT-9');
    expect(libelleDevis({ description: null, date: '2026-10-03', reference_client: 'ODT-9', prestation: 'messagerie' }))
      .toBe('Messagerie — prix au colis — Réf. ODT-9');
    expect(libelleDevis({ description: null, date: '2026-10-03', prestation: 'express' }))
      .toBe('Livraison du 2026-10-03');
  });
  it('ancien devis (sans prix unitaire) : 1 × HT, taux déduit des totaux', () => {
    const r = construireLignesDevis(devis({
      prestation: null, description: 'Transport', quantite: null, prix_unitaire_cts: null,
      amount_ht_cts: 10000, tva_cts: 2000, tva_rate: null, extra_lines: [],
    }), OPTS);
    expect(r.ok && r.lignes).toEqual([
      { ref: 'q1', label: 'Transport', quantity: 1, amountHtCts: 10000, vatCode: 'FR_200', ratePct: 20 },
    ]);
  });
  it('au km : quantité décimale gardée', () => {
    const r = construireLignesDevis(devis({ prestation: 'express', description: 'Course', quantite: 12.5, prix_unitaire_cts: 90, extra_lines: [] }), OPTS);
    expect(r.ok && r.lignes[0]).toMatchObject({ quantity: 12.5, amountHtCts: 90 });
  });
  it('refus lisibles : prix nul, taux non légal, supplément sans montant', () => {
    expect(construireLignesDevis(devis({ prix_unitaire_cts: 0 }), OPTS)).toMatchObject({ ok: false, details: { quote_id: 'q1' } });
    const taux = construireLignesDevis(devis({ tva_rate: 8, tva_cts: 10040 }), OPTS);
    expect(taux.ok).toBe(false);
    expect(!taux.ok && taux.error).toContain('le devis du 03/10/2026');
    expect(construireLignesDevis(devis({ extra_lines: [{ label: 'Attente', quantity: 1, amount_ht_cts: 0 }] }), OPTS).ok).toBe(false);
  });
});

describe('parité devis : Edge ↔ front (lignesDevis)', () => {
  const cas: Array<[string, Partial<DevisAFacturer>]> = [
    ['messagerie + supplément', {}],
    ['autoliquidation', { autoliquidation: true, tva_rate: 0, tva_cts: 0 }],
    ['10 %', { tva_rate: 10, extra_lines: [] }],
    ['km décimal', { prestation: 'express', description: 'Course', quantite: 12.5, prix_unitaire_cts: 90 }],
    ['ancien devis', { prix_unitaire_cts: null, quantite: null, amount_ht_cts: 10000, tva_cts: 2000, tva_rate: null, extra_lines: [] }],
    ['référence', { reference_client: 'PO-12', description: 'Tournée' }],
    ['prix nul', { prix_unitaire_cts: 0 }],
    ['taux non légal', { tva_rate: 8, tva_cts: 10040 }],
    ['supplément invalide', { extra_lines: [{ label: '', quantity: 1, amount_ht_cts: 300 }] }],
  ];
  for (const [nom, over] of cas) {
    it(nom, () => {
      const q = devis(over);
      const edge = construireLignesDevis(q, OPTS);
      const front = lignesDevis({
        date: q.date, description: q.description, reference_client: q.reference_client, prestation: q.prestation,
        quantite: q.quantite == null ? null : Number(q.quantite), prix_unitaire_cts: q.prix_unitaire_cts ?? null,
        amount_ht_cts: q.amount_ht_cts, tva_cts: q.tva_cts,
        tva_rate: q.tva_rate == null ? null : Number(q.tva_rate), autoliquidation: q.autoliquidation === true,
        extra_lines: q.extra_lines as never,
      });
      expect(front.blocage !== null).toBe(!edge.ok);
      if (edge.ok) {
        expect(front.lignes.map(({ label, quantity, amount_ht_cts, vat_rate_pct }) => ({ label, quantity, amount_ht_cts, vat_rate_pct })))
          .toEqual(edge.lignes.map((l) => ({ label: l.label, quantity: l.quantity, amount_ht_cts: l.amountHtCts, vat_rate_pct: l.ratePct })));
      }
    });
  }
});
