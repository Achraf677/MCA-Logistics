import { useState, useEffect } from 'react'
import { Link2, ScanLine } from 'lucide-react'
import { Drawer } from '../../shared/ui/Drawer'
import { TvaRateInput } from '../../shared/ui/TvaRateInput'
import { Button } from '../../shared/ui/Button'
import { Badge } from '../../shared/ui/Badge'
import { useToast } from '../../shared/ui/useToast'
import { supabase, useProfile } from '../../app/providers'
import { createFuelLog, updateFuelLog, deleteFuelLog } from './carburant.queries'
import { SelecteurCharge } from '../../shared/ui/SelecteurCharge'
import { LinkedChargeCard } from '../../shared/ui/LinkedChargeCard'
import { PanneauVentilation } from '../../shared/ui/PanneauVentilation'
import { DeleteButton } from '../../shared/ui/DeleteButton'
import { getUnlinkedChargesFor } from '../../shared/lib/rapprochement'
import {
  lireLibelleCharge, trouverVehicule, parseLectureOcr, type LectureOcr,
} from '../../shared/lib/lectureFacture'
import { FUEL_TYPE_LABELS, FUEL_TYPE_COLOR, formatCents } from './carburant.logic'
import { fromTtcAndRate, fromTtcAndManualTva } from '../../shared/lib/montants'
import type { FuelLogRow, FuelLogInsert, FuelType, ChargePick } from './carburant.types'
import { Field } from '../../shared/ui/Field'

interface Props {
  open: boolean
  onClose: () => void
  fuelLog?: FuelLogRow | null
  onSaved: () => void
  /**
   * Pré-remplissage depuis la file d'attente (FileAttenteCarburant) : la
   * charge est déjà choisie et sa lecture OCR déjà faite, il ne reste qu'à
   * vérifier et enregistrer. Ignoré en édition (`fuelLog` prime toujours).
   */
  initialCharge?: ChargePick | null
  initialOcr?: LectureOcr | null
}

type Lookup = { id: string; label: string; plate?: string | null }

const FUEL_TYPES: FuelType[] = ['diesel', 'essence', 'electric', 'hybrid', 'lpg']
const TODAY = new Date().toISOString().slice(0, 10)

const EMPTY_FORM = {
  date: TODAY,
  vehicle_id: '',
  driver_id: '',
  liters: '',
  price_per_liter: '',
  total_ttc: '',
  fuel_type: '',
  mileage_km: '',
  station: '',
  tva_rate: '20',
  tva_amount: '',
  tva_deductible_pct: '100',
  chargeId: '',
  supplier_id: '',
}

