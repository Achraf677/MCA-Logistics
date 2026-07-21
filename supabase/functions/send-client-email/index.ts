// Edge Function `send-client-email` — envoie au client, par email, la facture
// Pennylane ORIGINALE (PDF officiel) + le BL (lettre de voiture) en pièces
// jointes RÉELLES. verify_jwt=true. Aucune écriture destructive.
//
// Canal : Gmail API via l'infra Google OAuth serveur EXISTANTE
// (google_drive_tokens.refresh_token). L'email part de l'adresse Google
// connectée (@mcalogistics.fr). Prérequis Achraf : scope `gmail.send` ajouté
// (fait dans drive-oauth-start) + RECONNEXION du Drive pour régénérer un
// refresh_token incluant Gmail.
//
// Pièces jointes :
//   (a) Facture : téléchargée via l'API Pennylane (file_url signée, jamais la
//       copie stockée).
//   (b) BL : téléchargé depuis Google Drive (documents.drive_file_id, catégorie
//       'LV') via le même access token Google. Absent → on n'attache que la
//       facture et on le signale dans la réponse.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } })

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const PENNYLANE_BASE = 'https://app.pennylane.com/api/external/v2'

// ── Composition email (dupliquée depuis src/features/livraisons/emailClient.logic.ts) ─
function formatEuros(cts: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency', currency: 'EUR',
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(cts / 100)
}
function composeSubject(invoiceNumber: string | null): string {
  const num = (invoiceNumber ?? '').trim()
  return num ? `Facture ${num} — MCA Logistics` : `Votre facture — MCA Logistics`
}
function composeBody(input: {
  invoiceNumber: string | null; clientName: string | null
  amountTtcCts?: number | null; hasBl: boolean
}): string {
  const greeting = input.clientName?.trim() ? `Bonjour ${input.clientName.trim()},` : 'Bonjour,'
  const num = (input.invoiceNumber ?? '').trim()
  const objetLigne = num ? `Veuillez trouver ci-joint votre facture ${num}` : 'Veuillez trouver ci-joint votre facture'
  const montantLigne = input.amountTtcCts != null && input.amountTtcCts > 0
    ? ` d'un montant de ${formatEuros(input.amountTtcCts)} TTC` : ''
  const piecesLigne = input.hasBl ? ', accompagnée de la lettre de voiture correspondante.' : '.'
  return [
    greeting, '', `${objetLigne}${montantLigne}${piecesLigne}`, '',
    'Nous restons à votre disposition pour toute question.', '',
    'Cordialement,', 'MCA Logistics',
  ].join('\n')
}
function invoiceAttachmentName(invoiceNumber: string | null): string {
  const num = (invoiceNumber ?? '').trim().replace(/[^\w-]+/g, '_')
  return num ? `Facture_${num}.pdf` : 'Facture.pdf'
}

// ── Utils ─────────────────────────────────────────────────────────────────────
async function getGoogleAccessToken(refreshToken: string): Promise<string> {
  const form = new URLSearchParams({
    client_id: Deno.env.get('GOOGLE_OAUTH_CLIENT_ID')!,
    client_secret: Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET')!,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  })
  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  })
  if (!r.ok) throw new Error('google_refresh_failed')
  const j = await r.json()
  if (!j.access_token) throw new Error('no_google_access_token')
  return j.access_token as string
}

/** ArrayBuffer → base64 (par chunks pour éviter le dépassement d'argument). */
function toBase64(bytes: Uint8Array): string {
  let bin = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(bin)
}

