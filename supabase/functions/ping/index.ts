import { jsonResponse, optionsResponse } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse();

  return jsonResponse({ ok: true, ts: new Date().toISOString() });
});
