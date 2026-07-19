// Génération PDF de la lettre de voiture nationale (jsPDF, côté client).
//
// Le PDF est A4 portrait, 210 × 297 mm. Marges 15 mm. Toutes les mentions
// obligatoires y figurent, dans l'ordre logique attendu par un contrôle
// (DREAL / gendarmerie) : en-tête + n° LV + date d'établissement, expéditeur,
// destinataire, transporteur, marchandise, véhicule, chauffeur, prix,
// signatures aux 3 rôles (expéditeur, transporteur, destinataire) avec
// horodatage + géoloc si disponibles.
//
// Le fichier retourné est un Blob PDF (compatible avec uploadDocument →
// drive-upload). L'appelant doit avoir déjà bloqué en amont si
// buildLettreVoiture a signalé des mentions manquantes.

import { jsPDF } from 'jspdf'
import type { LettreVoitureData } from './lettreVoiture.logic'
import type { LvSignatures } from './livraisons.types'

const PAGE_W_MM = 210
const MARGIN_MM = 15
const CONTENT_W_MM = PAGE_W_MM - MARGIN_MM * 2

interface BuildOptions {
  data: LettreVoitureData
  signatures: LvSignatures
  /** Filename généré au moment de la création — sert aussi pour Drive. */
  fileName: string
}

