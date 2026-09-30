import { describe, it, expect } from 'vitest'
import { lireErreurEdge, messageDepuisCorps, natureEchec } from './erreurEdge'

/** Imite l'erreur FunctionsHttpError de supabase-js : `context` = Response. */
function erreurHttp(status: number, corps: unknown) {
  const body = typeof corps === 'string' ? corps : JSON.stringify(corps)
  return Object.assign(new Error('Edge Function returned a non-2xx status code'), {
    context: new Response(body, { status }),
  })
}

describe('natureEchec', () => {
  it('4xx de l’Edge = métier', () => {
    expect(natureEchec(400)).toBe('metier')
    expect(natureEchec(403)).toBe('metier')
    expect(natureEchec(409)).toBe('metier')
    expect(natureEchec(422)).toBe('metier')
  })
  it('408 / 429 = technique (réessayable)', () => {
    expect(natureEchec(408)).toBe('technique')
    expect(natureEchec(429)).toBe('technique')
  })
  it('pas de statut ou 5xx = technique', () => {
    expect(natureEchec(null)).toBe('technique')
    expect(natureEchec(0)).toBe('technique')
    expect(natureEchec(500)).toBe('technique')
    expect(natureEchec(503)).toBe('technique')
  })
  it('502 relayant un 4xx amont = métier ; 5xx / 429 / inconnu amont = technique', () => {
    expect(natureEchec(502, 422)).toBe('metier')
    expect(natureEchec(502, 400)).toBe('metier')
    expect(natureEchec(502, 429)).toBe('technique')
    expect(natureEchec(502, 500)).toBe('technique')
    expect(natureEchec(502, null)).toBe('technique')
  })
})

describe('messageDepuisCorps', () => {
  it('prend `error`', () => {
    expect(messageDepuisCorps({ ok: false, error: 'taux TVA non standard' })).toBe('taux TVA non standard')
  })
  it('ajoute le détail amont (`body.message`)', () => {
    expect(messageDepuisCorps({ error: 'External API 422', body: { message: 'vat_rate invalide' } }))
      .toBe('External API 422 — vat_rate invalide')
  })
  it('détail amont en liste `errors`', () => {
    expect(messageDepuisCorps({ error: 'External API 422', body: { errors: ['a', 'b'] } }))
      .toBe('External API 422 — a ; b')
  })
  it('corps vide ou non objet → secours', () => {
    expect(messageDepuisCorps(null, 'X')).toBe('X')
    expect(messageDepuisCorps({}, 'X')).toBe('X')
    expect(messageDepuisCorps('texte brut')).toBe('texte brut')
  })
})

describe('lireErreurEdge', () => {
  it('succès → null', async () => {
    expect(await lireErreurEdge({ ok: true }, null)).toBeNull()
    expect(await lireErreurEdge(null, null)).toBeNull()
  })

  it('2xx mais ok:false → métier avec message', async () => {
    const e = await lireErreurEdge({ ok: false, error: 'refus', code: 'X' }, null)
    expect(e).toMatchObject({ message: 'refus', nature: 'metier', code: 'X' })
  })

  it('non-2xx : lit le JSON de error.context', async () => {
    const e = await lireErreurEdge(null, erreurHttp(422, { ok: false, error: 'ligne supp. "Attente" : HT invalide' }))
    expect(e).toMatchObject({ message: 'ligne supp. "Attente" : HT invalide', status: 422, nature: 'metier' })
  })

  it('502 relayant un 422 Pennylane → métier + détail', async () => {
    const e = await lireErreurEdge(null, erreurHttp(502, {
      ok: false, error: 'External API 422', status: 422, body: { error: 'Invalid vat_rate' },
    }))
    expect(e?.nature).toBe('metier')
    expect(e?.message).toBe('External API 422 — Invalid vat_rate')
  })

  it('502 sans statut amont (timeout) → technique', async () => {
    const e = await lireErreurEdge(null, erreurHttp(502, { ok: false, error: 'External API timeout after 10000ms' }))
    expect(e?.nature).toBe('technique')
  })

  it('code applicatif remonté', async () => {
    const e = await lireErreurEdge(null, erreurHttp(500, { ok: false, error: 'x', code: 'enregistrement_echoue' }))
    expect(e?.code).toBe('enregistrement_echoue')
    expect(e?.nature).toBe('technique')
  })

  it('corps non JSON → texte brut', async () => {
    const e = await lireErreurEdge(null, erreurHttp(500, 'Internal Server Error'))
    expect(e?.message).toBe('Internal Server Error')
    expect(e?.corps).toBeNull()
  })

  it('sans Response (réseau) → technique', async () => {
    const e = await lireErreurEdge(null, new Error('Failed to fetch'))
    expect(e).toMatchObject({ nature: 'technique', status: null })
    expect(e?.message).toContain('Failed to fetch')
  })
})
