// Logique pure de l'onglet Documents (Système) : sources, lecture IA, lots, tailles. Aucune dépendance DB ni DOM.
import type { DocumentRow } from '../../shared/lib/documents.types'

export const SOURCES: Record<string, string> = {
  delivery: 'Livraison', vehicle: 'Véhicule', client: 'Client', team_member: 'Salarié', tournee_colis: 'Tournée de colis',
  arret_colis: 'Arrêt de colis', charge: 'Charge', depot: 'Dépôt', journee_colis: 'Journée de colis',
}

export const libelleSource = (entityType: string | null | undefined): string => SOURCES[entityType ?? ''] ?? (entityType ? entityType : 'Dépôt')

/** Un document est « ancien Drive » quand il n'a plus de fichier chez nous (le Drive n'est plus branché). */
export const estAncienDrive = (d: Pick<DocumentRow, 'storage_path' | 'drive_file_id'>): boolean => !d.storage_path

/** L'IA sait lire : photos et PDF stockés chez nous (pas les anciens liens Drive, pas les formats exotiques). */
export function lisibleParIA(d: Pick<DocumentRow, 'storage_path' | 'mime_type' | 'file_name'>): boolean {
  if (!d.storage_path) return false
  const mime = (d.mime_type ?? '').toLowerCase()
  if (mime.startsWith('image/') || mime === 'application/pdf') return true
  return /\.(pdf|jpe?g|png|webp)$/i.test(d.file_name)
}

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

// ── Chemin de rangement dans le Drive ───────────────────────────────────────

export const cheminEnTexte = (c: readonly string[]): string => c.join(' / ')

/** « Achats / Carburant > 2026 » → ['Achats', 'Carburant', '2026'] (4 niveaux au plus, noms nettoyés). */
export const texteEnChemin = (t: string): string[] =>
  t.split(/\s*[/>]\s*/).map(x => x.replace(/[\\:*?"<>|]/g, '-').trim().slice(0, 60)).filter(Boolean).slice(0, 4)

/** Le dernier niveau est-il une année (« 2026 ») ou « Sans date » ? Alors il suit la date du document. */
export const finParAnnee = (c: readonly string[]): boolean => /^(\d{4}|Sans date)$/.test(c[c.length - 1] ?? '')

/** Même chemin, dossier d'année remplacé par celui de la nouvelle date (sans changer le reste). */
export function cheminAvecAnnee(chemin: readonly string[], date: string | null | undefined): string[] {
  const annee = date && /^\d{4}/.test(date) ? date.slice(0, 4) : 'Sans date'
  return finParAnnee(chemin) ? [...chemin.slice(0, -1), annee] : [...chemin]
}
