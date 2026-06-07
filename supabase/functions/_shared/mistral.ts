// Client API Mistral (côté Edge Function uniquement).
// La clé n'est JAMAIS logguée : header `Authorization: Bearer`.
// Température basse (0.3) : briefing factuel, pas de créativité.
import { fetchJson } from './http.ts';
const BASE = 'https://api.mistral.ai/v1';
const MODEL = 'mistral-large-latest';
export async function generateText(apiKey, systemPrompt, userPrompt) {
  const data = await fetchJson(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`
    },
    body: {
      model: MODEL,
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: userPrompt
        }
      ],
      temperature: 0.3,
      max_tokens: 900
    },
    timeoutMs: 30_000
  });
  return data.choices?.[0]?.message?.content ?? '';
}
