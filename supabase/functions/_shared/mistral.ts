// Client API Mistral (côté Edge Function uniquement).
// La clé n'est JAMAIS logguée : elle passe par le header `Authorization: Bearer`.
// Toute erreur API remonte via ExternalApiError (status + responseBody) pour que
// l'appelant renvoie un { ok:false } avec le bon code HTTP.
// RGPD/UE : Mistral est un fournisseur européen ; l'API ne réentraîne pas sur les données.
import { fetchJson } from './http.ts';

const BASE = 'https://api.mistral.ai/v1';
const MODEL = 'mistral-large-latest';

interface MistralResponse {
  choices?: Array<{
    message?: { content?: string };
  }>;
}

/** Génère un texte via Mistral. Renvoie le contenu du premier choix (chaîne vide si aucun). */
export async function generateText(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const data = await fetchJson<MistralResponse>(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: {
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 1024,
    },
  });
  return data.choices?.[0]?.message?.content ?? '';
}
