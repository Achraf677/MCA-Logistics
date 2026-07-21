// Edge Function `suggest-categorie-ia` — suggestion de catégorie par IA (Mistral).
// COMPLÉMENT de l'heuristique F1 (fournisseur dominant) : lit le justificatif
// (OCR du receipt_url si présent) + les métadonnées de la charge, et classe
// STRICTEMENT dans une catégorie existante, ou répond "inconnu".
//
// Garanties :
//   - Jamais d'application automatique : on renvoie une suggestion, l'UI l'affiche.
//   - Seuil de confiance 0.7 : en dessous → { category_id: null } (pas de bruit).
//   - try/catch global → { category_id: null } (l'IA en panne = pas de suggestion,
//     jamais une erreur bloquante côté UI).
//   - verify_jwt = true : company de l'appelant déduite du JWT, la charge doit
//     appartenir à cette company.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { jsonResponse, optionsResponse } from '../_shared/cors.ts'
import { generateJson, ocrDocument } from '../_shared/mistral.ts'

const SEUIL_CONFIANCE = 0.7

interface AiClassification {
  categorie: string
  confiance: number
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return optionsResponse()

  const apiKey = Deno.env.get('MISTRAL_API_KEY')
  if (!apiKey) return jsonResponse({ ok: false, error: 'missing MISTRAL_API_KEY' }, 500)

  let body: { charge_id?: string }
  try { body = await req.json() }
  catch { return jsonResponse({ ok: false, error: 'invalid JSON body' }, 400) }
  const chargeId = typeof body.charge_id === 'string' ? body.charge_id : ''
  if (!chargeId) return jsonResponse({ ok: false, error: 'charge_id requis' }, 400)

  try {
    const url = Deno.env.get('SUPABASE_URL')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const svcKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!url || !anonKey || !svcKey) {
      return jsonResponse({ ok: false, error: 'server misconfiguration' }, 500)
    }

    // Auth JWT → company de l'appelant (jamais depuis le body).
    const authHeader = req.headers.get('Authorization') ?? ''
    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    })
    const { data: { user }, error: uErr } = await userClient.auth.getUser()
    if (uErr || !user) return jsonResponse({ ok: false, error: 'invalid session' }, 401)

    const service = createClient(url, svcKey, { auth: { persistSession: false } })
    const { data: me } = await service
      .from('profiles').select('company_id').eq('id', user.id).single()
    const companyId = me?.company_id as string | undefined
    if (!companyId) return jsonResponse({ ok: false, error: 'société introuvable' }, 400)

    // Charge + garde company.
    const { data: charge } = await service
      .from('charges')
      .select('id, company_id, label, montant_ttc_cts, receipt_url, suppliers!supplier_id(name)')
      .eq('id', chargeId)
      .single()
    if (!charge || charge.company_id !== companyId) {
      return jsonResponse({ ok: false, error: 'charge introuvable' }, 404)
    }

    // Catégories existantes (la seule liste autorisée pour le classement).
    const { data: categories } = await service
      .from('charge_categories')
      .select('id, name')
      .eq('company_id', companyId)
      .order('name')
    const cats = (categories ?? []) as { id: string; name: string }[]
    if (cats.length === 0) {
      return jsonResponse({ ok: true, data: { category_id: null, confiance: 0 } })
    }

    // Justificatif : OCR best-effort (échec = on classe sur les métadonnées).
    let justifTexte = ''
    const receiptUrl = charge.receipt_url as string | null
    if (receiptUrl) {
      try {
        const isPdf = !/\.(png|jpe?g|webp|gif)(\?|$)/i.test(receiptUrl)
        justifTexte = (await ocrDocument(apiKey, receiptUrl, isPdf)).slice(0, 6000)
      } catch { /* OCR indisponible : métadonnées seules */ }
    }

    const supplierName =
      (charge.suppliers as { name?: string } | null)?.name ?? null

    const system = `Tu es un assistant comptable pour une société de transport routier français.
Tu dois classer une charge (facture fournisseur) dans UNE catégorie comptable.
Les SEULES catégories autorisées sont (réponds avec le nom EXACT) :
${cats.map(c => `- ${c.name}`).join('\n')}
Si tu n'es pas raisonnablement sûr, réponds "inconnu".
Réponds UNIQUEMENT en JSON : {"categorie": "<nom exact ou inconnu>", "confiance": <0 à 1>}`

    const userPrompt = [
      `Libellé : ${charge.label}`,
      supplierName ? `Fournisseur : ${supplierName}` : null,
      charge.montant_ttc_cts != null
        ? `Montant TTC : ${(Number(charge.montant_ttc_cts) / 100).toFixed(2)} €` : null,
      justifTexte ? `\nContenu du justificatif (OCR) :\n${justifTexte}` : null,
    ].filter(Boolean).join('\n')

    const raw = await generateJson<AiClassification>(apiKey, system, userPrompt)

    // Mapping STRICT nom → id (insensible à la casse/espaces). Tout ce qui ne
    // matche pas une catégorie existante = "inconnu" = pas de suggestion.
    const norm = (s: string) => s.trim().toLowerCase()
    const confiance = Number(raw?.confiance)
    const matched = cats.find(c => norm(c.name) === norm(String(raw?.categorie ?? '')))
    const category_id =
      matched && Number.isFinite(confiance) && confiance >= SEUIL_CONFIANCE
        ? matched.id
        : null

    return jsonResponse({
      ok: true,
      data: { category_id, confiance: Number.isFinite(confiance) ? confiance : 0 },
    })
  } catch {
    // L'IA en panne / OCR KO / JSON illisible → pas de suggestion, jamais d'erreur.
    return jsonResponse({ ok: true, data: { category_id: null, confiance: 0 } })
  }
})
