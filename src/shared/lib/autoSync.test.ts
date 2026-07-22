import { describe, it, expect, vi } from 'vitest'
import {
  createInitialState, isStale, lockDomain, unlockDomain, runSync, sequentialSync,
  persistLastSync, loadLastSync, SyncRunError, DEFAULT_STALENESS_MS,
  type SyncStorage,
} from './autoSync'

// Faux storage en mémoire — jamais de localStorage réel dans les tests.
function fakeStorage(): SyncStorage {
  const map = new Map<string, string>()
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => { map.set(k, v) },
  }
}

describe('isStale', () => {
  it('lastSyncAt null → toujours périmé', () => {
    const state = createInitialState()
    expect(isStale(state, 'clients')).toBe(true)
  })

  it('sync récente → frais (non périmé)', () => {
    const state = createInitialState()
    state.clients = { lastSyncAt: Date.now(), syncing: false }
    expect(isStale(state, 'clients', { now: Date.now() })).toBe(false)
  })

  it('sync ancienne (> staleness) → périmé', () => {
    const state = createInitialState()
    const now = 1_000_000_000
    state.clients = { lastSyncAt: now - DEFAULT_STALENESS_MS - 1, syncing: false }
    expect(isStale(state, 'clients', { now })).toBe(true)
  })

  it('staleness custom respectée', () => {
    const state = createInitialState()
    const now = 1_000_000_000
    state.clients = { lastSyncAt: now - 5000, syncing: false }
    expect(isStale(state, 'clients', { now, stalenessMs: 1000 })).toBe(true)
    expect(isStale(state, 'clients', { now, stalenessMs: 10_000 })).toBe(false)
  })
})

describe('lockDomain / unlockDomain', () => {
  it('verrouille un domaine libre', () => {
    const state = createInitialState()
    const next = lockDomain(state, 'qonto')
    expect(next.qonto.syncing).toBe(true)
    // immutabilité : l'état d'origine n'est pas modifié
    expect(state.qonto.syncing).toBe(false)
  })

  it('rejette un verrou déjà pris (doublon)', () => {
    const state = createInitialState()
    const locked = lockDomain(state, 'qonto')
    expect(() => lockDomain(locked, 'qonto')).toThrow(/déjà en cours/)
  })

  it('unlockDomain libère le verrou', () => {
    const state = createInitialState()
    const locked = lockDomain(state, 'qonto')
    const unlocked = unlockDomain(locked, 'qonto')
    expect(unlocked.qonto.syncing).toBe(false)
  })

  it("un domaine verrouillé n'affecte pas les autres", () => {
    const state = createInitialState()
    const next = lockDomain(state, 'qonto')
    expect(next.clients.syncing).toBe(false)
  })
})

describe('persistLastSync / loadLastSync', () => {
  it('round-trip via un storage injecté (pas de localStorage réel)', () => {
    const storage = fakeStorage()
    persistLastSync('charges', 12345, storage)
    expect(loadLastSync('charges', storage)).toBe(12345)
  })

  it('clé stockée au format mca_sync_<domain>', () => {
    const storage = fakeStorage()
    persistLastSync('fournisseurs', 999, storage)
    expect(storage.getItem('mca_sync_fournisseurs')).toBe('999')
  })

  it('rien en storage → null', () => {
    const storage = fakeStorage()
    expect(loadLastSync('clients', storage)).toBeNull()
  })

  it('valeur corrompue en storage → null', () => {
    const storage = fakeStorage()
    storage.setItem('mca_sync_clients', 'not-a-number')
    expect(loadLastSync('clients', storage)).toBeNull()
  })

  it('storage null (SSR) → no-op silencieux', () => {
    expect(() => persistLastSync('clients', 1, null)).not.toThrow()
    expect(loadLastSync('clients', null)).toBeNull()
  })
})

describe('runSync', () => {
  it('lock → fn() → persist → unlock → onComplete', async () => {
    const storage = fakeStorage()
    const state = createInitialState()
    const fn = vi.fn().mockResolvedValue(undefined)
    const onComplete = vi.fn()

    const next = await runSync(state, 'clients', fn, { storage, now: 4242, onComplete })

    expect(fn).toHaveBeenCalledTimes(1)
    expect(next.clients).toEqual({ lastSyncAt: 4242, syncing: false })
    expect(loadLastSync('clients', storage)).toBe(4242)
    expect(onComplete).toHaveBeenCalledWith('clients')
  })

  it('rejette si le domaine est déjà verrouillé', async () => {
    const state = lockDomain(createInitialState(), 'clients')
    await expect(runSync(state, 'clients', vi.fn())).rejects.toThrow(/déjà en cours/)
  })

  it("fn() en échec → déverrouille et rejette avec SyncRunError (état récupérable)", async () => {
    const state = createInitialState()
    const boom = new Error('boom')
    const fn = vi.fn().mockRejectedValue(boom)

    await expect(runSync(state, 'clients', fn)).rejects.toBeInstanceOf(SyncRunError)
    try {
      await runSync(state, 'clients', fn)
    } catch (err) {
      const e = err as InstanceType<typeof SyncRunError>
      expect(e.domain).toBe('clients')
      expect(e.cause).toBe(boom)
      expect(e.state.clients.syncing).toBe(false) // pas de verrou bloqué
    }
  })
})

describe('sequentialSync', () => {
  it('exécute les domaines les uns après les autres, dans l\'ordre', async () => {
    const state = createInitialState()
    const order: string[] = []
    const fn = vi.fn(async (domain: string) => { order.push(domain) })

    await sequentialSync(state, ['clients', 'charges', 'qonto'], fn)

    expect(order).toEqual(['clients', 'charges', 'qonto'])
  })

  it('jamais 2 en parallèle : le n+1 démarre après la résolution du n', async () => {
    const state = createInitialState()
    let concurrent = 0
    let maxConcurrent = 0
    const fn = vi.fn(async () => {
      concurrent++
      maxConcurrent = Math.max(maxConcurrent, concurrent)
      await new Promise(r => setTimeout(r, 5))
      concurrent--
    })

    await sequentialSync(state, ['clients', 'charges', 'qonto'], fn)

    expect(maxConcurrent).toBe(1)
  })

  it("un domaine en échec n'interrompt pas les suivants", async () => {
    const state = createInitialState()
    const order: string[] = []
    const onError = vi.fn()
    const fn = vi.fn(async (domain: string) => {
      order.push(domain)
      if (domain === 'charges') throw new Error('échec charges')
    })

    const next = await sequentialSync(state, ['clients', 'charges', 'qonto'], fn, { onError })

    expect(order).toEqual(['clients', 'charges', 'qonto'])
    expect(onError).toHaveBeenCalledWith('charges', expect.any(Error))
    expect(next.clients.lastSyncAt).not.toBeNull()
    expect(next.qonto.lastSyncAt).not.toBeNull()
    expect(next.charges.lastSyncAt).toBeNull() // resté périmé après l'échec
    expect(next.charges.syncing).toBe(false)   // pas de verrou bloqué
  })

  it('état initial 0 domaine → retourne l\'état inchangé', async () => {
    const state = createInitialState()
    const next = await sequentialSync(state, [], vi.fn())
    expect(next).toEqual(state)
  })
})
