// Composition PURE du sujet + corps de l'email client (facture + BL).
// Aucune dépendance réseau/DOM — testable. L'Edge send-client-email réutilise
// la MÊME logique (dupliquée côté Deno) pour garantir un rendu identique.

export interface EmailComposeInput {
  /** Numéro de facture lisible (ex "FA-2026-07-9"). Peut être null (non finalisé). */
  invoiceNumber: string | null
  /** Nom du client (destinataire). */
  clientName: string | null
  /** Montant TTC en centimes (affiché dans le corps si présent). */
  amountTtcCts?: number | null
  /** true si le BL (lettre de voiture) est joint. */
  hasBl: boolean
}

export interface EmailComposed {
  subject: string
  body: string
}

/** Formate un montant en centimes → "1 234,56 €" (FR). */
function formatEuros(cts: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency', currency: 'EUR',
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(cts / 100)
}

/** Objet : "Facture FA-… — MCA Logistics" (ou générique si numéro absent). */
export function composeSubject(invoiceNumber: string | null): string {
  const num = (invoiceNumber ?? '').trim()
  return num
    ? `Facture ${num} — MCA Logistics`
    : `Votre facture — MCA Logistics`
}

/** Corps FR sobre. Mentionne les pièces jointes réellement attachées. */
export function composeBody(input: EmailComposeInput): string {
  const { invoiceNumber, clientName, amountTtcCts, hasBl } = input
  const greeting = clientName?.trim()
    ? `Bonjour ${clientName.trim()},`
    : 'Bonjour,'
  const num = (invoiceNumber ?? '').trim()
  const objetLigne = num
    ? `Veuillez trouver ci-joint votre facture ${num}`
    : 'Veuillez trouver ci-joint votre facture'
  const montantLigne = amountTtcCts != null && amountTtcCts > 0
    ? ` d'un montant de ${formatEuros(amountTtcCts)} TTC`
    : ''
  const piecesLigne = hasBl
    ? ', accompagnée de la lettre de voiture correspondante.'
    : '.'

  return [
    greeting,
    '',
    `${objetLigne}${montantLigne}${piecesLigne}`,
    '',
    'Nous restons à votre disposition pour toute question.',
    '',
    'Cordialement,',
    'MCA Logistics',
  ].join('\n')
}

export function composeEmail(input: EmailComposeInput): EmailComposed {
  return {
    subject: composeSubject(input.invoiceNumber),
    body: composeBody(input),
  }
}

/** Nom de fichier de la pièce jointe facture (ex "Facture_FA-2026-07-9.pdf"). */
export function invoiceAttachmentName(invoiceNumber: string | null): string {
  const num = (invoiceNumber ?? '').trim().replace(/[^\w-]+/g, '_')
  return num ? `Facture_${num}.pdf` : 'Facture.pdf'
}
