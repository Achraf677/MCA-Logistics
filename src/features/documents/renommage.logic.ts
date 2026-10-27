// Renommage de fichiers DÉJÀ dans le Drive (Bibliothèque) : liste de revue « ancien nom → nouveau nom ». PUR : aucun appel réseau, aucun DOM.
import { estNomConforme } from '../../shared/lib/conventionDocuments'
import type { PropositionRenommage } from './documents.queries'

/** Fichiers lus par passage sur un dossier. */
export const MAX_PAR_PASSAGE = 100
/** Fichiers envoyés à l'IA par requête (l'Edge en accepte 6). */
export const TAILLE_PAQUET = 5

export interface FichierPourRenommer { id: string; name: string; mimeType: string }

export interface LigneRevue {
  id: string
  ancien: string
  /** Nom proposé, modifiable. */
  nouveau: string
  coche: boolean
  /** Le nom respecte déjà la convention (ou n'a pas changé). */
  conforme: boolean
  /** Pourquoi pas de proposition, ou comment elle a été faite (« Pièce sensible… »). */
  raison: string | null
  /** Lu par l'image, le texte, ou d'après le nom seulement. */
  luVia: 'image' | 'texte' | 'nom'
}

/**
 * Fichiers d'un dossier à envoyer à l'IA : les noms DÉJÀ conformes sont écartés tout de suite (rien à lire), les dossiers aussi.
 * `trop` = fichiers non conformes laissés pour un deuxième passage (au-delà de `MAX_PAR_PASSAGE`).
 */
export function aAnalyser(fichiers: readonly FichierPourRenommer[], max = MAX_PAR_PASSAGE, dossierMime = 'application/vnd.google-apps.folder'): {
  envoyes: FichierPourRenommer[]; dejaConformes: number; trop: number
} {
  const fichiersSeuls = fichiers.filter(f => f.mimeType !== dossierMime)
  const aRenommer = fichiersSeuls.filter(f => !estNomConforme(f.name))
  return { envoyes: aRenommer.slice(0, max), dejaConformes: fichiersSeuls.length - aRenommer.length, trop: Math.max(0, aRenommer.length - max) }
}

/** Une proposition de l'Edge → une ligne de revue. Cochée seulement s'il y a un nouveau nom différent de l'ancien. */
export function ligneDepuisProposition(p: PropositionRenommage): LigneRevue {
  const change = p.nouveau.trim() !== '' && p.nouveau !== p.ancien
  return { id: p.id, ancien: p.ancien, nouveau: p.nouveau, coche: change && !p.deja_conforme, conforme: p.deja_conforme || !change, raison: p.raison ?? null, luVia: p.lu_via }
}

/** Noms interdits dans un nom de fichier du Drive : vide, « / », trop long. */
export const nomValide = (nom: string): boolean => { const n = nom.trim(); return n.length > 0 && n.length <= 200 && !n.includes('/') }

/**
 * Lignes dont le nom (modifiable) en double un autre : une autre ligne cochée, ou un fichier déjà dans le dossier
 * (`existants` = noms du dossier). Comparaison sans casse. Une ligne qui garde son propre nom n'est pas en double.
 */
export function lignesEnDouble(lignes: readonly LigneRevue[], existants: readonly string[]): Set<string> {
  const doubles = new Set<string>()
  const prises = new Map<string, string>()
  const dossier = new Set(existants.map(n => n.toLowerCase()))
  const anciens = new Set(lignes.map(l => l.ancien.toLowerCase()))
  for (const l of lignes) {
    if (!l.coche) continue
    const k = l.nouveau.trim().toLowerCase()
    if (k === l.ancien.toLowerCase()) continue
    if (prises.has(k)) { doubles.add(l.id); doubles.add(prises.get(k)!) } else prises.set(k, l.id)
    if (dossier.has(k) && !anciens.has(k)) doubles.add(l.id)
  }
  return doubles
}

/** Lignes qu'« Appliquer » renommera : cochées, nom valide, nom changé, pas en double. */
export function aAppliquer(lignes: readonly LigneRevue[], existants: readonly string[]): LigneRevue[] {
  const doubles = lignesEnDouble(lignes, existants)
  return lignes.filter(l => l.coche && nomValide(l.nouveau) && l.nouveau.trim() !== l.ancien && !doubles.has(l.id))
}

/** Lignes affichées : tout, ou sans celles déjà conformes. */
export const lignesVisibles = (lignes: readonly LigneRevue[], masquerConformes: boolean): LigneRevue[] =>
  masquerConformes ? lignes.filter(l => !l.conforme || l.coche) : [...lignes]
