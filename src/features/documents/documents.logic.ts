// Logique pure de l'onglet Documents (Système) : sources, dossiers, filtres, compteurs. Aucune dépendance DB ni DOM.
import type { DocumentRow } from '../../shared/lib/documents.types'
import { TYPES_DOCUMENT, libelleType } from '../../shared/lib/documentsTri'

export const SOURCES: Record<string, string> = {
  delivery: 'Livraison', vehicle: 'Véhicule', client: 'Client', team_member: 'Salarié', tournee_colis: 'Tournée de colis',
  arret_colis: 'Arrêt de colis', charge: 'Charge', depot: 'Dépôt', journee_colis: 'Journée de colis',
}

export const libelleSource = (entityType: string | null | undefined): string => SOURCES[entityType ?? ''] ?? (entityType ? entityType : 'Dépôt')

/** Une ligne de la bibliothèque : un document classé, ou un justificatif de Finance (lecture seule). */
export interface LigneBibliotheque {
  id: string
  origine: 'document' | 'justificatif'
  nom: string
  mime: string | null
  chemin: string | null
  taille: number | null
  type: string | null
  date: string | null
  tiers: string | null
  montantCts: number | null
  source: string
  creeLe: string
}

export const DOSSIERS = [...new Set(TYPES_DOCUMENT.map(t => t.dossier))]

export function dossierDe(type: string | null | undefined): string {
  return TYPES_DOCUMENT.find(t => t.cle === type)?.dossier ?? 'Autre'
}

/** Un document est « ancien Drive » quand il n'a plus de fichier chez nous (le Drive n'est plus branché). */
export const estAncienDrive = (d: Pick<DocumentRow, 'storage_path' | 'drive_file_id'>): boolean => !d.storage_path

/** L'IA sait lire : photos et PDF stockés chez nous (pas les anciens liens Drive, pas les formats exotiques). */
export function lisibleParIA(d: Pick<DocumentRow, 'storage_path' | 'mime_type' | 'file_name'>): boolean {
  if (!d.storage_path) return false
  const mime = (d.mime_type ?? '').toLowerCase()
  if (mime.startsWith('image/') || mime === 'application/pdf') return true
  return /\.(pdf|jpe?g|png|webp)$/i.test(d.file_name)
}

export function enLigne(d: DocumentRow): LigneBibliotheque {
  return {
    id: d.id, origine: 'document', nom: d.file_name, mime: d.mime_type, chemin: d.storage_path, taille: d.size_bytes,
    type: d.type_document ?? null, date: d.date_document ?? null, tiers: d.tiers ?? null, montantCts: d.montant_ttc_cts ?? null,
    source: libelleSource(d.entity_type), creeLe: d.created_at,
  }
}

export interface FiltreBibliotheque { q: string; dossier: string; annee: string; type: string }

const jour = (l: LigneBibliotheque) => l.date ?? l.creeLe.slice(0, 10)

export function filtrerBibliotheque(lignes: LigneBibliotheque[], f: FiltreBibliotheque): LigneBibliotheque[] {
  const mot = f.q.trim().toLowerCase()
  return lignes.filter(l => {
    if (f.dossier && (l.origine === 'justificatif' ? 'Justificatifs' : dossierDe(l.type)) !== f.dossier) return false
    if (f.type && l.type !== f.type) return false
    if (f.annee && jour(l).slice(0, 4) !== f.annee) return false
    if (!mot) return true
    return `${l.nom} ${l.tiers ?? ''} ${libelleType(l.type)} ${l.source}`.toLowerCase().includes(mot)
  }).sort((a, b) => jour(b).localeCompare(jour(a)))
}

export function compteursDossiers(lignes: LigneBibliotheque[]): Record<string, number> {
  const c: Record<string, number> = {}
  for (const l of lignes) {
    const d = l.origine === 'justificatif' ? 'Justificatifs' : dossierDe(l.type)
    c[d] = (c[d] ?? 0) + 1
  }
  return c
}

export const anneesDe = (lignes: LigneBibliotheque[]): string[] =>
  [...new Set(lignes.map(l => jour(l).slice(0, 4)))].sort().reverse()

/** Découpe en lots (l'Edge lit 5 documents par appel : forfait IA gratuit). */
export function lotsDe<T>(items: T[], taille: number): T[][] {
  const lots: T[][] = []
  for (let i = 0; i < items.length; i += taille) lots.push(items.slice(i, i + taille))
  return lots
}

export function tailleLisible(octets: number | null | undefined): string {
  if (octets == null) return '—'
  if (octets < 1024) return `${octets} o`
  if (octets < 1024 * 1024) return `${Math.round(octets / 1024)} Ko`
  return `${(octets / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`
}
