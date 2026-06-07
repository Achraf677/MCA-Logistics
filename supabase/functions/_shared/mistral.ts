// Client API Mistral (côté Edge Function uniquement) — version unifiée partagée.
// La clé n'est JAMAIS logguée : header `Authorization: Bearer`.
// Couvre tous les usages : generateText (température paramétrable, défaut 0.7),
// ocrDocument (OCR feuilles de route), generateJson (sortie JSON stricte).
import { fetchJson } from './http.ts';

const BASE = 'https://api.mistral.ai/v1';
const MODEL = 'mistral-large-latest';

interface MistralResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

export interface GenerateOptions {
  temperature?: number;
  maxTokens?: number;
}

export async function generateText(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  opts: GenerateOptions = {},
): Promise<string> {
  const { temperature = 0.7, maxTokens = 1024 } = opts;
  const data = await fetchJson<MistralResponse>(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: {
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature,
      max_tokens: maxTokens,
    },
    timeoutMs: 30_000,
  });
  return data.choices?.[0]?.message?.content ?? '';
}

interface OcrResponse {
  pages?: Array<{ markdown?: string }>;
}

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
