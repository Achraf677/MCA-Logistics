// Edge Function `lire-facture` — lit une facture (vision Mistral) et renvoie les
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
import { generateJson, generateJsonFromImage, ocrDocument } from '../_shared/mistral.ts'
import { telechargerEnImage, urlFraichePennylane } from '../_shared/justificatif.ts'
import { ExternalApiError } from '../_shared/http.ts'

interface LectureIa {
  litres: number | null
  litres_confiance: number
  prix_par_litre: number | null
  prix_par_litre_confiance: number
  kilometrage: number | null
  kilometrage_confiance: number
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

  let body: { charge_id?: string; force?: boolean }
  try { body = await req.json() }
  catch { return jsonResponse({ ok: false, error: 'invalid JSON body' }, 400) }
  const chargeId = typeof body.charge_id === 'string' ? body.charge_id : ''
  if (!chargeId) return jsonResponse({ ok: false, error: 'charge_id requis' }, 400)
  // La file d'attente (auto) ne force jamais : elle veut le cache s'il existe.
  // Le bouton manuel « Lire le justificatif » force toujours une lecture
  // fraîche, quitte à écraser un ancien résultat.
  const force = body.force === true

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
      .select('id, company_id, label, montant_ttc_cts, receipt_url, pennylane_id, ocr_lecture')
      .eq('id', chargeId)
      .single()
    if (!charge || charge.company_id !== companyId) {
      return jsonResponse({ ok: false, error: 'charge introuvable' }, 404)
    }

    // Déjà lu : on renvoie le résultat mémorisé plutôt que de rappeler l'IA
    // pour rien. C'est précisément ce qui manquait — sans ce cache, chaque
    // rechargement de la file d'attente relisait TOUTES les factures encore
    // non rattachées, même celles déjà lues avec succès la veille.
    if (!force && charge.ocr_lecture) {
      return jsonResponse({ ok: true, data: charge.ocr_lecture })
    }

    // Écrit le résultat en cache si non vide — jamais pour un échec dû à une
    // panne d'API (429, timeout, erreur réseau) : celui-là doit rester
    // retentable au prochain chargement, ce n'est pas une propriété du
    // document.
    const persisterLecture = async (data: Record<string, unknown>) => {
      try { await service.from('charges').update({ ocr_lecture: data }).eq('id', chargeId) }
      catch (e) { console.error('lire-facture: échec écriture cache', chargeId, (e as Error)?.message) }
    }

    const receiptUrl = charge.receipt_url as string | null
    const pennylaneId = charge.pennylane_id as string | null
    // Pas de justificatif : rien à lire. On le dit plutôt que d'appeler l'IA
    // sur un libellé, qui ne contient de toute façon ni litres ni kilométrage.
    if (!receiptUrl && !pennylaneId) {
      const data = { ...VIDE, raison: 'aucun justificatif' }
      await persisterLecture(data)
      return jsonResponse({ ok: true, data })
    }

    const system = `Tu lis un ticket ou une facture pour une société de transport routier française.
Tu extrais UNIQUEMENT ce qui est écrit noir sur blanc. Tu n'estimes rien, tu ne calcules rien.
Si une information n'apparaît pas, réponds null pour ce champ.

- litres : volume de carburant servi (nombre, ex. 42.15)
- prix_par_litre : prix unitaire au litre en euros (nombre, ex. 1.859)
- kilometrage : compteur du véhicule s'il figure sur le document (entier) — souvent absent d'un ticket de station, c'est normal

Donne une confiance (0 à 1) SÉPARÉE pour chaque champ : un ticket qui n'affiche pas le kilométrage
ne doit pas faire douter de la lecture des litres, ce sont trois informations indépendantes.

Réponds UNIQUEMENT en JSON :
{"litres": <nombre|null>, "litres_confiance": <0 à 1>, "prix_par_litre": <nombre|null>, "prix_par_litre_confiance": <0 à 1>, "kilometrage": <entier|null>, "kilometrage_confiance": <0 à 1>}`

    const contexte = [
      `Libellé : ${charge.label}`,
      charge.montant_ttc_cts != null
        ? `Total TTC attendu : ${(Number(charge.montant_ttc_cts) / 100).toFixed(2)} €` : null,
    ].filter(Boolean).join('\n')

