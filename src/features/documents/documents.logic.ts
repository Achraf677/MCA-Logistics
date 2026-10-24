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

/** Un dossier du Drive tel que le renvoie l'API (`parents` : le dossier contenant). */
export interface DossierDrive { id: string; name: string; parents?: string[] }

/** Tous les chemins existants sous `racineId` (relatifs à la racine ; 4 niveaux et 400 chemins au plus), triés. */
export function cheminsDepuisDossiers(dossiers: readonly DossierDrive[], racineId: string, profondeur = 4, max = 400): string[][] {
  const enfants = new Map<string, DossierDrive[]>()
  for (const d of dossiers) for (const p of d.parents ?? []) enfants.set(p, [...(enfants.get(p) ?? []), d])
  const sortie: string[][] = []
  const descendre = (id: string, chemin: string[]) => {
    if (chemin.length >= profondeur) return
    for (const e of [...(enfants.get(id) ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'fr'))) {
      if (sortie.length >= max) return
      const c = [...chemin, e.name]
      sortie.push(c)
      descendre(e.id, c)
    }
  }
  descendre(racineId, [])
  return sortie
}

export interface OptionChemin { valeur: string; libelle: string; detail?: string }

/**
 * Choix proposés pour « Où le ranger » : dossiers existants + chemins de la proposition + chemin actuel (marqués « nouveau dossier »
 * quand ils n'existent pas encore dans le Drive). Sans arborescence connue, on ne marque rien.
 */
export function optionsChemin(existants: readonly string[][], supplementaires: ReadonlyArray<readonly string[]>): OptionChemin[] {
  const connus = new Set(existants.map(cheminEnTexte))
  const vus = new Set<string>()
  const sortie: OptionChemin[] = []
  const ajoute = (c: readonly string[]) => {
    const t = cheminEnTexte(c)
    if (!t || vus.has(t)) return
    vus.add(t)
    sortie.push({ valeur: t, libelle: t, detail: connus.size > 0 && !connus.has(t) ? 'nouveau dossier' : undefined })
  }
  for (const s of supplementaires) ajoute(s)
  for (const e of existants) ajoute(e)
  return sortie
}

/** « il y a 5 min », « il y a 2 h », « hier 14:05 »… pour l'historique. */
export function depuisQuand(iso: string | null | undefined, maintenant = new Date()): string {
  if (!iso) return ''
  const d = new Date(iso)
  const min = Math.round((maintenant.getTime() - d.getTime()) / 60000)
  if (min < 1) return 'à l\'instant'
  if (min < 60) return `il y a ${min} min`
  if (min < 24 * 60 && d.toDateString() === maintenant.toDateString()) return `il y a ${Math.round(min / 60)} h`
  const hier = new Date(maintenant); hier.setDate(hier.getDate() - 1)
  const heure = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  if (d.toDateString() === hier.toDateString()) return `hier ${heure}`
  return `${d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })} ${heure}`
}
