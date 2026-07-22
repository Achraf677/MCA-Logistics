import { createContext, useContext, useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  SYNC_DOMAINS, createInitialState, isStale, sequentialSync, persistLastSync, loadLastSync,
  type SyncDomain, type AutoSyncStateMap,
} from '../shared/lib/autoSync'
import { useAuth } from './providers'
import { syncPennylaneClients } from '../features/clients/clients.queries'
import { syncPennylane } from '../features/charges/charges.queries'
import { syncQonto, checkPayments } from '../features/tresorerie/tresorerie.queries'
import { getDerniersNumeros } from '../features/livraisons/livraisons.queries'

export interface DerniersNumeros {
  invoice: string | null
  quote: string | null
}

interface SyncContextValue {
  syncState: AutoSyncStateMap
  /** Sans argument : force tous les domaines. Avec un domaine : force celui-là seul. */
  forceSync: (domain?: SyncDomain) => void
  /** Ne déclenche que si le domaine est périmé — utilisé au montage des sections. */
  syncIfStale: (domain: SyncDomain) => void
  /** Dernier résultat pennylane-last-numbers (domaine 'derniers_numeros'). */
  derniersNumeros: DerniersNumeros | null
  /** Message d'erreur discret par domaine (dernier échec), vidé au prochain succès. */
  errors: Partial<Record<SyncDomain, string>>
}

const SyncContext = createContext<SyncContextValue | null>(null)

export function useSync(): SyncContextValue {
  const ctx = useContext(SyncContext)
  if (!ctx) throw new Error('useSync doit être utilisé sous <SyncProvider>')
  return ctx
}

function initStateFromStorage(): AutoSyncStateMap {
  const state = createInitialState()
  for (const domain of SYNC_DOMAINS) {
    state[domain] = { lastSyncAt: loadLastSync(domain), syncing: false }
  }
  return state
}

/**
 * Fonctions de sync par domaine — un seul appel réseau (Edge Function) par
 * domaine, jamais d'appel direct à une API externe depuis le front. 'charges'
 * et 'fournisseurs' tirent la MÊME Edge (pennylane-sync ingère les fournisseurs
 * en side-effect des factures) : voir la coalescence dans runDomains ci-dessous.
 */
function domainSyncFn(domain: SyncDomain, onDerniersNumeros: (d: DerniersNumeros) => void): () => Promise<void> {
  switch (domain) {
    case 'clients':          return async () => { await syncPennylaneClients() }
    case 'charges':          return async () => { await syncPennylane() }
    case 'fournisseurs':     return async () => { await syncPennylane() }
    case 'qonto':             return async () => { await syncQonto() }
    case 'paiements':         return async () => { await checkPayments() }
    case 'derniers_numeros':  return async () => { onDerniersNumeros(await getDerniersNumeros()) }
  }
}

export function SyncProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [syncState, setSyncState] = useState<AutoSyncStateMap>(initStateFromStorage)
  const [derniersNumeros, setDerniersNumeros] = useState<DerniersNumeros | null>(null)
  const [errors, setErrors] = useState<Partial<Record<SyncDomain, string>>>({})

  // Ref = lecture synchrone de l'état le plus récent dans les callbacks (React
  // state est asynchrone) ; runningRef sérialise TOUTE l'activité de sync,
  // même entre déclencheurs différents (montage, visibilitychange, clic).
  const stateRef = useRef(syncState)
  useEffect(() => { stateRef.current = syncState }, [syncState])
  const runningRef = useRef(false)
  const didInitialSyncRef = useRef(false)

  const runDomains = useCallback(async (domains: SyncDomain[]) => {
    if (domains.length === 0 || runningRef.current) return
    runningRef.current = true
    try {
      let list = domains
      const coalesceFournisseurs = list.includes('charges') && list.includes('fournisseurs')
      if (coalesceFournisseurs) list = list.filter(d => d !== 'fournisseurs')

      // Retour visuel immédiat (spinner) pendant l'exécution séquentielle.
      setSyncState(s => {
        const next = { ...s }
        for (const d of list) next[d] = { ...next[d], syncing: true }
        return next
      })

      const result = await sequentialSync(
        stateRef.current,
        list,
        (d) => domainSyncFn(d, setDerniersNumeros)(),
        {
          onError: (domain, cause) => setErrors(e => ({
            ...e, [domain]: (cause as Error)?.message ?? 'Échec de synchronisation',
          })),
        },
      )

      let finalState = result
      for (const d of list) {
        if (finalState[d].lastSyncAt !== null) {
          setErrors(e => {
            if (!(d in e)) return e
            const rest = { ...e }
            delete rest[d]
            return rest
          })
        }
      }
      // Un seul appel réseau a couvert 'charges' + 'fournisseurs' : aligne les horodatages.
      if (coalesceFournisseurs && finalState.charges.lastSyncAt !== null) {
        const ts = finalState.charges.lastSyncAt
        persistLastSync('fournisseurs', ts)
        finalState = { ...finalState, fournisseurs: { lastSyncAt: ts, syncing: false } }
      }
      setSyncState(finalState)
    } finally {
      runningRef.current = false
    }
  }, [])

  const forceSync = useCallback((domain?: SyncDomain) => {
    void runDomains(domain ? [domain] : SYNC_DOMAINS)
  }, [runDomains])

  const syncIfStale = useCallback((domain: SyncDomain) => {
    if (isStale(stateRef.current, domain)) void runDomains([domain])
  }, [runDomains])

  // Montage post-login : sync séquentielle de tous les domaines périmés.
  useEffect(() => {
    if (!user) { didInitialSyncRef.current = false; return }
    if (didInitialSyncRef.current) return
    didInitialSyncRef.current = true
    const stale = SYNC_DOMAINS.filter(d => isStale(stateRef.current, d))
    void runDomains(stale)
  }, [user, runDomains])

  // Retour d'onglet (document.hidden → false) : re-sync des domaines périmés.
  // Pas de polling par intervalle — uniquement cet évènement + montage + clic.
  useEffect(() => {
    function onVisibility() {
      if (document.hidden || !user) return
      const stale = SYNC_DOMAINS.filter(d => isStale(stateRef.current, d))
      void runDomains(stale)
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [user, runDomains])

  return (
    <SyncContext.Provider value={{ syncState, forceSync, syncIfStale, derniersNumeros, errors }}>
      {children}
    </SyncContext.Provider>
  )
}
