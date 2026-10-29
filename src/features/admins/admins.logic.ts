import { estCompteSalarie } from '../../shared/permissions/roles'
import { PERMISSION_CATALOG } from '../../shared/permissions/catalog'
import { ROLE_OPTIONS } from './admins.types'
import type { AdminMember, AdminRole, ResourcePermission } from './admins.types'

/** Options du sélecteur de rôle : le rôle actuel reste affiché même s'il n'est plus attribuable. */
export function optionsRole(actuel: AdminRole, libelles: Record<AdminRole, string>): { value: AdminRole; label: string }[] {
  if (ROLE_OPTIONS.some(o => o.value === actuel)) return ROLE_OPTIONS
  return [{ value: actuel, label: libelles[actuel] ?? actuel }, ...ROLE_OPTIONS]
}

/** Comptes du bureau d'un côté, comptes salariés (cloisonnés, gérés dans Équipe › Accès au site) de l'autre. */
export function separerComptes(membres: AdminMember[]): { bureau: AdminMember[]; salaries: AdminMember[] } {
  return {
    bureau: membres.filter(m => !estCompteSalarie(m.role)),
    salaries: membres.filter(m => estCompteSalarie(m.role)),
  }
}

export interface FiltresAdmins { q: string; role: string; statut: '' | 'actifs' | 'coupes' }
export const FILTRES_VIDES: FiltresAdmins = { q: '', role: '', statut: '' }

export const filtresActifs = (f: FiltresAdmins) => f.q.trim() !== '' || f.role !== '' || f.statut !== ''

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function filtrerComptes(membres: AdminMember[], f: FiltresAdmins, libelleRole: (r: AdminRole) => string): AdminMember[] {
  const q = norm(f.q.trim())
  return membres.filter(m => {
    if (f.role && m.role !== f.role) return false
    if (f.statut === 'actifs' && m.active === false) return false
    if (f.statut === 'coupes' && m.active !== false) return false
    if (!q) return true
    return norm(`${m.full_name} ${m.email ?? ''} ${libelleRole(m.role)}`).includes(q)
  })
}

// ── Profils de droits : des suggestions qui pré-cochent la grille, l'utilisateur ajuste puis enregistre ──────────

export type ProfilDroits = 'comptable' | 'dg' | 'lecture'

export const PROFILS_DROITS: { valeur: ProfilDroits; libelle: string; detail: string }[] = [
  { valeur: 'comptable', libelle: 'Comptable', detail: 'Finance et Tiers : voir et saisir. Livraisons : voir.' },
  { valeur: 'dg', libelle: 'Directeur général', detail: 'Tout sauf Système : voir, créer, modifier.' },
  { valeur: 'lecture', libelle: 'Lecture seule', detail: 'Tout voir sauf Système, sans rien modifier.' },
]

type Cases = Omit<ResourcePermission, 'resource'>
const AUCUN: Cases = { voir: false, creer: false, modifier: false, supprimer: false }

function droitsDuProfil(profil: ProfilDroits, section: string, key: string): Cases {
  if (section === 'Système') return AUCUN
  switch (profil) {
    case 'lecture':
      return { ...AUCUN, voir: true }
    case 'dg':
      return { voir: true, creer: true, modifier: true, supprimer: false }
    case 'comptable':
      if (section === 'Finance' || section === 'Tiers') return { voir: true, creer: true, modifier: true, supprimer: false }
      if (key === 'livraisons.livraisons' || key === 'livraisons.devis') return { ...AUCUN, voir: true }
      return AUCUN
  }
}

/** Grille de droits d'un profil, sur toutes les ressources du catalogue. */
export function grilleDuProfil(profil: ProfilDroits): Record<string, ResourcePermission> {
  return Object.fromEntries(PERMISSION_CATALOG.map(r => [r.key, { resource: r.key, ...droitsDuProfil(profil, r.section, r.key) }]))
}

/** Nombre de ressources visibles dans une grille (résumé « 9 écrans sur 14 »). */
export function nbEcransVisibles(grille: Record<string, ResourcePermission>): number {
  return Object.values(grille).filter(p => p.voir).length
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'

/** Mot de passe lisible à dicter : sans 0 / O / 1 / l / I, au moins une majuscule, une minuscule et un chiffre. */
export function genererMotDePasse(longueur = 12, aleatoire: (max: number) => number = max => {
  const t = new Uint32Array(1)
  crypto.getRandomValues(t)
  return t[0] % max
}): string {
  const maj = 'ABCDEFGHJKLMNPQRSTUVWXYZ', min = 'abcdefghijkmnopqrstuvwxyz', num = '23456789'
  const pick = (s: string) => s[aleatoire(s.length)]
  const lettres = [pick(maj), pick(min), pick(num)]
  while (lettres.length < longueur) lettres.push(pick(ALPHABET))
  for (let i = lettres.length - 1; i > 0; i--) {
    const j = aleatoire(i + 1);
    [lettres[i], lettres[j]] = [lettres[j], lettres[i]]
  }
  return lettres.join('')
}
