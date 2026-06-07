// Edge Function `ai-extract-deliveries` — Copilote B1 (ingestion + extraction).
// Lit une feuille de route (texte OU image/PDF via OCR Mistral) et PROPOSE des livraisons
// structurées en JSON. LECTURE SEULE STRICTE : n'écrit RIEN en base, ne crée aucune livraison,
// ne touche AUCUNE table. La clé Mistral n'est jamais logguée ni renvoyée au client.
// RGPD/UE : le document est envoyé à Mistral (UE) ; l'API ne réentraîne pas sur les données.
import { jsonResponse, optionsResponse } from '../_shared/cors.ts';
import { ExternalApiError } from '../_shared/http.ts';
import { generateJson, ocrDocument } from '../_shared/mistral.ts';
const SYSTEM_PROMPT = 'Tu assistes une société de transport (MCA Logistics). À partir d\'une feuille de route, tu ' + 'extrais les livraisons. Réponds STRICTEMENT en JSON valide, objet unique ' + '{ deliveries: [...] }. Chaque livraison : { client_name, type (un de: medical|ecommerce|retail|' + 'particulier ou null), date (YYYY-MM-DD ou null), pickup_address, delivery_address, km (nombre|null), ' + 'weight_kg (nombre|null), montant_ht_eur (nombre|null), heure (string|null), ' + 'driver_name (string|null), vehicle (string|null = plaque OU nom du véhicule), notes (string), ' + 'missing (array des champs absents) }. N\'INVENTE RIEN : si une info n\'est pas écrite, mets null et ' + 'ajoute le champ dans \'missing\'. Applique la date/chauffeur/véhicule d\'en-tête à chaque ligne si ' + 'présents. RÈGLE DATES : pour toute date écrite sans année (ex. "06/06", "6 juin"), utilise ' + 'IMPÉRATIVEMENT l\'année de la DATE DU JOUR fournie dans le message ; n\'utilise JAMAIS une année ' + 'passée par défaut. Les dates relatives ("aujourd\'hui", "demain", "ce lundi") se calculent par ' + 'rapport à la DATE DU JOUR. Sortie toujours au format YYYY-MM-DD. Le mot JSON doit guider ta sortie.';
Deno.serve(async (req)=>{
  if (req.method === 'OPTIONS') return optionsResponse();
  const apiKey = Deno.env.get('MISTRAL_API_KEY');
  if (!apiKey) return jsonResponse({
    ok: false,
    error: 'missing MISTRAL_API_KEY'
  }, 500);
  let body;
  try {
    body = await req.json();
  } catch  {
    return jsonResponse({
      ok: false,
      error: 'invalid JSON body'
    }, 400);
  }
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  const fileBase64 = typeof body.fileBase64 === 'string' ? body.fileBase64 : '';
  const mimeType = typeof body.mimeType === 'string' ? body.mimeType : '';
  const instructions = typeof body.instructions === 'string' ? body.instructions.trim() : '';
  try {
    // ── Détermine le texte source : OCR si fichier, sinon texte collé ──────────
    let sourceText;
    if (fileBase64 && mimeType) {
      const dataUrl = `data:${mimeType};base64,${fileBase64}`;
      const isPdf = mimeType === 'application/pdf';
      sourceText = await ocrDocument(apiKey, dataUrl, isPdf);
    } else if (text) {
      sourceText = text;
    } else {
      return jsonResponse({
        ok: false,
        error: 'text or file required'
      }, 400);
    }
    // Date du jour (Europe/Paris) pour ancrer l'année des dates sans année explicite.
    const today = new Intl.DateTimeFormat('fr-CA', {
      timeZone: 'Europe/Paris'
    }).format(new Date());
    const userPrompt = `DATE DU JOUR (Europe/Paris): ${today}\n\nFEUILLE DE ROUTE:\n${sourceText}\n\nPRÉCISIONS UTILISATEUR:\n${instructions || '—'}`;
    const result = await generateJson(apiKey, SYSTEM_PROMPT, userPrompt);
    return jsonResponse({
      ok: true,
      data: {
        deliveries: result.deliveries ?? [],
        raw_text: sourceText
      }
    });
  } catch (err) {
    if (err instanceof ExternalApiError) {
      return jsonResponse({
        ok: false,
        error: err.message,
        status: err.status,
        body: err.responseBody
      }, 502);
    }
    return jsonResponse({
      ok: false,
      error: err.message
    }, 500);
  }
});
