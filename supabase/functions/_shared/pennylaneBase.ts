// Accès de base à l'API Pennylane V2 (URL, token, en-têtes) — source unique, sans autre dépendance :
// `pennylane.ts` le ré-exporte, les Edge légères (dépôt de justificatif) l'importent directement.
/** URL de base Pennylane V2 — source unique dans tout le repo. */
export const PENNYLANE_BASE = 'https://app.pennylane.com/api/external/v2';

/** Lit PENNYLANE_API_TOKEN depuis Deno.env. Lève une erreur si absent.
 *  Point d'entrée unique — aucune autre Edge Function ne lit Deno.env('PENNYLANE…'). */
export function pennylaneToken(): string {
  const t = Deno.env.get('PENNYLANE_API_TOKEN');
  if (!t) throw new Error('PENNYLANE_API_TOKEN manquant');
  return t;
}

/** Headers Bearer + flag API 2026, à passer à chaque appel Pennylane. */
export function pennylaneHeaders(token: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${token}`,
    // Migration API 2026 : phase cleanup à partir du 01/07/2026.
    'X-Use-2026-API-Changes': 'true',
  };
}
