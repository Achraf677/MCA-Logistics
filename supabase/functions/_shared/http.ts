export class ExternalApiError extends Error {
  status;
  responseBody;
  constructor(message, status, responseBody){
    super(message);
    this.status = status;
    this.responseBody = responseBody;
    this.name = 'ExternalApiError';
  }
}
export async function fetchJson(url, opts = {}) {
  const { method = 'GET', headers = {}, body, timeoutMs = 10_000 } = opts;
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });
  } catch (err) {
    clearTimeout(timer);
    const message = err instanceof Error && err.name === 'AbortError' ? `External API timeout after ${timeoutMs}ms` : `External API unreachable: ${err.message}`;
    throw new ExternalApiError(message);
  } finally{
    clearTimeout(timer);
  }
  if (!response.ok) {
    const raw = await response.text();
    let parsed = raw;
    try {
      parsed = JSON.parse(raw);
    } catch  {}
    throw new ExternalApiError(`External API ${response.status}`, response.status, parsed);
  }
  const raw = await response.text();
  return raw ? JSON.parse(raw) : null;
}
