// Edge Function `ai-extract-deliveries` — Copilote B1 (ingestion + extraction).
// Lit une feuille de route (texte OU image/PDF via OCR Mistral) et PROPOSE des livraisons
// structurées en JSON. LECTURE SEULE STRICTE : n'écrit RIEN en base, ne crée aucune livraison,
// ne touche AUCUNE table. La clé Mistral n'est jamais logguée ni renvoyée au client.
// RGPD/UE : le document est envoyé à Mistral (UE) ; l'API ne réentraîne pas sur les données.
import { jsonResponse, optionsResponse } from '../_shared/cors.ts';
import { ExternalApiError } from '../_shared/http.ts';
import { generateJson, ocrDocument } from '../_shared/mistral.ts';

const SYSTEM_PROMPT =
  'Tu assistes une société de transport (MCA Logistics). À partir d\'une feuille de route, tu ' +
  'extrais les livraisons. Réponds STRICTEMENT en JSON valide, objet unique ' +
  '{ deliveries: [...] }. Chaque livraison : { client_name, type (un de: medical|ecommerce|retail|' +
  'particulier ou null), date (YYYY-MM-DD ou null), pickup_address, delivery_address, km (nombre|null), ' +
  'weight_kg (nombre|null), montant_ht_eur (nombre|null), heure (string|null), notes (string), ' +
  'missing (array des champs absents) }. N\'INVENTE RIEN : si une info n\'est pas écrite, mets null et ' +
  'ajoute le champ dans \'missing\'. Applique la date/chauffeur/véhicule d\'en-tête à chaque ligne si ' +
  'présents. Le mot JSON doit guider ta sortie.';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return optionsResponse();

  const apiKey = Deno.env.get('MISTRAL_API_KEY');
  if (!apiKey) return jsonResponse({ ok: false, error: 'missing MISTRAL_API_KEY' }, 500);

  let body: {
    text?: unknown;
    fileBase64?: unknown;
    mimeType?: unknown;
    instructions?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: 'invalid JSON body' }, 400);
  }

  const text = typeof body.text === 'string' ? body.text.trim() : '';
  const fileBase64 = typeof body.fileBase64 === 'string' ? body.fileBase64 : '';
  const mimeType = typeof body.mimeType === 'string' ? body.mimeType : '';
  const instructions = typeof body.instructions === 'string' ? body.instructions.trim() : '';

  try {
    // ── Détermine le texte source : OCR si fichier, sinon texte collé ──────────
    let sourceText: string;
    if (fileBase64 && mimeType) {
      const dataUrl = `data:${mimeType};base64,${fileBase64}`;
      const isPdf = mimeType === 'application/pdf';
      sourceText = await ocrDocument(apiKey, dataUrl, isPdf);
    } else if (text) {
      sourceText = text;
    } else {
      return jsonResponse({ ok: false, error: 'text or file required' }, 400);
    }

    const userPrompt =
      `FEUILLE DE ROUTE:\n${sourceText}\n\nPRÉCISIONS UTILISATEUR:\n${instructions || '—'}`;

    const result = await generateJson<{ deliveries: unknown[] }>(
      apiKey,
      SYSTEM_PROMPT,
      userPrompt,
    );

    return jsonResponse({
      ok: true,
      data: { deliveries: result.deliveries ?? [], raw_text: sourceText },
    });
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
