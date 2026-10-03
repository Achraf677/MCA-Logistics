// Client Pennylane ↔ fiche client du site — PUR (aucun import, aucun Deno.env).
//
// Lot U2 (mca-spec/UNIFORMISATION-PENNYLANE.md) : UNE seule règle pour
//   1. ce qu'on envoie à Pennylane quand on crée un client (facture OU devis) ;
//   2. ce qu'on accepte de Pennylane quand on synchronise les clients.
// Testé par vitest (`clientPennylane.test.ts`).

/** Code pays ISO alpha-2 valide, sinon FR (même défaut que `clients.pays`). */
export function paysOuFrance(pays: unknown): string {
  return typeof pays === 'string' && /^[A-Z]{2}$/.test(pays.trim().toUpperCase())
    ? pays.trim().toUpperCase()
    : 'FR';
}

/** N° de TVA intracommunautaire normalisé (sans espaces, majuscules), ou null. */
export function tvaNormalisee(tva: unknown): string | null {
  if (typeof tva !== 'string') return null;
  const t = tva.replace(/\s+/g, '').toUpperCase();
  return t.length >= 4 ? t : null;
}

/** SIREN (9 chiffres) tiré d'un reg_no / SIRET Pennylane, sinon null. */
export function sirenDepuis(v: unknown): string | null {
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  const chiffres = String(v).replace(/\D/g, '');
  if (chiffres.length === 9 || chiffres.length === 14) return chiffres.slice(0, 9);
  return null;
}

export interface ClientSite {
  id: string;
  name: string;
  email: string | null;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  pays?: string | null;
  tva_intra?: string | null;
}

/** Corps de création d'un client société Pennylane (facture ET devis). */
export function payloadClientPennylane(c: ClientSite): {
  name: string;
  emails: string[];
  external_reference: string;
  billing_address: { address: string; postal_code: string; city: string; country_alpha2: string };
  vat_number?: string;
} {
  const tva = tvaNormalisee(c.tva_intra);
  return {
    name: c.name,
    emails: c.email ? [c.email] : [],
    external_reference: c.id,
    billing_address: {
      address: c.address ?? '',
      postal_code: c.postal_code ?? '',
      city: c.city ?? '',
      country_alpha2: paysOuFrance(c.pays),
    },
    ...(tva ? { vat_number: tva } : {}),
  };
}

// ── Synchro Pennylane → site (« local gagne ») ──────────────────────────────

/** Client tel que lu chez Pennylane (GET /customers). */
export interface ClientPennylane {
  id: number;
  name: string | null;
  reg_no: string | null;
  vat_number: string | null;
  emails: string[] | null;
  phone: string | null;
  billing_address: {
    address: string | null;
    postal_code: string | null;
    city: string | null;
    country_alpha2?: string | null;
  } | null;
}

/** Ce que le site a déjà pour ce client (null = client inconnu). */
export interface ClientLocal {
  name: string | null;
  type: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  siret: string | null;
  siren: string | null;
  tva_intra: string | null;
  pays: string | null;
  active: boolean | null;
}

/** Une valeur Pennylane non vide remplit un champ local VIDE ; sinon le local reste. */
function localGagne(local: string | null | undefined, pennylane: string | null | undefined): string | null {
  const l = (local ?? '').trim();
  if (l) return local as string;
  const p = (pennylane ?? '').trim();
  return p || null;
}

/**
 * Ligne à écrire dans `clients` pour un client Pennylane. Toutes les lignes ont
 * les MÊMES colonnes (upsert groupé : une colonne absente serait remise à null).
 *
 * Règles (toutes « le site gagne ») :
 * - nom, TVA, adresse, e-mail, téléphone : la valeur locale reste ; Pennylane
 *   ne remplit qu'un champ vide ;
 * - SIREN (reg_no) dans `siren`, JAMAIS dans `siret` (14 chiffres exigés) ;
 *   `siret` local conservé tel quel ;
 * - pays : celui du site pour un client connu, celui de Pennylane pour un nouveau ;
 * - `active` : un client archivé reste archivé ; un nouveau client est actif ;
 * - `type` : décidé ici une fois (professionnel s'il a SIREN ou TVA), jamais écrasé.
 */
export function ligneClientSync(
  c: ClientPennylane,
  local: ClientLocal | null | undefined,
  companyId: string,
  nomNormalise: (n: string) => string,
): Record<string, unknown> {
  const siren = sirenDepuis(c.reg_no);
  const tva = tvaNormalisee(c.vat_number);
  const nomPennylane = nomNormalise(c.name ?? `Client Pennylane #${c.id}`);
  return {
    company_id: companyId,
    pennylane_id: String(c.id),
    name: local?.name?.trim() ? local.name : nomPennylane,
    email: localGagne(local?.email, c.emails?.[0] ?? null),
    phone: localGagne(local?.phone, c.phone),
    address: localGagne(local?.address, c.billing_address?.address),
    city: localGagne(local?.city, c.billing_address?.city),
    postal_code: localGagne(local?.postal_code, c.billing_address?.postal_code),
    siret: local?.siret ?? null,
    siren: local?.siren ?? siren,
    tva_intra: localGagne(local?.tva_intra, tva),
    pays: local ? paysOuFrance(local.pays) : paysOuFrance(c.billing_address?.country_alpha2),
    type: local?.type ?? ((siren || tva) ? 'professionnel' : null),
    active: local ? local.active !== false : true,
  };
}
