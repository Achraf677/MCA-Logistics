import { useEffect, useState, useCallback } from 'react'
import { Loader2, ScanLine, Fuel, ListChecks } from 'lucide-react'
import { supabase } from '../../app/providers'
import { Button } from '../../shared/ui/Button'
import { Badge } from '../../shared/ui/Badge'
import { getUnlinkedChargesFor } from '../../shared/lib/rapprochement'
import { lireLibelleCharge, trouverVehicule, parseLectureOcr, type LectureOcr } from '../../shared/lib/lectureFacture'
import { FUEL_TYPE_LABELS } from './carburant.logic'
import type { ChargePick } from '../../shared/types/charges'

type Lookup = { id: string; label: string; plate?: string | null }

interface Props {
  vehicles: Lookup[]
  /** Ouvre le drawer Carburant, la charge et sa lecture déjà en poche. */
  onValider: (charge: ChargePick, ocr: LectureOcr | null) => void
  /** Ouvre l'import d'un relevé de carte carburant (une facture, plusieurs pleins). */
  onImporterReleve: (charge: ChargePick) => void
  /** Incrémenté par le parent pour forcer un rechargement (ex. après un enregistrement). */
  refreshToken: number
}

/**
 * File d'attente des factures carburant — à la Pennylane.
 *
 * Toute facture Pennylane catégorisée « Carburant » et pas encore rattachée à
 * un plein atterrit ici, SANS action de l'utilisateur : `getUnlinkedChargesFor`
 * fait déjà ce tri (voir rapprochement.ts). Ce composant lit d'abord ce que le
 * LIBELLÉ dit tout seul (station, carburant, véhicule — gratuit, instantané).
 *
 * L'OCR du justificatif (litres, prix/L) N'EST PLUS automatique : un clic sur
 * « Lire la facture » par ligne, à la demande. Avant, la file entière
 * relançait l'IA sur toutes les factures dès l'ouverture de l'écran — en cas
 * de panne ou de limite de débit côté fournisseur IA, ça grillait le quota en
 * boucle pour rien.
 *
 * « Valider » ouvre le plein avec la lecture déjà faite si elle existe, sinon
 * vide — le bouton « Lire le justificatif » reste disponible dans le formulaire.
 */
export function FileAttenteCarburant({ vehicles, onValider, onImporterReleve, refreshToken }: Props) {
  const [charges, setCharges] = useState<ChargePick[]>([])
  const [loading, setLoading] = useState(true)
  const [lectures, setLectures] = useState<Record<string, LectureOcr | 'en-cours' | null>>({})

  const charger = useCallback(async () => {
    setLoading(true)
    const data = await getUnlinkedChargesFor('fuel_logs')
    setCharges(data)
    setLoading(false)
  }, [])

  useEffect(() => { void charger() }, [charger, refreshToken])

  const lireUneFacture = async (charge: ChargePick) => {
    if (!charge.receipt_url) return
    setLectures(p => ({ ...p, [charge.id]: 'en-cours' }))
    try {
      const { data } = await supabase.functions.invoke('lire-facture', { body: { charge_id: charge.id } })
      setLectures(p => ({ ...p, [charge.id]: data?.ok ? parseLectureOcr(data.data) : null }))
    } catch {
      setLectures(p => ({ ...p, [charge.id]: null }))
    }
  }

  if (loading || charges.length === 0) return null

  return (
    <div className="glass rounded-[var(--r-xl)] overflow-hidden mb-6">
      <div className="px-4 py-2.5 bg-[var(--bg-elevated)] border-b border-[var(--border)] flex items-center gap-2">
        <ScanLine size={14} className="text-[var(--brand)]" />
        <span className="text-[var(--fs-xs)] font-semibold text-[var(--text-muted)] uppercase tracking-wide">
          Factures carburant en attente
        </span>
        <Badge color="warning">{charges.length}</Badge>
      </div>

      <div className="flex flex-col divide-y divide-[var(--border)]">
        {charges.map(charge => {
          const { typeCarburant } = lireLibelleCharge(charge.label)
          const vehiculeId = trouverVehicule(charge.label, vehicles)
          const vehicule = libelleVehicule(vehiculeId, vehicles)
          const station = charge.suppliers?.name ?? null
          const lecture = lectures[charge.id]

          return (
            <div key={charge.id} className="p-4 flex flex-wrap items-center gap-3">
              <Fuel size={16} className="text-[var(--text-muted)] shrink-0" />

              <div className="flex-1 min-w-[200px]">
                <p className="text-[var(--fs-sm)] font-medium text-[var(--text)] truncate">{charge.label}</p>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-[var(--fs-xs)] text-[var(--text-muted)]">
                  <span>{new Date(charge.date).toLocaleDateString('fr-FR')}</span>
                  {station && <span>· {station}</span>}
                  {typeCarburant && <span>· {FUEL_TYPE_LABELS[typeCarburant]}</span>}
                  <span>· {vehicule ?? 'véhicule non identifié'}</span>
                </div>
              </div>

              <div className="text-[var(--fs-xs)] text-[var(--text-muted)] min-w-[140px]">
                {!charge.receipt_url ? (
                  <span>Pas de justificatif — à saisir à la main</span>
                ) : lecture === 'en-cours' ? (
                  <span className="flex items-center gap-1.5"><Loader2 size={13} className="animate-spin" /> Lecture…</span>
                ) : lecture === undefined ? (
                  <Button variant="secondary" size="compact" onClick={() => lireUneFacture(charge)}>
                    <ScanLine size={12} /> Lire la facture
                  </Button>
                ) : lecture === null || lecture.raison === 'service surchargé' ? (
                  // Échec transitoire (réseau, IA saturée) : rien n'est mémorisé côté
                  // serveur, on laisse relancer à la main plutôt que d'affirmer
                  // « à saisir à la main ».
                  <Button variant="secondary" size="compact" onClick={() => lireUneFacture(charge)}>
                    <ScanLine size={12} /> Service saturé · Réessayer
                  </Button>
                ) : lecture && (lecture.litres != null || lecture.prixParLitre != null) ? (
                  <span>
                    {lecture.litres != null ? `${lecture.litres.toFixed(2)} L` : '— L'}
                    {lecture.prixParLitre != null ? ` · ${lecture.prixParLitre.toFixed(3)} €/L` : ''}
                  </span>
                ) : (
                  <span>À saisir à la main</span>
                )}
              </div>

              {/* Relevé de carte (plusieurs pleins sur une facture) : import en
                  tableau, quel que soit l'émetteur de la carte. */}
              <Button variant="secondary" size="compact" onClick={() => onImporterReleve(charge)}
                title="Facture regroupant plusieurs pleins (relevé de carte carburant)">
                <ListChecks size={12} /> Relevé
              </Button>
              <Button
                variant="primary"
                size="compact"
                onClick={() => onValider(charge, lecture === 'en-cours' ? null : (lecture ?? null))}
              >
                Valider
              </Button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function libelleVehicule(id: string | null, vehicles: Lookup[]): string | null {
  if (!id) return null
  return vehicles.find(v => v.id === id)?.label ?? null
}