/** Formate un timestamp ISO en date + heure locales FR pour affichage sous les signatures. */
function formatTs(ts: string | undefined): string {
  if (!ts) return ''
  try {
    return new Date(ts).toLocaleString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch { return ts }
}

function formatDateOnly(iso: string): string {
  try {
    return new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR')
  } catch { return iso }
}

export interface LvPdfResult {
  blob: Blob
  file: File
}

export function buildLettreVoiturePdf({ data, signatures, fileName }: BuildOptions): LvPdfResult {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  let y = MARGIN_MM

  // ── En-tête ────────────────────────────────────────────────────────────────
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text('LETTRE DE VOITURE NATIONALE', PAGE_W_MM / 2, y + 6, { align: 'center' })
  y += 10

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(90)
  doc.text('Transport public routier de marchandises — décret n° 99-752 · art. L132-9 Code de commerce',
    PAGE_W_MM / 2, y + 4, { align: 'center' })
  y += 8

  // Bandeau n° LV + date
  doc.setDrawColor(180)
  doc.setLineWidth(0.3)
  doc.line(MARGIN_MM, y, PAGE_W_MM - MARGIN_MM, y)
  y += 5

  doc.setFontSize(10)
  doc.setTextColor(20)
  doc.setFont('helvetica', 'bold')
  doc.text(`N° ${data.numero ?? '—'}`, MARGIN_MM, y)
  doc.text(`Date d'établissement : ${formatDateOnly(data.date_etablissement)}`,
    PAGE_W_MM - MARGIN_MM, y, { align: 'right' })
  y += 8

  // ── Sections encadrées ─────────────────────────────────────────────────────
  y = drawSection(doc, y, 'EXPÉDITEUR', [
    [`Nom / Raison sociale`, data.expediteur.nom],
    [`Adresse d'enlèvement`, data.expediteur.adresse],
    ...(data.expediteur.siren ? [[`SIREN`, data.expediteur.siren] as [string, string]] : []),
  ])

  y = drawSection(doc, y, 'DESTINATAIRE', [
    [`Nom / Raison sociale`, data.destinataire.nom],
    [`Adresse de livraison`, data.destinataire.adresse],
  ])

  y = drawSection(doc, y, 'TRANSPORTEUR', [
    [`Raison sociale`, data.transporteur.nom],
    ...(data.transporteur.adresse ? [[`Adresse`, data.transporteur.adresse] as [string, string]] : []),
    [`SIREN`, data.transporteur.siren ?? '—'],
    [`Licence de transport (DREAL)`, data.transporteur.licence ?? '—'],
  ])

  y = drawSection(doc, y, 'MARCHANDISE', [
    [`Description`, data.marchandise.description],
    [`Nombre de colis`, String(data.marchandise.nb_colis)],
    [`Poids réel remis (kg)`, String(data.marchandise.poids_kg)],
  ])

  y = drawSection(doc, y, 'VÉHICULE / CHAUFFEUR', [
    [`Immatriculation`, data.vehicule_immat],
    [`Chauffeur`, data.chauffeur],
    ...(data.prix_ttc_formate
      ? [[`Prix du transport (TTC)`, data.prix_ttc_formate] as [string, string]]
      : []),
  ])

  // ── Signatures (3 zones sur une ligne) ──────────────────────────────────────
  // Force une nouvelle page si on n'a pas assez de place (bloc ~ 65 mm).
  if (y > 297 - MARGIN_MM - 65) { doc.addPage(); y = MARGIN_MM }
  y += 4

  const zoneW = (CONTENT_W_MM - 8) / 3
  const zoneH = 45
  drawSignatureZone(doc, MARGIN_MM, y, zoneW, zoneH, 'Expéditeur',
    signatures.expediteur?.png, formatTs(signatures.expediteur?.ts))
  drawSignatureZone(doc, MARGIN_MM + zoneW + 4, y, zoneW, zoneH, 'Transporteur',
    signatures.transporteur?.png, formatTs(signatures.transporteur?.ts))
  drawSignatureZone(doc, MARGIN_MM + (zoneW + 4) * 2, y, zoneW, zoneH, 'Destinataire',
    signatures.destinataire?.png, formatTs(signatures.destinataire?.ts))
  // y n'est plus utilisé après le bloc signatures — le pied de page est positionné en absolu.

  // Pied de page — mention légale.
  doc.setFontSize(7)
  doc.setTextColor(120)
  doc.text(
    'Document généré par le système MCA Logistics. Les signatures et horodatages ci-dessus valent preuve de prise en charge et de remise.',
    PAGE_W_MM / 2, 297 - 8, { align: 'center', maxWidth: CONTENT_W_MM },
  )

  const blob = doc.output('blob')
  const file = new File([blob], fileName, { type: 'application/pdf' })
  return { blob, file }
}

/** Encadré titré avec liste (label / valeur) — retourne le nouveau y. */
function drawSection(
  doc: jsPDF,
  y0: number,
  title: string,
  rows: [string, string][],
): number {
  const padY = 3
  const rowH = 5.5
  const titleH = 6
  const boxH = titleH + padY + rows.length * rowH + padY

  // Fond du titre
  doc.setFillColor(240, 240, 240)
  doc.rect(MARGIN_MM, y0, CONTENT_W_MM, titleH, 'F')
  doc.setDrawColor(200)
  doc.setLineWidth(0.2)
  doc.rect(MARGIN_MM, y0, CONTENT_W_MM, boxH)

  doc.setFontSize(9)
  doc.setTextColor(20)
  doc.setFont('helvetica', 'bold')
  doc.text(title, MARGIN_MM + 2, y0 + titleH - 1.5)

  let ry = y0 + titleH + padY
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  const labelW = 52
  for (const [label, value] of rows) {
    doc.setTextColor(110)
    doc.text(label, MARGIN_MM + 2, ry + 3.5)
    doc.setTextColor(20)
    const v = doc.splitTextToSize(value || '—', CONTENT_W_MM - labelW - 4)
    doc.text(v, MARGIN_MM + labelW, ry + 3.5)
    ry += rowH
  }
  return y0 + boxH + 3
}

/** Zone de signature 45 mm de haut : cadre + label + image + horodatage. */
function drawSignatureZone(
  doc: jsPDF,
  x: number, y: number, w: number, h: number,
  label: string,
  png: string | undefined,
  ts: string,
) {
  doc.setDrawColor(180)
  doc.setLineWidth(0.3)
  doc.rect(x, y, w, h)

  doc.setFontSize(8)
  doc.setTextColor(90)
  doc.setFont('helvetica', 'bold')
  doc.text(label, x + 2, y + 4)

  if (png) {
    try {
      // Espace utile : 4 mm en haut pour label, 6 mm en bas pour timestamp.
      doc.addImage(png, 'PNG', x + 2, y + 6, w - 4, h - 12, undefined, 'FAST')
    } catch {
      // Image corrompue : on n'ajoute rien, le cadre reste.
    }
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(120)
    doc.text(ts, x + w - 2, y + h - 2, { align: 'right' })
  } else {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(8)
    doc.setTextColor(160)
    doc.text('Non signé', x + w / 2, y + h / 2, { align: 'center' })
  }
}