/** base64 standard → base64url (Gmail exige base64url du message RFC 2822). */
function toBase64Url(b64: string): string {
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

interface Attachment { filename: string; base64: string }

/** Construit un message MIME multipart/mixed encodé base64url pour Gmail. */
function buildMime(to: string, subject: string, body: string, attachments: Attachment[]): string {
  const boundary = `mca_${crypto.randomUUID().replace(/-/g, '')}`
  // Sujet encodé RFC 2047 (UTF-8 base64) pour les accents.
  const encodedSubject = `=?UTF-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`
  const parts: string[] = [
    `To: ${to}`,
    `Subject: ${encodedSubject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    toBase64(new TextEncoder().encode(body)),
  ]
  for (const att of attachments) {
    parts.push(
      `--${boundary}`,
      'Content-Type: application/pdf',
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${att.filename}"`,
      '',
      att.base64,
    )
  }
  parts.push(`--${boundary}--`, '')
  return toBase64Url(btoa(unescape(encodeURIComponent(parts.join('\r\n')))))
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })

  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader) return json({ ok: false, error: 'missing Authorization' }, 401)

  let deliveryId = ''
  try { const b = await req.json(); deliveryId = typeof b?.delivery_id === 'string' ? b.delivery_id : '' }
  catch { return json({ ok: false, error: 'invalid JSON body' }, 400) }
  if (!deliveryId) return json({ ok: false, error: 'delivery_id requis' }, 400)

  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const svcKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    })
    const { data: { user }, error: uErr } = await userClient.auth.getUser()
    if (uErr || !user) return json({ ok: false, error: 'invalid session' }, 401)

    const service = createClient(url, svcKey, { auth: { persistSession: false } })
    const { data: profile } = await service
      .from('profiles').select('company_id').eq('id', user.id).single()
    const companyId = profile?.company_id as string | undefined
    if (!companyId) return json({ ok: false, error: 'société introuvable' }, 400)

    // Livraison + client (garde company).
    const { data: delivery } = await service
      .from('deliveries')
      .select('id, company_id, statut, amount_ttc_cts, montant_ttc_cts, lv_pdf_url, pennylane_invoice_id, pennylane_invoice_number, clients!client_id(name, email)')
      .eq('id', deliveryId)
      .single()
    if (!delivery || delivery.company_id !== companyId) {
      return json({ ok: false, error: 'livraison introuvable' }, 404)
    }
    if (delivery.statut !== 'facturee' && delivery.statut !== 'payee') {
      return json({ ok: false, error: 'La livraison doit être facturée avant l\'envoi.' }, 400)
    }
    const client = delivery.clients as { name?: string; email?: string } | null
    const to = (client?.email ?? '').trim()
    if (!to) {
      return json({ ok: false, error: 'Aucun email renseigné pour ce client — complète la fiche client puis réessaie.' }, 400)
    }
    if (!delivery.pennylane_invoice_id) {
      return json({ ok: false, error: 'Facture Pennylane introuvable pour cette livraison.' }, 400)
    }

    // ── (a) PDF facture Pennylane (URL signée fraîche) ────────────────────────
    let pennylaneToken = ''
    { const t = Deno.env.get('PENNYLANE_API_TOKEN'); if (!t) return json({ ok: false, error: 'PENNYLANE_API_TOKEN manquant' }, 500); pennylaneToken = t }
    const invRes = await fetch(
      `${PENNYLANE_BASE}/customer_invoices/${delivery.pennylane_invoice_id}`,
      { headers: { Authorization: `Bearer ${pennylaneToken}`, 'X-Use-2026-API-Changes': 'true' } },
    )
    if (!invRes.ok) return json({ ok: false, error: `Pennylane ${invRes.status}` }, 502)
    const invData = await invRes.json() as Record<string, unknown>
    const fileUrl = (invData.file_url ?? invData.public_file_url ?? null) as string | null
    if (!fileUrl) return json({ ok: false, error: 'PDF facture indisponible côté Pennylane.' }, 404)
    const pdfRes = await fetch(fileUrl)
    if (!pdfRes.ok) return json({ ok: false, error: 'Téléchargement du PDF facture échoué.' }, 502)
    const invoiceBytes = new Uint8Array(await pdfRes.arrayBuffer())

    const attachments: Attachment[] = [{
      filename: invoiceAttachmentName(delivery.pennylane_invoice_number as string | null),
      base64: toBase64(invoiceBytes),
    }]

    // ── (b) BL (Drive) — best-effort ──────────────────────────────────────────
    let blAttached = false
    if (delivery.lv_pdf_url) {
      const { data: blDoc } = await service
        .from('documents')
        .select('drive_file_id')
        .eq('entity_type', 'delivery').eq('entity_id', deliveryId).eq('category', 'LV')
        .order('created_at', { ascending: false })
        .limit(1).maybeSingle()
      const { data: tok } = await service
        .from('google_drive_tokens').select('refresh_token')
        .eq('company_id', companyId).maybeSingle()
      if (blDoc?.drive_file_id && tok?.refresh_token) {
        try {
          const gToken = await getGoogleAccessToken(tok.refresh_token)
          const dlRes = await fetch(
            `https://www.googleapis.com/drive/v3/files/${blDoc.drive_file_id}?alt=media`,
            { headers: { Authorization: `Bearer ${gToken}` } },
          )
          if (dlRes.ok) {
            attachments.push({
              filename: 'Bon_de_livraison.pdf',
              base64: toBase64(new Uint8Array(await dlRes.arrayBuffer())),
            })
            blAttached = true
          }
        } catch { /* BL best-effort : on continue sans */ }
      }
    }

    // ── Envoi via Gmail (même refresh_token Google) ───────────────────────────
    const { data: gtok } = await service
      .from('google_drive_tokens').select('refresh_token')
      .eq('company_id', companyId).maybeSingle()
    if (!gtok?.refresh_token) {
      return json({ ok: false, error: 'Compte Google non connecté — connecte le Drive (avec Gmail) dans Paramètres.' }, 400)
    }
    let gmailToken: string
    try { gmailToken = await getGoogleAccessToken(gtok.refresh_token) }
    catch { return json({ ok: false, error: 'Auth Google échouée — reconnecte le Drive.' }, 502) }

    const subject = composeSubject(delivery.pennylane_invoice_number as string | null)
    const body = composeBody({
      invoiceNumber: delivery.pennylane_invoice_number as string | null,
      clientName: client?.name ?? null,
      amountTtcCts: (delivery.amount_ttc_cts ?? delivery.montant_ttc_cts) as number | null,
      hasBl: blAttached,
    })
    const raw = buildMime(to, subject, body, attachments)

    const sendRes = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${gmailToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw }),
      },
    )
    if (!sendRes.ok) {
      const errBody = await sendRes.text()
      // 403 = scope gmail.send manquant (refresh_token sans Gmail).
      const hint = sendRes.status === 403
        ? ' (scope Gmail manquant — reconnecte le Drive pour autoriser l\'envoi d\'emails)'
        : ''
      return json({ ok: false, error: `Envoi Gmail échoué ${sendRes.status}${hint}`, detail: errBody.slice(0, 300) }, 502)
    }

    // Traçage non destructif.
    await service.from('deliveries')
      .update({ email_sent_at: new Date().toISOString() })
      .eq('id', deliveryId)

    return json({ ok: true, data: { to, bl_attached: blAttached } })
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500)
  }
})
