// Edge Function `lire-releve` — lit un RELEVÉ de carte carburant (une facture,
// plusieurs pleins) et renvoie la liste des transactions, SANS AUCUN MODÈLE de
// fournisseur : Fleet Pro aujourd'hui, Carte Total, AS24 ou DKV demain, l'IA
// ramène chaque relevé au même format. Rien n'est écrit en base : le front
// affiche un tableau modifiable, l'utilisateur vérifie, puis crée les pleins.
//
// Deux voies de lecture, gratuites toutes les deux :
//   - PDF texte (relevé généré par ordinateur, cas le plus courant) : le texte
//     est extrait côté serveur (unpdf), puis analysé par le modèle texte ;
//   - photo / scan : les images sont envoyées au modèle vision.
// Contrôle de somme fait côté front (releve.logic.ts) contre le total facture.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { extractText, getDocumentProxy } from 'npm:unpdf@0.12.1'
import { jsonResponse, optionsResponse } from '../_shared/cors.ts'
import { generateJson, generateJsonFromImage } from '../_shared/mistral.ts'
import {
  detecterImage, estPdf, jpegsDuPdf, telechargerFichier, urlFraichePennylane, versDataUrl,
} from '../_shared/justificatif.ts'
import { ExternalApiError } from '../_shared/http.ts'

interface Releve {
  lignes?: unknown[]
  total_ttc?: unknown
}

/** En dessous, le PDF n'a pas de vraie couche texte : c'est un scan. */
const TEXTE_MIN = 80

const SYSTEM = `Tu lis le RELEVÉ d'une carte carburant professionnelle (Fleet Pro, Carte Total, AS24, DKV, ou autre) pour une société de transport routier française.
Le relevé liste plusieurs transactions. Tu extrais CHAQUE transaction, une ligne par transaction, sans en oublier ni en inventer.
Tu recopies ce qui est écrit : tu n'estimes rien, tu ne calcules rien. Un champ absent vaut null.

Pour chaque ligne :
- date : date de la transaction au format AAAA-MM-JJ
- station : nom / ville de la station
- produit : le produit tel qu'écrit (ex. "Gazole", "SP95-E10", "AdBlue", "Lavage", "Frais de gestion", "Cotisation carte")
- litres : quantité en litres (nombre) — null pour un frais ou un service
- prix_litre : prix unitaire TTC au litre en euros (nombre)
- montant_ttc : montant TTC de la ligne en euros (nombre, obligatoire)
- plaque : immatriculation si indiquée (ex. "FG-788-FB")
- carte : numéro ou libellé de carte si indiqué
- kilometrage : kilométrage saisi à la pompe si indiqué (entier)

Les frais (gestion, cotisation, service) sont AUSSI des lignes : ils font partie du total.
total_ttc : le total TTC du relevé tel qu'imprimé.

Réponds UNIQUEMENT en JSON :
{"lignes": [{"date": ..., "station": ..., "produit": ..., "litres": ..., "prix_litre": ..., "montant_ttc": ..., "plaque": ..., "carte": ..., "kilometrage": ...}], "total_ttc": <nombre|null>}`

async function texteDuPdf(octets: Uint8Array): Promise<string> {
  try {
    const pdf = await getDocumentProxy(octets)
    const { text } = await extractText(pdf, { mergePages: true })
    return (Array.isArray(text) ? text.join('\n') : text ?? '').trim()
  } catch (e) {
    console.error('lire-releve: extraction texte PDF impossible', (e as Error)?.message)
    return ''
  }
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

    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
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
      .select('id, company_id, label, montant_ttc_cts, receipt_url, pennylane_id')
      .eq('id', chargeId)
      .single()
    if (!charge || charge.company_id !== companyId) {
      return jsonResponse({ ok: false, error: 'charge introuvable' }, 404)
    }

    const pennylaneId = charge.pennylane_id as string | null
    const urlFichier = (pennylaneId ? await urlFraichePennylane(pennylaneId) : null)
      ?? (charge.receipt_url as string | null)
    if (!urlFichier) return jsonResponse({ ok: false, error: 'aucun justificatif' })

    const fichier = await telechargerFichier(urlFichier)
    if (!fichier.ok) return jsonResponse({ ok: false, error: fichier.raison })
    const { octets, type } = fichier

    const contexte = [
      `Libellé de la facture : ${charge.label}`,
      charge.montant_ttc_cts != null
        ? `Total TTC attendu : ${(Number(charge.montant_ttc_cts) / 100).toFixed(2)} €` : null,
    ].filter(Boolean).join('\n')

    let releve: Releve
    let source: 'texte' | 'image'
    try {
      const typeImage = type.startsWith('image/') ? type : detecterImage(octets)
      const texte = !typeImage && estPdf(octets) ? await texteDuPdf(octets) : ''
      if (texte.length >= TEXTE_MIN) {
        source = 'texte'
        releve = await generateJson<Releve>(
          apiKey, SYSTEM, `${contexte}\n\nContenu du relevé :\n${texte.slice(0, 30_000)}`,
        )
      } else {
        const images = typeImage
          ? [versDataUrl(octets, typeImage)]
          : estPdf(octets) ? jpegsDuPdf(octets, 6).map(j => versDataUrl(j, 'image/jpeg')) : []
        if (images.length === 0) return jsonResponse({ ok: false, error: 'format non pris en charge' })
        source = 'image'
        releve = await generateJsonFromImage<Releve>(
          apiKey, SYSTEM, `${contexte}\n\nLe relevé est dans les images jointes (une par page).`, images, 4096,
        )
      }
    } catch (e) {
      console.error(
        'lire-releve: lecture IA impossible', chargeId, (e as Error)?.message,
        e instanceof ExternalApiError ? JSON.stringify(e.responseBody) : '',
      )
      const surcharge = e instanceof ExternalApiError && e.status === 429
      return jsonResponse({ ok: false, error: surcharge ? 'service surchargé' : 'relevé illisible' })
    }

    const lignes = Array.isArray(releve?.lignes) ? releve.lignes : []
    const total = Number(releve?.total_ttc)
    console.log('lire-releve: lecture OK', chargeId, source, lignes.length, 'lignes')
    return jsonResponse({
      ok: true,
      data: { lignes, total_ttc: Number.isFinite(total) ? total : null, source },
    })
  } catch (e) {
    console.error('lire-releve: échec global', chargeId, (e as Error)?.message)
    return jsonResponse({ ok: false, error: 'relevé illisible' })
  }
})
