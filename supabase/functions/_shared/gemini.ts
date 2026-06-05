// Client API Google Gemini (côté Edge Function uniquement).
// La clé n'est JAMAIS dans l'URL ni logguée : elle passe par le header `x-goog-api-key`.
// Toute erreur API remonte via ExternalApiError (status + responseBody) pour que
// l'appelant renvoie un { ok:false } avec le bon code HTTP.
import { fetchJson } from './http.ts';

const BASE = 'https://generativelanguage.googleapis.com/v1beta';
const MODEL = 'gemini-2.5-flash';

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
}

/** Génère un texte via Gemini. Renvoie le texte concaténé des parts (chaîne vide si aucune). */
export async function generateText(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const data = await fetchJson<GeminiResponse>(
    `${BASE}/models/${MODEL}:generateContent`,
    {
      method: 'POST',
      headers: { 'x-goog-api-key': apiKey },
      body: {
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
      },
    },
  );
  return data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
}