export function DrawerCarburant({
  open, onClose, fuelLog, onSaved, initialCharge = null, initialOcr = null,
}: Props) {
  const { companyId } = useProfile()
  const { toast } = useToast()
  const isEdit = !!fuelLog

  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [tvaTouched, setTvaTouched] = useState(false)
  const [vehicles, setVehicles] = useState<Lookup[]>([])
  const [drivers, setDrivers]   = useState<Lookup[]>([])
  const [selectorOpen, setSelectorOpen] = useState(false)
  // linkedCharge : charge sélectionnée (nouveau) ou déjà liée (édition)
  const [linkedCharge, setLinkedCharge] = useState<ChargePick | null>(null)

  useEffect(() => {
    if (!open) return
    // La PLAQUE est chargée : c'est elle qui relie un libellé de facture à un
    // véhicule, et elle seule est sans ambiguïté.
    supabase.from('vehicles').select('id, label, plate').eq('status', 'active').order('label')
      .then(({ data }) => setVehicles((data ?? []).map(v => ({ id: v.id, label: v.label, plate: v.plate }))))
    supabase.from('team_members').select('id, full_name').eq('active', true).order('full_name')
      .then(({ data }) => setDrivers((data ?? []).map(m => ({ id: m.id, label: m.full_name }))))
  }, [open])

  useEffect(() => {
    if (fuelLog) {
      setTvaTouched(fuelLog.tva_cts != null)
      setForm({
        date: fuelLog.date,
        vehicle_id: fuelLog.vehicle_id,
        driver_id: fuelLog.driver_id ?? '',
        liters: String(fuelLog.liters),
        price_per_liter: (fuelLog.price_per_liter_milli / 1000).toFixed(3),
        total_ttc: (fuelLog.total_cts / 100).toFixed(2),
        fuel_type: fuelLog.fuel_type ?? '',
        mileage_km: fuelLog.mileage_km != null ? String(fuelLog.mileage_km) : '',
        station: fuelLog.station ?? '',
        tva_rate: String(fuelLog.tva_rate ?? 20),
        tva_amount: fuelLog.tva_cts != null ? (fuelLog.tva_cts / 100).toFixed(2) : '',
        tva_deductible_pct: String(fuelLog.tva_deductible_pct ?? 100),
        chargeId: fuelLog.charge_id ?? '',
        supplier_id: fuelLog.supplier_id ?? '',
      })
      // Peuple linkedCharge depuis le join
      if (fuelLog.charges) {
        setLinkedCharge({
          id: fuelLog.charges.id,
          label: fuelLog.charges.label,
          montant_ht_cts: 0,
          montant_ttc_cts: fuelLog.charges.montant_ttc_cts,
          tva_cts: null as number | null,
          tva_rate: 0,
          receipt_url: fuelLog.charges.receipt_url,
          supplier_id: null as string | null,
          category_id: null,
          charge_categories: null,
          suppliers: null,
        } as ChargePick)
      } else {
        setLinkedCharge(null)
      }
    } else if (initialCharge) {
      // Vient de la file d'attente (FileAttenteCarburant) : la charge est déjà
      // choisie, l'OCR déjà fait. On applique les deux d'un coup — il ne reste
      // à l'utilisateur qu'à vérifier et enregistrer, plus un clic à faire.
      setTvaTouched(false)
      setLinkedCharge(initialCharge)
      setForm(prefillDepuisCharge(
        { ...EMPTY_FORM, date: new Date().toISOString().slice(0, 10) }, initialCharge, vehicles,
      ))
      if (initialOcr) {
        setForm(p => ({
          ...p,
          liters: initialOcr.litres != null ? initialOcr.litres.toFixed(2) : p.liters,
          price_per_liter: initialOcr.prixParLitre != null ? initialOcr.prixParLitre.toFixed(3) : p.price_per_liter,
          mileage_km: initialOcr.kilometrage != null ? String(Math.round(initialOcr.kilometrage)) : p.mileage_km,
        }))
      }
    } else {
      setTvaTouched(false)
      setForm({ ...EMPTY_FORM, date: new Date().toISOString().slice(0, 10) })
      setLinkedCharge(null)
    }
    // `vehicles` inclus : encore vide au tout premier rendu (chargement async
    // dans l'effet du dessus), le véhicule devinable depuis la charge ne
    // peut se déduire qu'une fois la liste arrivée.
  }, [fuelLog, open, initialCharge, initialOcr, vehicles])

  const set = (k: keyof typeof form, v: string) => setForm(p => ({ ...p, [k]: v }))

  /**
   * Rattacher une facture pre-remplit TOUT ce que son libelle dit.
   *
   * Les libelles venus de Pennylane suivent une convention constante —
   * « TOTALENERGIES GAZOLE FG-788-FB OPEL MOVANO » — ou le produit donne le
   * type de carburant et la plaque donne le vehicule. Les lire ne coute ni
   * appel reseau, ni cle d'API, et ne peut rien halluciner.
   *
   * On n'ECRASE jamais une valeur deja saisie : la lecture propose, elle ne
   * corrige pas quelqu'un qui vient de taper.
   */
  const handleChargeSelect = (charge: ChargePick) => {
    setLinkedCharge(charge)
    setForm(prev => prefillDepuisCharge(prev, charge, vehicles))
  }

  /**
   * Lecture du JUSTIFICATIF lui-meme, pour ce que le libelle ne peut pas dire :
   * les litres et le prix au litre.
   *
   * A la demande et jamais automatique : c'est un appel OCR, il prend quelques
   * secondes et il peut se tromper. Le libelle, lui, est lu tout seul — on ne
   * fait pas payer une attente pour une information deja certaine.
   */
  const [lectureEnCours, setLectureEnCours] = useState(false)

  const lireLeJustificatif = async () => {
    if (!linkedCharge) return
    setLectureEnCours(true)
    try {
      const { data, error } = await supabase.functions.invoke('lire-facture', {
        body: { charge_id: linkedCharge.id },
      })
      if (error || !data?.ok) {
        toast(data?.error ?? error?.message ?? 'Lecture indisponible', 'error')
        return
      }
      const lu = parseLectureOcr(data.data)
      if (lu.litres == null && lu.prixParLitre == null && lu.kilometrage == null) {
        toast(lu.raison === 'aucun justificatif'
          ? 'Cette facture n\'a pas de justificatif à lire'
          : "Rien de lisible sur le justificatif — à saisir à la main")
        return
      }
      setForm(prev => ({
        ...prev,
        liters: lu.litres != null ? lu.litres.toFixed(2) : prev.liters,
        price_per_liter: lu.prixParLitre != null ? lu.prixParLitre.toFixed(3) : prev.price_per_liter,
        mileage_km: lu.kilometrage != null ? String(Math.round(lu.kilometrage)) : prev.mileage_km,
      }))
      toast('Lu sur le justificatif — vérifie avant d\'enregistrer')
    } finally {
      setLectureEnCours(false)
    }
  }

  const handleDetach = () => {
    setLinkedCharge(null)
    set('chargeId', '')
  }

  // Auto-calcul du total quand litres ou prix/L changent
  const liters = parseFloat(form.liters || '0')
  const priceMilli = Math.round(parseFloat(form.price_per_liter || '0') * 1000)
  const autoTotalCts = liters > 0 && priceMilli > 0
    ? Math.round(liters * priceMilli / 10)
    : null

  const totalCts = form.total_ttc
    ? Math.round(parseFloat(form.total_ttc) * 100)
    : (autoTotalCts ?? 0)

  // Dérivation HT/TVA/TTC depuis TTC + TVA saisie ou taux
  const tvaAmtCts = Math.round(parseFloat(form.tva_amount || '0') * 100)
  const montants = tvaTouched && tvaAmtCts > 0
    ? fromTtcAndManualTva(totalCts, tvaAmtCts)
    : fromTtcAndRate(totalCts, parseFloat(form.tva_rate || '20'))

  // Auto-suggère le montant TVA quand TTC ou taux changent
  useEffect(() => {
    if (tvaTouched) return
    if (totalCts <= 0) { setForm(p => ({ ...p, tva_amount: '' })); return }
    const rate = parseFloat(form.tva_rate || '20')
    const suggested = fromTtcAndRate(totalCts, rate).tva_cts
    setForm(p => ({ ...p, tva_amount: (suggested / 100).toFixed(2) }))
  }, [form.total_ttc, form.tva_rate, tvaTouched, totalCts])

  const handleLitersOrPriceChange = (k: 'liters' | 'price_per_liter', v: string) => {
    setForm(p => {
      const newForm = { ...p, [k]: v }
      const l   = parseFloat(k === 'liters' ? v : p.liters || '0')
      const ppl = parseFloat(k === 'price_per_liter' ? v : p.price_per_liter || '0')
      if (l > 0 && ppl > 0) newForm.total_ttc = (l * ppl).toFixed(2)
      return newForm
    })
  }

  const handleSave = async () => {
    if (!form.vehicle_id) { toast('Le véhicule est requis', 'error'); return }
    // Un plein sans chauffeur ne dit pas QUI a fait le plein : impossible de
    // rapprocher une consommation anormale d'une personne, et impossible de
    // contester un plein qu'on n'a pas fait. Demande explicite des chauffeurs.
    if (!form.driver_id)   { toast('Le chauffeur est requis', 'error'); return }
    if (!form.date)        { toast('La date est requise', 'error'); return }
    if (liters <= 0)       { toast('Le nombre de litres doit être supérieur à 0', 'error'); return }
    if (totalCts <= 0)     { toast('Le montant total doit être supérieur à 0', 'error'); return }

    setSaving(true)
    try {
      const payload = {
        date: form.date,
        vehicle_id: form.vehicle_id,
        driver_id: form.driver_id,
        liters,
        price_per_liter_milli: priceMilli || Math.round(totalCts * 10 / liters),
        total_cts: montants.ttc_cts,
        tva_cts: montants.tva_cts > 0 ? montants.tva_cts : null,
        fuel_type: (form.fuel_type || null) as FuelType | null,
        mileage_km: form.mileage_km ? parseInt(form.mileage_km) : null,
        station: form.station || null,
        tva_rate: parseFloat(form.tva_rate || '20'),
        tva_deductible_pct: parseFloat(form.tva_deductible_pct || '100'),
        receipt_url: linkedCharge?.receipt_url ?? (isEdit ? fuelLog?.receipt_url ?? null : null),
        supplier_id: form.supplier_id || linkedCharge?.supplier_id || null,
        charge_id: form.chargeId || null,
      }

      if (isEdit && fuelLog) {
        const { error } = await updateFuelLog(fuelLog.id, payload)
        if (error) throw error
        toast('Plein mis à jour')
      } else {
        if (!companyId) throw new Error('Profil non chargé')
        const { error } = await createFuelLog({ ...payload, company_id: companyId } as FuelLogInsert)
        if (error) throw error
        toast('Plein enregistré')
      }
      onSaved()
      onClose()
    } catch (e: unknown) {
      toast((e as Error).message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    const { error } = await deleteFuelLog(fuelLog!.id)
    if (error) throw error
    toast('Plein supprimé')
    onSaved()
    onClose()
  }

  return (
    <>
      <Drawer
        open={open}
        onClose={onClose}
        title={isEdit ? `Plein — ${fuelLog!.vehicles?.label ?? '...'}` : 'Nouveau plein'}
      >
        <div className="flex flex-col gap-4">
          {/* Statut véhicule */}
          {isEdit && fuelLog?.fuel_type && (
            <div className="flex items-center gap-2 mb-1">
              <Badge color={FUEL_TYPE_COLOR[fuelLog.fuel_type]}>{FUEL_TYPE_LABELS[fuelLog.fuel_type]}</Badge>
              {fuelLog.charges && <Badge color="success">Facturé</Badge>}
              <span className="ml-auto font-mono text-[var(--fs-xs)] text-[var(--text-muted)]">
                {new Date(fuelLog.date).toLocaleDateString('fr-FR')}
              </span>
            </div>
          )}

          {/* ── Rapprochement charge ────────────────────────────────────────── */}
          {linkedCharge ? (
            <>
              <LinkedChargeCard charge={linkedCharge} onDetach={handleDetach} />
              {/* Le libellé est déjà lu (carburant, véhicule). Ce bouton va
                  chercher ce qu'il ne contient pas : litres, prix au litre,
                  kilométrage. À la demande, parce que c'est un OCR — quelques
                  secondes, et faillible. */}
              <button
                type="button"
                onClick={lireLeJustificatif}
                disabled={lectureEnCours}
                className="flex items-center gap-2 px-4 min-h-[44px] rounded-[var(--r-md)]
                  border border-[var(--border)] text-[var(--fs-sm)] text-[var(--text)]
                  hover:border-[var(--brand)] transition-colors disabled:opacity-50"
              >
                <ScanLine size={15} />
                {lectureEnCours ? 'Lecture…' : 'Lire le justificatif (litres, prix/L)'}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setSelectorOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-[var(--r-md)] border border-dashed border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--brand)] hover:text-[var(--brand)] transition-colors text-[var(--fs-sm)]"
            >
              <Link2 size={14} />
              Rapprocher une facture Pennylane
            </button>
          )}

          {/* ── Ventilation partielle (édition uniquement — cible = ce plein) */}
          {isEdit && fuelLog && fuelLog.total_cts > 0 && (
            <div className="rounded-[var(--r-lg)] border border-[var(--border)] p-4 flex flex-col gap-3">
              <span className="text-[var(--fs-xs)] font-semibold text-[var(--text-muted)] uppercase tracking-wide">
                Ventilation (allocations partielles)
              </span>
              <PanneauVentilation
                targetTable="fuel_logs"
                targetId={fuelLog.id}
                targetAmountCts={fuelLog.total_cts}
                fetchCharges={() => getUnlinkedChargesFor('fuel_logs')}
                onChanged={onSaved}
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Date *">
              <Input type="date" value={form.date} onChange={v => set('date', v)} />
            </Field>
            <Field label="Type de carburant">
              <select value={form.fuel_type} onChange={e => set('fuel_type', e.target.value)} className={inputCls}>
                <option value="">— Aucun —</option>
                {FUEL_TYPES.map(t => <option key={t} value={t}>{FUEL_TYPE_LABELS[t]}</option>)}
              </select>
            </Field>
          </div>

          <Field label="Véhicule *">
            <select value={form.vehicle_id} onChange={e => set('vehicle_id', e.target.value)} className={inputCls}>
              <option value="">— Sélectionner un véhicule —</option>
              {vehicles.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
            </select>
          </Field>

          <Field label="Chauffeur *">
            <select value={form.driver_id} onChange={e => set('driver_id', e.target.value)} className={inputCls}>
              <option value="">— Sélectionner un chauffeur —</option>
              {drivers.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Litres *">
              <Input type="number" value={form.liters}
                onChange={v => handleLitersOrPriceChange('liters', v)}
                placeholder="50.00" />
            </Field>
            <Field label="Prix/L (€)">
              <Input type="number" value={form.price_per_liter}
                onChange={v => handleLitersOrPriceChange('price_per_liter', v)}
                placeholder="1.850" />
            </Field>
          </div>

          <Field label={linkedCharge ? 'Total TTC (€) — pré-rempli depuis la facture' : 'Total TTC (€) *'}>
            <Input type="number" value={form.total_ttc}
              onChange={v => set('total_ttc', v)}
              placeholder="92.50" />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="TVA (%)">
              <TvaRateInput
                value={parseFloat(form.tva_rate || '20')}
                onChange={r => { set('tva_rate', String(r)); setTvaTouched(false) }}
              />
            </Field>
            <Field label={`Montant TVA (€)${tvaTouched ? ' ✎' : ' — auto'}`}>
              <Input
                type="number"
                value={form.tva_amount}
                onChange={v => { set('tva_amount', v); setTvaTouched(true) }}
                placeholder="0.00"
              />
            </Field>
          </div>

          {totalCts > 0 && (
            <div className="rounded-[var(--r-md)] bg-[var(--bg-elevated)] border border-[var(--border)] divide-y divide-[var(--border)] overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2">
                <span className="text-[var(--fs-sm)] text-[var(--text-muted)]">HT</span>
                <span className="font-mono text-[var(--fs-sm)]">{formatCents(montants.ht_cts)}</span>
              </div>
              <div className="flex items-center justify-between px-4 py-2">
                <span className="text-[var(--fs-sm)] text-[var(--text-muted)]">TVA</span>
                <span className="font-mono text-[var(--fs-sm)]">{formatCents(montants.tva_cts)}</span>
              </div>
              <div className="flex items-center justify-between px-4 py-2.5">
                <span className="text-[var(--fs-sm)] font-medium text-[var(--text)]">Total TTC</span>
                <span className="font-mono font-semibold text-[var(--text)]">{formatCents(montants.ttc_cts)}</span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Kilométrage">
              <Input type="number" value={form.mileage_km}
                onChange={v => set('mileage_km', v)} placeholder="125000" />
            </Field>
            <Field label="Station">
              <Input value={form.station} onChange={v => set('station', v)} placeholder="Total, BP…" />
            </Field>
          </div>

          <Field label="TVA déductible (%)">
            <select value={form.tva_deductible_pct} onChange={e => set('tva_deductible_pct', e.target.value)} className={inputCls}>
              <option value="100">100 %</option>
              <option value="80">80 %</option>
              <option value="0">0 %</option>
            </select>
          </Field>

          <div className="flex items-center gap-2 pt-3 border-t border-[var(--border)]">
            <Button variant="primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
            <Button variant="secondary" onClick={onClose}>Annuler</Button>
            {isEdit && (
              <DeleteButton
                onDelete={handleDelete}
                confirmTitle="Supprimer ce plein ?"
                confirmMessage="La charge liée ne sera pas supprimée. Action irréversible."
                className="ml-auto"
              />
            )}
          </div>
        </div>
      </Drawer>

      <SelecteurCharge
        open={selectorOpen}
        onClose={() => setSelectorOpen(false)}
        onSelect={handleChargeSelect}
        fetchCharges={() => getUnlinkedChargesFor('fuel_logs')}
      />
    </>
  )
}

/**
 * Ce qu'une charge Pennylane rattachée dit d'elle-même, appliqué au formulaire.
 *
 * N'ÉCRASE jamais une valeur déjà saisie (`prev.x ||`) : la lecture propose,
 * elle ne corrige pas quelqu'un qui vient de taper. La station est le nom du
 * FOURNISSEUR — c'est lui qui facture, donc lui la station : « TOTAL »,
 * « E.LECLERC »… Plus fiable qu'un mot-clé cherché dans le libellé, qui varie
 * d'une facture à l'autre.
 */
function prefillDepuisCharge(
  prev: typeof EMPTY_FORM,
  charge: ChargePick,
  vehicles: Lookup[] = [],
): typeof EMPTY_FORM {
  const { typeCarburant } = lireLibelleCharge(charge.label)
  const vehiculeId = trouverVehicule(charge.label, vehicles)

  return {
    ...prev,
    chargeId: charge.id,
    date: charge.date,
    total_ttc: charge.montant_ttc_cts != null
      ? (charge.montant_ttc_cts / 100).toFixed(2)
      : prev.total_ttc,
    tva_rate: String(charge.tva_rate ?? 20),
    fuel_type: prev.fuel_type || (typeCarburant ?? ''),
    vehicle_id: prev.vehicle_id || (vehiculeId ?? ''),
    station: prev.station || (charge.suppliers?.name ?? ''),
    supplier_id: prev.supplier_id || (charge.supplier_id ?? ''),
  }
}

const inputCls = 'field'
function Input({ type = 'text', value, onChange, placeholder, disabled }: {
  type?: string; value: string; onChange: (v: string) => void
  placeholder?: string; disabled?: boolean
}) {
  return (
    <input type={type} value={value} placeholder={placeholder} disabled={disabled}
      onChange={e => onChange(e.target.value)} className={inputCls} />
  )
}

