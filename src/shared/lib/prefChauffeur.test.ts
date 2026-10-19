import { describe, expect, it, beforeEach, vi } from 'vitest'
import { APP_NAV_DEFAUT, ecrireAppNavigation, lireAppNavigation } from './prefChauffeur'

describe('application de navigation du chauffeur', () => {
  beforeEach(() => {
    const m = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => { m.set(k, v) },
    })
  })

  it('Waze par défaut', () => {
    expect(APP_NAV_DEFAUT).toBe('waze')
    expect(lireAppNavigation()).toBe('waze')
  })
  it('le choix du chauffeur est gardé et prime sur le défaut', () => {
    ecrireAppNavigation('google')
    expect(lireAppNavigation()).toBe('google')
  })
})
