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

interface OcrResponse {
  pages?: Array<{ markdown?: string }>;
}

/**
 * OCR d'un document via Mistral (`mistral-ocr-latest`). `dataUrl` est une data-URL
 * complète (`data:<mime>;base64,…`). `isPdf` choisit le type de document attendu par l'API.
 * Renvoie le markdown concaténé de toutes les pages (chaîne vide si aucune).
 * Timeout long (60 s) : l'OCR d'un PDF multi-pages peut être lent.
 */
export async function ocrDocument(
  apiKey: string,
  dataUrl: string,
  isPdf: boolean,
): Promise<string> {
  const data = await fetchJson<OcrResponse>(`${BASE}/ocr`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: {
      model: 'mistral-ocr-latest',
      document: isPdf
        ? { type: 'document_url', document_url: dataUrl }
        : { type: 'image_url', image_url: dataUrl },
    },
    timeoutMs: 60_000,
  });
  return (data.pages ?? []).map((p) => p.markdown ?? '').join('\n\n');
}

/**
 * Comme generateText mais force une sortie JSON (`response_format: json_object`) et
 * la parse en T. Budget tokens élevé (4096) et timeout long (60 s) pour les extractions
 * structurées. Lance une erreur si le contenu n'est pas un JSON valide.
 */
export async function generateJson<T>(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<T> {
  const data = await fetchJson<MistralResponse>(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: {
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
      max_tokens: 4096,
    },
    timeoutMs: 60_000,
  });
  const content = data.choices?.[0]?.message?.content ?? '';
  return JSON.parse(content) as T;
}
