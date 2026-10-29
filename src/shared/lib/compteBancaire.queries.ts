import { supabase } from '../../app/providers'
import { cheminRib } from './coordonneesBancaires'

const BUCKET = 'documents'
const MAX_BYTES = 20 * 1024 * 1024

export interface CompteBancaire {
  id: string
  libelle: string
  banque: string | null
  iban: string | null
  bic: string | null
  rib_path: string | null
  rib_nom: string | null
}

export type SaisieCompte = Pick<CompteBancaire, 'libelle' | 'banque' | 'iban' | 'bic'>

const COLONNES = 'id, libelle, banque, iban, bic, rib_path, rib_nom'

/** Comptes bancaires de la société (Système › Cartes bancaires). Lecture réservée au président / droit Paramètres (RLS). */
export async function listerComptes() {
  return supabase.from('comptes_bancaires').select(COLONNES).order('created_at')
}

export async function creerCompte(companyId: string, s: SaisieCompte) {
  return supabase.from('comptes_bancaires').insert({ company_id: companyId, ...s }).select(COLONNES).single()
}

export async function modifierCompte(id: string, patch: Partial<CompteBancaire>) {
  return supabase.from('comptes_bancaires').update(patch).eq('id', id).select(COLONNES).single()
}

export async function supprimerCompteBancaire(compte: CompteBancaire) {
  const { error } = await supabase.from('comptes_bancaires').delete().eq('id', compte.id)
  if (!error && compte.rib_path) await supabase.storage.from(BUCKET).remove([compte.rib_path])
  return { error }
}

/** Envoie le RIB (PDF ou image) dans le bucket `documents` ; renvoie le chemin stocké. */
export async function envoyerRib(companyId: string, file: File): Promise<{ path: string | null; error: Error | null }> {
  if (file.size > MAX_BYTES) return { path: null, error: new Error('Fichier trop volumineux (limite 20 Mo)') }
  const path = cheminRib(companyId, file.name, crypto.randomUUID())
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || 'application/pdf', upsert: false })
  return { path: error ? null : path, error: error ? new Error(error.message) : null }
}

export async function retirerRib(path: string) {
  await supabase.storage.from(BUCKET).remove([path])
}

/** Lien temporaire (1 h) : pour l'ouvrir dans l'appli, ou le télécharger sous son nom (`telecharger`). */
export async function lienRib(compte: CompteBancaire, telecharger = false): Promise<string | null> {
  if (!compte.rib_path) return null
  const { data, error } = await supabase.storage.from(BUCKET)
    .createSignedUrl(compte.rib_path, 3600, telecharger ? { download: compte.rib_nom ?? true } : undefined)
  return error ? null : data?.signedUrl ?? null
}