    // URL fraîche : celle stockée au sync est signée à durée limitée et expire.
    const urlFichier = (pennylaneId ? await urlFraichePennylane(pennylaneId) : null) ?? receiptUrl
    if (!urlFichier) {
      return jsonResponse({ ok: true, data: { ...VIDE, raison: 'justificatif introuvable' } })
    }

    // Échec d'appel à l'IA : 429 = « service surchargé » (jamais mis en cache,
    // c'est un incident d'infra, pas un verdict sur le document).
    const echecIa = (etape: string, e: unknown) => {
      console.error(
        `lire-facture: ${etape} a échoué`, chargeId, (e as Error)?.message,
        e instanceof ExternalApiError ? JSON.stringify(e.responseBody) : '',
      )
      const raison = e instanceof ExternalApiError && e.status === 429
        ? 'service surchargé' : 'justificatif illisible'
      return jsonResponse({ ok: true, data: { ...VIDE, raison } })
    }

    let brut: LectureIa
    const image = await telechargerEnImage(urlFichier)
    if (image.ok) {
      // Voie principale, gratuite : le modèle vision lit la photo directement.
      try {
        brut = await generateJsonFromImage<LectureIa>(
          apiKey, system, `${contexte}\n\nLe document à lire est l'image jointe.`, image.dataUrl,
        )
      } catch (e) {
        return echecIa('lecture vision', e)
      }
    } else if (image.raison === 'format non pris en charge') {
      // PDF sans photo (facture texte) : seul l'OCR Mistral sait le lire —
      // indisponible tant que le forfait ne l'inclut pas, d'où la voie vision.
      let texte = ''
      try {
        texte = (await ocrDocument(apiKey, urlFichier, true)).slice(0, 8000)
      } catch (e) {
        return echecIa('ocrDocument', e)
      }
      if (!texte.trim()) {
        const data = { ...VIDE, raison: 'justificatif illisible' }
        await persisterLecture(data)
        return jsonResponse({ ok: true, data })
      }
      brut = await generateJson<LectureIa>(apiKey, system, `${contexte}\n\nContenu du document :\n${texte}`)
    } else {
      console.error('lire-facture: justificatif non téléchargé', chargeId, image.raison)
      return jsonResponse({ ok: true, data: { ...VIDE, raison: image.raison } })
    }

    // Trois champs indépendants, trois seuils indépendants : un ticket qui ne
    // montre pas le kilométrage ne doit pas faire perdre des litres pourtant
    // lisibles sans ambiguïté. Un seul score global grillait les trois d'un
    // coup dès que l'un d'eux manquait — le cas le plus fréquent d'un ticket
    // de station, qui n'affiche presque jamais le compteur.
    const sur = (v: unknown): boolean => {
      const n = Number(v)
      return Number.isFinite(n) && n >= SEUIL_CONFIANCE
    }
    const litresConf = Number(brut?.litres_confiance)
    const prixConf = Number(brut?.prix_par_litre_confiance)
    const kmConf = Number(brut?.kilometrage_confiance)

    const data = {
      litres:         sur(litresConf) ? borner(brut?.litres, MAX_LITRES) : null,
      prix_par_litre: sur(prixConf) ? borner(brut?.prix_par_litre, MAX_PRIX_LITRE) : null,
      kilometrage:    sur(kmConf) ? borner(brut?.kilometrage, MAX_KM) : null,
      // Confiance globale renvoyée pour compat (non affichée côté front) :
      // la plus basse des trois parmi celles réellement fournies.
      confiance: [litresConf, prixConf, kmConf].filter(Number.isFinite).reduce(
        (min, v) => Math.min(min, v), 1,
      ),
    }
    console.log('lire-facture: lecture OK', chargeId, JSON.stringify(data))
    await persisterLecture(data)
    return jsonResponse({ ok: true, data })
  } catch (e) {
    // IA en panne, OCR KO, JSON illisible → aucune proposition, jamais d'erreur.
    console.error('lire-facture: échec global', chargeId, (e as Error)?.message)
    return jsonResponse({ ok: true, data: VIDE })
  }
})
