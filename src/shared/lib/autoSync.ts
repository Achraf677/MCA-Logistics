// Orchestrateur d'auto-synchronisation — PUR (aucun appel réseau, aucun accès
// DOM hors localStorage explicitement injectable). Consommé par SyncProvider
// (src/app/SyncProvider.tsx), qui détient l'état React et appelle ces fonctions
// comme un reducer. Pas de singleton ici : l'état est toujours porté par
// l'appelant (le Provider en prod, un objet local dans les tests).

export type SyncDomain =
  | 'clients' | 'charges' | 'qonto' | 'paiements' | 'derniers_numeros' | 'fournisseurs'

export const SYNC_DOMAINS: SyncDomain[] = [
  'clients', 'charges', 'qonto', 'paiements', 'derniers_numeros', 'fournisseurs',
]

export interface AutoSyncState {
  lastSyncAt: number | null
  syncing: boolean
}

export type AutoSyncStateMap = Record<SyncDomain, AutoSyncState>

export function createInitialState(): AutoSyncStateMap {
  return Object.fromEntries(
    SYNC_DOMAINS.map(d => [d, { lastSyncAt: null, syncing: false }]),
  ) as AutoSyncStateMap
}

/** Périmé après 10 min sans synchronisation réussie — préserve le quota API Free
 *  (pas de polling par intervalle, seulement montage + retour d'onglet + clic). */
export const DEFAULT_STALENESS_MS = 10 * 60 * 1000

export interface IsStaleOptions {
  stalenessMs?: number
  /** Horodatage de référence — injectable pour les tests (défaut Date.now()). */
  now?: number
}

export function isStale(
  state: AutoSyncStateMap,
  domain: SyncDomain,
  options: IsStaleOptions = {},
): boolean {
  const { stalenessMs = DEFAULT_STALENESS_MS, now = Date.now() } = options
  const last = state[domain].lastSyncAt
  return last === null || now - last > stalenessMs
}

/** Verrou anti-doublon : rejette (throw) si une sync est déjà en cours sur ce domaine. */
export function lockDomain(state: AutoSyncStateMap, domain: SyncDomain): AutoSyncStateMap {
  if (state[domain].syncing) {
    throw new Error(`autoSync: "${domain}" est déjà en cours de synchronisation`)
  }
  return { ...state, [domain]: { ...state[domain], syncing: true } }
}

export function unlockDomain(state: AutoSyncStateMap, domain: SyncDomain): AutoSyncStateMap {
  return { ...state, [domain]: { ...state[domain], syncing: false } }
}

// ── Persistance localStorage (clé `mca_sync_<domain>`) ──────────────────────────
// `storage` est injectable : en prod, défaut = window.localStorage ; en test,
// on passe un faux storage (Map) pour ne jamais toucher au localStorage réel.

export interface SyncStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

function storageKey(domain: SyncDomain): string {
  return `mca_sync_${domain}`
}

function defaultStorage(): SyncStorage | null {
  return typeof window !== 'undefined' ? window.localStorage : null
}

export function persistLastSync(
  domain: SyncDomain,
  ts: number,
  storage: SyncStorage | null = defaultStorage(),
): void {
  storage?.setItem(storageKey(domain), String(ts))
}

export function loadLastSync(
  domain: SyncDomain,
  storage: SyncStorage | null = defaultStorage(),
): number | null {
  const raw = storage?.getItem(storageKey(domain)) ?? null
  if (!raw) return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

// ── Exécution ──────────────────────────────────────────────────────────────────

/** Porte l'état déverrouillé + la cause d'échec, pour permettre à l'appelant de
 *  reprendre proprement (jamais de verrou bloqué après une erreur). */
export class SyncRunError extends Error {
  domain: SyncDomain
  state: AutoSyncStateMap
  cause: unknown

  constructor(domain: SyncDomain, state: AutoSyncStateMap, cause: unknown) {
    super(`autoSync: échec de synchronisation "${domain}"`)
    this.name = 'SyncRunError'
    this.domain = domain
    this.state = state
    this.cause = cause
  }
}

export interface RunSyncOptions {
  storage?: SyncStorage | null
  onComplete?: (domain: SyncDomain) => void
  /** Horodatage à persister en cas de succès — injectable pour les tests. */
  now?: number
}

/** lock → fn() → persist → unlock → onComplete(domain). En cas d'échec de fn(),
 *  déverrouille quand même et rejette avec un SyncRunError (état récupérable). */
export async function runSync(
  state: AutoSyncStateMap,
  domain: SyncDomain,
  fn: () => Promise<void>,
  options: RunSyncOptions = {},
): Promise<AutoSyncStateMap> {
  const locked = lockDomain(state, domain)
  try {
    await fn()
  } catch (err) {
    options.onComplete?.(domain)
    throw new SyncRunError(domain, unlockDomain(locked, domain), err)
  }
  const ts = options.now ?? Date.now()
  persistLastSync(domain, ts, options.storage)
  const next = { ...locked, [domain]: { lastSyncAt: ts, syncing: false } }
  options.onComplete?.(domain)
  return next
}

export interface SequentialSyncOptions extends RunSyncOptions {
  onError?: (domain: SyncDomain, cause: unknown) => void
}

/**
 * Exécute runSync sur chaque domaine LES UNS APRÈS LES AUTRES (jamais en
 * parallèle — préserve le quota API). Un domaine en échec n'interrompt pas les
 * suivants : son erreur est reportée via `onError`, l'état repart déverrouillé.
 */
export async function sequentialSync(
  state: AutoSyncStateMap,
  domains: SyncDomain[],
  fn: (domain: SyncDomain) => Promise<void>,
  options: SequentialSyncOptions = {},
): Promise<AutoSyncStateMap> {
  let current = state
  for (const domain of domains) {
    try {
      current = await runSync(current, domain, () => fn(domain), options)
    } catch (err) {
      if (err instanceof SyncRunError) {
        current = err.state
        options.onError?.(domain, err.cause)
        continue
      }
      throw err
    }
  }
  return current
}
