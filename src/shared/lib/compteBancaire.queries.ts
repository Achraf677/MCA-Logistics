import { supabase } from '../../app/providers'

export interface CompteBancaire { iban: string | null; bic: string | null }

/** IBAN / BIC de la société (`companies`), affichés dans Système › Cartes bancaires. */
export async function lireCompteBancaire(companyId: string) {
  return supabase.from('companies').select('iban, bic').eq('id', companyId).single()
}

export async function enregistrerCompteBancaire(companyId: string, c: CompteBancaire) {
  return supabase.from('companies').update({ iban: c.iban, bic: c.bic }).eq('id', companyId).select('iban, bic').single()
}
