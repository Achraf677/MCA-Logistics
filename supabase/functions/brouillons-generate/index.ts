// Edge Function `brouillons-generate`
// Assistant de rédaction IA : reçoit une saisie libre + un type, renvoie un brouillon.
// RGPD v1 : AUCUNE donnée de la base n'est injectée — le prompt vient entièrement de
// l'utilisateur. N'écrit RIEN en base, ne lit AUCUNE table.
// La clé Mistral n'est jamais logguée ni renvoyée au client.
import { jsonResponse, optionsResponse } from '../_shared/cors.ts';
import { ExternalApiError } from '../_shared/http.ts';
import { generateText } from '../_shared/mistral.ts';

type DraftType = 'relance' | 'email' | 'annonce' | 'libre';

// Consigne commune à tous les types : pas d'invention, sortie directe.
const COMMON =
  ' Réponds uniquement le brouillon prêt à copier, en français, sans préambule ni explication, ' +
  "et sans inventer de noms, de montants ou de coordonnées qui ne sont pas fournis.";

const SYSTEM_PROMPTS: Record<DraftType, string> = {
  relance:
    'Tu rédiges une relance de paiement professionnelle et courtoise pour une société de transport.' +
    COMMON,
  email:
    'Tu rédiges un email client professionnel et clair pour une société de transport.' + COMMON,
  annonce:
    "Tu rédiges une annonce de recrutement attractive et professionnelle pour une société de transport." +
    COMMON,
  libre:
    "Tu es un assistant de rédaction professionnel pour une société de transport." + COMMON,
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return optionsResponse();

  const apiKey = Deno.env.get('MISTRAL_API_KEY');
  if (!apiKey) return jsonResponse({ ok: false, error: 'missing MISTRAL_API_KEY' }, 500);

  let body: { prompt?: unknown; type?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: 'invalid JSON body' }, 400);
  }

  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt) return jsonResponse({ ok: false, error: 'prompt is required' }, 400);

  const type: DraftType =
    typeof body.type === 'string' && body.type in SYSTEM_PROMPTS
      ? (body.type as DraftType)
      : 'libre';

  try {
    const text = await generateText(apiKey, SYSTEM_PROMPTS[type], prompt);
    return jsonResponse({ ok: true, data: { text } });
  } catch (err) {
    if (err instanceof ExternalApiError) {
      return jsonResponse(
        { ok: false, error: err.message, status: err.status, body: err.responseBody },
        502,
      );
    }
    return jsonResponse({ ok: false, error: (err as Error).message }, 500);
  }
});
