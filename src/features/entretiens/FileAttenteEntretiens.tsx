import { useEffect, useState, useCallback, useRef } from 'react'
import { Loader2, ScanLine, Wrench } from 'lucide-react'
import { supabase } from '../../app/providers'
import { Button } from '../../shared/ui/Button'
import { Badge } from '../../shared/ui/Badge'
import { getUnlinkedChargesFor } from '../../shared/lib/rapprochement'
import {
  trouverVehicule, descriptionDepuisLibelle, parseLectureOcr, type LectureOcr,
} from '../../shared/lib/lectureFacture'
import type { ChargePick } from '../../shared/types/charges'

type Lookup = { id: string; label: string; plate?: string | null }

interface Props {
  vehicles: Lookup[]
  /** Ouvre le drawer Entretien, la charge et sa lecture OCR déjà en poche. */
  onValider: (charge: ChargePick, ocr: LectureOcr | null) => void
  /** Incrémenté par le parent pour forcer un rechargement (ex. après un enregistrement). */
  refreshToken: number
}

/**
 * File d'attente des factures d'entretien — même principe que Carburant
 * (FileAttenteCarburant) : `getUnlinkedChargesFor` trie déjà les charges
 * Pennylane catégorisées « Entretien » et pas encore rattachées à une
 * intervention. Le libellé se lit tout seul (véhicule, description), et
 * l'OCR de chaque justificatif est lancé automatiquement pour ce qu'un
 * libellé ne peut pas dire — ici, uniquement le KILOMÉTRAGE (litres et
 * prix/L n'ont pas de sens pour un entretien, ignorés à l'affichage même
 * si `lire-facture` les renvoie).
 */
export function FileAttenteEntretiens({ vehicles, onValider, refreshToken }: Props) {
  const [charges, setCharges] = useState<ChargePick[]>([])
  const [loading, setLoading] = useState(true)
  const [lectures, setLectures] = useState<Record<string, LectureOcr | 'en-cours' | null>>({})

  const charger = useCallback(async () => {
    setLoading(true)
    const data = await getUnlinkedChargesFor('vehicle_maintenances')
    setCharges(data)
    setLoading(false)
  }, [])

  useEffect(() => { void charger() }, [charger, refreshToken])

  // OCR automatique, une facture après l'autre — jamais en parallèle (coût API).
  const traitees = useRef<Set<string>>(new Set())

  useEffect(() => {
    let annule = false
    async function lireToutesLesFactures() {
      for (const charge of charges) {
        if (annule) return
        if (traitees.current.has(charge.id)) continue
        traitees.current.add(charge.id)

        if (!charge.receipt_url) { setLectures(p => ({ ...p, [charge.id]: null })); continue }
        setLectures(p => ({ ...p, [charge.id]: 'en-cours' }))
        try {
          const { data } = await supabase.functions.invoke('lire-facture', { body: { charge_id: charge.id } })
          if (annule) return
          setLectures(p => ({ ...p, [charge.id]: data?.ok ? parseLectureOcr(data.data) : null }))
        } catch {
          if (!annule) setLectures(p => ({ ...p, [charge.id]: null }))
        }
      }
    }
    void lireToutesLesFactures()
    return () => { annule = true }
  }, [charges])

  if (loading || charges.length === 0) return null

  return (
    <div className="glass rounded-[var(--r-xl)] overflow-hidden mb-6">
      <div className="px-4 py-2.5 bg-[var(--bg-elevated)] border-b border-[var(--border)] flex items-center gap-2">
        <ScanLine size={14} className="text-[var(--brand)]" />
        <span className="text-[var(--fs-xs)] font-semibold text-[var(--text-muted)] uppercase tracking-wide">
          Factures d'entretien en attente
        </span>
        <Badge color="warning">{charges.length}</Badge>
      </div>

      <div className="flex flex-col divide-y divide-[var(--border)]">
        {charges.map(charge => {
          const vehiculeId = trouverVehicule(charge.label, vehicles)
          const vehicule = libelleVehicule(vehiculeId, vehicles)
          const description = descriptionDepuisLibelle(charge.label, charge.suppliers?.name)
          const lecture = lectures[charge.id]

          return (
            <div key={charge.id} className="p-4 flex flex-wrap items-center gap-3">
              <Wrench size={16} className="text-[var(--text-muted)] shrink-0" />

              <div className="flex-1 min-w-[200px]">
                <p className="text-[var(--fs-sm)] font-medium text-[var(--text)] truncate">{description || charge.label}</p>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-[var(--fs-xs)] text-[var(--text-muted)]">
                  <span>{new Date(charge.date).toLocaleDateString('fr-FR')}</span>
                  {charge.suppliers?.name && <span>· {charge.suppliers.name}</span>}
                  <span>· {vehicule ?? 'véhicule non identifié'}</span>
                </div>
              </div>

              <div className="text-[var(--fs-xs)] text-[var(--text-muted)] min-w-[120px]">
                {lecture === 'en-cours' || lecture === undefined ? (
                  <span className="flex items-center gap-1.5"><Loader2 size={13} className="animate-spin" /> Lecture…</span>
                ) : lecture && lecture.kilometrage != null ? (
                  <span>{Math.round(lecture.kilometrage).toLocaleString('fr-FR')} km</span>
                ) : (
                  <span>km à saisir à la main</span>
                )}
              </div>

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
