// Lecture de l'erreur d'une Edge Function — PUR (aucune DB, aucun DOM).
//
// Pourquoi : `supabase.functions.invoke` renvoie `data = null` dès que la
// fonction répond autre chose qu'un 2xx. Le corps `{ ok:false, error }` que
// l'Edge a pris soin d'écrire n'est alors lisible QUE dans `error.context`
// (l'objet Response brut). Sans ce détour, l'écran n'affichait que
// « Edge Function returned a non-2xx status code » — la cause réelle
// (taux de TVA refusé, ligne invalide…) était perdue.
//
// Deux familles d'échec, qui n'appellent pas la même réaction :
//   - `metier`    : la demande est refusée telle quelle (4xx de l'Edge, ou
//                   Pennylane qui répond 4xx relayé en 502). Réessayer à
//                   l'identique échouera encore : il faut corriger, donc
//                   montrer le message et NE RIEN changer au statut.
//   - `technique` : réseau coupé, délai dépassé, 5xx, 429. Réessayer plus
//                   tard peut réussir : c'est là que vaut le repli
//                   `sync_pending`.

export type NatureEchec = 'metier' | 'technique'

export interface ErreurEdge {
  /** Message lisible, prêt pour un toast. */
  message: string
  /** Statut HTTP de l'Edge (null si la requête n'a jamais abouti). */
  status: number | null
  nature: NatureEchec
  /** Code applicatif optionnel renvoyé par l'Edge (`code`). */
  code: string | null
  /** Corps JSON complet renvoyé par l'Edge, s'il existe. */
  corps: Record<string, unknown> | null
}

const MESSAGE_PAR_DEFAUT = 'Erreur inattendue du serveur.'

/**
 * Nature de l'échec d'après le statut HTTP de l'Edge et, s'il existe, le
 * statut de l'API tierce qu'elle a relayé (`status` dans le corps d'un 502).
 */
export function natureEchec(statusEdge: number | null, statusAmont: number | null = null): NatureEchec {
  if (statusEdge == null || statusEdge === 0) return 'technique'
  if (statusEdge === 408 || statusEdge === 429) return 'technique'
  if (statusEdge >= 400 && statusEdge < 500) return 'metier'
  // 502 = l'API tierce a répondu en erreur. Si ELLE a répondu 4xx (hors
  // 408/429), c'est un refus sur le fond : réessayer ne changera rien.
  if (statusEdge === 502 && statusAmont != null
      && statusAmont >= 400 && statusAmont < 500
      && statusAmont !== 408 && statusAmont !== 429) {
    return 'metier'
  }
  return 'technique'
}

/** Extrait un texte d'un détail d'API tierce (Pennylane renvoie `error`, `message` ou `errors`). */
function texteDetail(body: unknown): string | null {
  if (body == null) return null
  if (typeof body === 'string') return body.trim().slice(0, 300) || null
  if (typeof body !== 'object') return null
  const b = body as Record<string, unknown>
  for (const k of ['error', 'message', 'detail']) {
    if (typeof b[k] === 'string' && (b[k] as string).trim()) return (b[k] as string).trim()
  }
  if (Array.isArray(b.errors) && b.errors.length > 0) {
    return b.errors.map(e => typeof e === 'string' ? e : JSON.stringify(e)).join(' ; ').slice(0, 300)
  }
  return null
}

/**
 * Message lisible à partir du corps JSON renvoyé par l'Edge. Si l'Edge relaie
 * une erreur d'API tierce (`body`), le détail est ajouté au message.
 */
export function messageDepuisCorps(corps: unknown, secours = MESSAGE_PAR_DEFAUT): string {
  if (!corps || typeof corps !== 'object') {
    return typeof corps === 'string' && corps.trim() ? corps.trim().slice(0, 300) : secours
  }
  const c = corps as Record<string, unknown>
  const principal = typeof c.error === 'string' && c.error.trim() ? c.error.trim() : null
  const detail = texteDetail(c.body)
  if (principal && detail && !principal.includes(detail)) return `${principal} — ${detail}`
  return principal ?? detail ?? secours
}

/** Response « de type fetch » (duck typing : testable sans navigateur). */
interface ResponseLike {
  status: number
  clone?: () => ResponseLike
  text: () => Promise<string>
}

function estResponse(x: unknown): x is ResponseLike {
  return !!x && typeof x === 'object'
    && typeof (x as ResponseLike).status === 'number'
    && typeof (x as ResponseLike).text === 'function'
}

/**
 * Transforme le couple `{ data, error }` d'un `functions.invoke` en échec
 * lisible, ou `null` si l'appel a réussi (`error` nul et `data.ok !== false`).
 *
 * Asynchrone uniquement parce que le corps d'une Response se lit en async ;
 * aucune requête n'est émise.
 */
export async function lireErreurEdge(data: unknown, error: unknown): Promise<ErreurEdge | null> {
  // Réponse 2xx mais refus explicite `{ ok:false }` (compat anciennes Edge).
  if (!error) {
    if (data && typeof data === 'object' && (data as Record<string, unknown>).ok === false) {
      const corps = data as Record<string, unknown>
      return {
        message: messageDepuisCorps(corps),
        status: 200,
        nature: 'metier',
        code: typeof corps.code === 'string' ? corps.code : null,
        corps,
      }
    }
    return null
  }

  const ctx = (error as { context?: unknown }).context
  if (estResponse(ctx)) {
    let corps: Record<string, unknown> | null = null
    let brut = ''
    try {
      const lisible = typeof ctx.clone === 'function' ? ctx.clone() : ctx
      brut = await lisible.text()
      const parsed: unknown = brut ? JSON.parse(brut) : null
      corps = parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null
    } catch { /* corps non JSON : on garde le texte brut */ }
    const statusAmont = corps && typeof corps.status === 'number' ? corps.status : null
    return {
      message: corps
        ? messageDepuisCorps(corps, `Erreur ${ctx.status}`)
        : (brut.trim().slice(0, 300) || `Erreur ${ctx.status}`),
      status: ctx.status,
      nature: natureEchec(ctx.status, statusAmont),
      code: corps && typeof corps.code === 'string' ? corps.code : null,
      corps,
    }
  }

  // Pas de Response : la requête n'a jamais abouti (réseau, CORS, relais).
  const msg = error instanceof Error ? error.message : String(error)
  return {
    message: msg ? `Serveur injoignable : ${msg}` : 'Serveur injoignable.',
    status: null,
    nature: 'technique',
    code: null,
    corps: null,
  }
}
