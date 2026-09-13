// Edge Function `lire-facture` — lit une facture (OCR Mistral) et renvoie les
// champs qu'un libellé ne peut PAS contenir : litres, prix au litre, kilométrage.
//
// Complément, et non remplacement, de `shared/lib/lectureFacture.ts` : le type
// de carburant et le véhicule se déduisent du LIBELLÉ, instantanément, sans
// réseau ni clé d'API. Ce qui est déjà sûr ne repasse pas par l'IA.
//
// Garanties, alignées sur `suggest-categorie-ia` :
//   - Jamais d'application automatique : on renvoie une proposition, l'UI
//     l'affiche et l'utilisateur valide.
//   - Aucune valeur inventée : un champ absent de la facture revient `null`.
//     Mieux vaut un champ vide qu'un nombre plausible et faux.
//   - try/catch global → tous les champs à `null`, jamais une erreur bloquante.
//   - verify_jwt = true : la company de l'appelant vient du JWT, la charge doit
//     lui appartenir.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { jsonResponse, optionsResponse } from '../_shared/cors.ts'
import { generateJson, ocrDocument } from '../_shared/mistral.ts'

interface LectureIa {
  litres: number | null
  prix_par_litre: number | null
  kilometrage: number | null
  confiance: number
}

const VIDE = { litres: null, prix_par_litre: null, kilometrage: null, confiance: 0 }

const SEUIL_CONFIANCE = 0.7

/** Bornes de vraisemblance — au-delà, c'est une lecture ratée, pas une valeur. */
const MAX_LITRES = 500        // un fourgon 3,5 t a un réservoir de ~100 L
const MAX_PRIX_LITRE = 5      // €/L
const MAX_KM = 2_000_000

function borner(v: unknown, max: number): number | null {
  const n = Number(v)
  if (!Number.isFinite(n) || n <= 0 || n > max) return null
  return n
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

    const { data: charge } = await service
      .from('charges')
      .select('id, company_id, label, montant_ttc_cts, receipt_url')
      .eq('id', chargeId)
      .single()
    if (!charge || charge.company_id !== companyId) {
      return jsonResponse({ ok: false, error: 'charge introuvable' }, 404)
    }

    const receiptUrl = charge.receipt_url as string | null
    // Pas de justificatif : rien à lire. On le dit plutôt que d'appeler l'IA
    // sur un libellé, qui ne contient de toute façon ni litres ni kilométrage.
    if (!receiptUrl) {
      return jsonResponse({ ok: true, data: { ...VIDE, raison: 'aucun justificatif' } })
    }

    let texte = ''
    try {
      const isPdf = !/\.(png|jpe?g|webp|gif)(\?|$)/i.test(receiptUrl)
      texte = (await ocrDocument(apiKey, receiptUrl, isPdf)).slice(0, 8000)
    } catch {
      return jsonResponse({ ok: true, data: { ...VIDE, raison: 'justificatif illisible' } })
    }
    if (!texte.trim()) {
      return jsonResponse({ ok: true, data: { ...VIDE, raison: 'justificatif illisible' } })
    }

    const system = `Tu lis un ticket ou une facture pour une société de transport routier française.
Tu extrais UNIQUEMENT ce qui est écrit noir sur blanc. Tu n'estimes rien, tu ne calcules rien.
Si une information n'apparaît pas, réponds null pour ce champ.

- litres : volume de carburant servi (nombre, ex. 42.15)
- prix_par_litre : prix unitaire au litre en euros (nombre, ex. 1.859)
- kilometrage : compteur du véhicule s'il figure sur le document (entier)

Réponds UNIQUEMENT en JSON :
{"litres": <nombre|null>, "prix_par_litre": <nombre|null>, "kilometrage": <entier|null>, "confiance": <0 à 1>}`

    const userPrompt = [
      `Libellé : ${charge.label}`,
      charge.montant_ttc_cts != null
        ? `Total TTC attendu : ${(Number(charge.montant_ttc_cts) / 100).toFixed(2)} €` : null,
      `\nContenu du document :\n${texte}`,
    ].filter(Boolean).join('\n')

    const brut = await generateJson<LectureIa>(apiKey, system, userPrompt)
    const confiance = Number(brut?.confiance)
    const sure = Number.isFinite(confiance) && confiance >= SEUIL_CONFIANCE

    return jsonResponse({
      ok: true,
      data: {
        litres:         sure ? borner(brut?.litres, MAX_LITRES) : null,
        prix_par_litre: sure ? borner(brut?.prix_par_litre, MAX_PRIX_LITRE) : null,
        kilometrage:    sure ? borner(brut?.kilometrage, MAX_KM) : null,
        confiance: Number.isFinite(confiance) ? confiance : 0,
      },
    })
  } catch {
    // IA en panne, OCR KO, JSON illisible → aucune proposition, jamais d'erreur.
    return jsonResponse({ ok: true, data: VIDE })
  }
})
