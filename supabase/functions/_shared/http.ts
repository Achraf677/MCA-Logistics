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

export async function fetchJson<T>(url: string, opts: FetchOptions = {}): Promise<T> {
  const { method = 'GET', headers = {}, body, timeoutMs = 10_000 } = opts;

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
    // Le corps HTTP ne se lit qu'une fois : on lit en texte puis on tente JSON.
    const raw = await response.text();
    let body: unknown = raw;
    try { body = JSON.parse(raw); } catch { /* garde le texte brut */ }
    throw new ExternalApiError(`External API ${response.status}`, response.status, body);
  }

  // Certaines réponses (ex. PUT finalize) peuvent être vides : tolérer un corps non-JSON.
  const raw = await response.text();
  return (raw ? JSON.parse(raw) : null) as T;
}
