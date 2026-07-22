// Règle de fusion "local wins" pour la sync pennylane-clients-sync — PUR, testable.
//
// Bug corrigé : la sync écrasait email/phone/address/city/postal_code par les
// valeurs Pennylane même quand celles-ci étaient null/vides, perdant les
// enrichissements saisis localement (ex : email ajouté à la main).
//
// Règle : la valeur Pennylane l'emporte UNIQUEMENT si elle est renseignée
// (non null, non vide après trim) — sinon la valeur locale existante est
// conservée. `name`/`pennylane_id`/`company_id` ne passent jamais par cette
// règle (identité officielle Pennylane, toujours écrasée) ; `type`,
// `payment_terms`, `payment_terms_label`, `tariff_mode`, `notes` ne sont
// jamais touchés par la sync (absents du payload upserté).

export interface ClientEnrichedFields {
  email: string | null
  phone: string | null
  address: string | null
  city: string | null
  postal_code: string | null
}

/** Une valeur Pennylane non vide l'emporte ; sinon on garde la valeur locale. */
export function mergeClientField(
  pennylaneValue: string | null | undefined,
  localValue: string | null | undefined,
): string | null {
  const p = (pennylaneValue ?? '').trim()
  if (p.length > 0) return p
  return localValue ?? null
}

/** Applique mergeClientField aux 5 champs enrichissables. `local` absent
 *  (client jamais vu localement — première synchro) = les valeurs Pennylane
 *  passent telles quelles (rien à préserver). */
export function mergeClientEnrichedFields(
  pennylane: ClientEnrichedFields,
  local: ClientEnrichedFields | null | undefined,
): ClientEnrichedFields {
  return {
    email:       mergeClientField(pennylane.email, local?.email),
    phone:       mergeClientField(pennylane.phone, local?.phone),
    address:     mergeClientField(pennylane.address, local?.address),
    city:        mergeClientField(pennylane.city, local?.city),
    postal_code: mergeClientField(pennylane.postal_code, local?.postal_code),
  }
}
