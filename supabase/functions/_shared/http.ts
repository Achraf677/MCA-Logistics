export interface FetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
}

export class ExternalApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly responseBody?: unknown,
  ) {
    super(message);
    this.name = 'ExternalApiError';
  }
}

// Le forfait gratuit Mistral répond 429 (Too Many Requests) sous une charge que
// l'appelant ne maîtrise pas toujours (file d'attente qui lit plusieurs
// justificatifs à la suite). Un 429 veut dire « réessaie sous peu », jamais
// « ça ne marchera jamais » — sans retry, une simple rafale de quelques
// factures suffisait à faire échouer TOUTES les lectures OCR d'un coup.
const RETRY_DELAYS_MS = [2_000, 4_000];

function attendre(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function tenterUneFois<T>(url: string, opts: Required<Pick<FetchOptions, 'method' | 'headers' | 'timeoutMs'>> & Pick<FetchOptions, 'body'>): Promise<T> {
  const { method, headers, body, timeoutMs } = opts;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    const message = err instanceof Error && err.name === 'AbortError'
      ? `External API timeout after ${timeoutMs}ms`
      : `External API unreachable: ${(err as Error).message}`;
    throw new ExternalApiError(message);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const raw = await response.text();
    let body: unknown = raw;
    try { body = JSON.parse(raw); } catch { /* garde le texte brut */ }
    throw new ExternalApiError(`External API ${response.status}`, response.status, body);
  }

  // Certaines réponses (ex. PUT finalize) peuvent être vides : tolérer un corps non-JSON.
  const raw = await response.text();
  return (raw ? JSON.parse(raw) : null) as T;
}

export async function fetchJson<T>(url: string, opts: FetchOptions = {}): Promise<T> {
  const { method = 'GET', headers = {}, body, timeoutMs = 10_000 } = opts;

  for (let tentative = 0; ; tentative++) {
    try {
      return await tenterUneFois<T>(url, { method, headers, body, timeoutMs });
    } catch (err) {
      const estLimiteDeTaux = err instanceof ExternalApiError && err.status === 429;
      if (!estLimiteDeTaux || tentative >= RETRY_DELAYS_MS.length) throw err;
      await attendre(RETRY_DELAYS_MS[tentative]);
    }
  }
}
