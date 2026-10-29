import { useState, useEffect } from 'react'
import { Link2, ScanLine } from 'lucide-react'
import { Drawer } from '../../shared/ui/Drawer'
import { Button } from '../../shared/ui/Button'
import { Badge } from '../../shared/ui/Badge'
import { useToast } from '../../shared/ui/useToast'
import { supabase, useProfile } from '../../app/providers'
import { SelecteurCharge } from '../../shared/ui/SelecteurCharge'
import { LinkedChargeCard } from '../../shared/ui/LinkedChargeCard'
import { PanneauVentilation } from '../../shared/ui/PanneauVentilation'
import { VentilationFacture } from '../../shared/ui/VentilationFacture'
import { getUnlinkedChargesFor } from '../../shared/lib/rapprochement'
import {
  trouverVehicule, parseLectureOcr, descriptionDepuisLibelle, type LectureOcr,
} from '../../shared/lib/lectureFacture'
import { createMaintenance, updateMaintenance, deleteMaintenance } from './entretiens.queries'
import { formatCents } from './entretiens.logic'
import type { MaintenanceRow, MaintenanceInsert, MaintenanceType } from './entretiens.types'
import type { ChargePick } from '../../shared/types/charges'
import { DeleteButton } from '../../shared/ui/DeleteButton'
import { Field } from '../../shared/ui/Field'
import { ListeDeroulante } from '../../shared/ui/ListeDeroulante'

interface Props {
  open: boolean
  onClose: () => void
  maintenance?: MaintenanceRow | null
  onSaved: () => void
  /**
   * Pré-remplissage depuis la file d'attente (FileAttenteEntretiens) : la
   * charge est déjà choisie et sa lecture OCR déjà faite, il ne reste qu'à
   * vérifier et enregistrer. Ignoré en édition (`maintenance` prime toujours).
   */
  initialCharge?: ChargePick | null
  initialOcr?: LectureOcr | null
}

type Lookup = { id: string; label: string; plate?: string | null }


const EMPTY_FORM = {
  date: new Date().toISOString().slice(0, 10),
  vehicle_id: '',
  type: '',
  description: '',
  mileage_km: '',
  cost_ht_str: '',
  tva_str: '',
  supplier_id: '',
  next_due_date: '',
  next_due_km: '',
  notes: '',
  chargeId: '',
}

export function DrawerEntretien({
  open, onClose, maintenance, onSaved, initialCharge = null, initialOcr = null,
}: Props) {
  const { companyId } = useProfile()
  const { toast } = useToast()
  const isEdit = !!maintenance

  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [vehicles, setVehicles] = useState<Lookup[]>([])
  const [suppliers, setSuppliers] = useState<Lookup[]>([])
  const [selectorOpen, setSelectorOpen] = useState(false)
  const [linkedCharge, setLinkedCharge] = useState<ChargePick | null>(null)

  useEffect(() => {
    if (!open) return
    // La PLAQUE relie le libellé d'une facture à un véhicule, sans ambiguïté.
    supabase.from('vehicles').select('id, label, plate').order('label')
      .then(({ data }) => setVehicles((data ?? []).map(v => ({ id: v.id, label: v.label, plate: v.plate }))))
    supabase.from('suppliers').select('id, name').eq('active', true).order('name')
      .then(({ data }) => setSuppliers((data ?? []).map(s => ({ id: s.id, label: s.name }))))
  }, [open])

  useEffect(() => {
    if (maintenance) {
      setForm({
        date: maintenance.date,
        vehicle_id: maintenance.vehicle_id,
        type: maintenance.type ?? '',
        description: maintenance.description ?? '',
        mileage_km: maintenance.mileage_km != null ? String(maintenance.mileage_km) : '',
        cost_ht_str: (maintenance.cost_ht_cts ?? maintenance.cost_cts) != null ? ((maintenance.cost_ht_cts ?? maintenance.cost_cts)! / 100).toFixed(2) : '',
        tva_str: maintenance.tva_cts != null ? (maintenance.tva_cts / 100).toFixed(2) : '',
        supplier_id: maintenance.supplier_id ?? '',
        next_due_date: maintenance.next_due_date ?? '',
        next_due_km: maintenance.next_due_km != null ? String(maintenance.next_due_km) : '',
        notes: maintenance.notes ?? '',
        chargeId: maintenance.charge_id ?? '',
      })
      if (maintenance.charges) {
        setLinkedCharge({
          id: maintenance.charges.id,
          date: maintenance.date,
          label: maintenance.charges.label,
          montant_ht_cts: maintenance.cost_ht_cts ?? 0,
          montant_ttc_cts: maintenance.charges.montant_ttc_cts,
          tva_cts: maintenance.tva_cts,
          tva_rate: 0,
          receipt_url: maintenance.charges.receipt_url,
          pennylane_id: maintenance.charges.pennylane_id,
          supplier_id: null,
          category_id: null,
          charge_categories: null,
          suppliers: null,
        })
      } else {
        setLinkedCharge(null)
      }
    } else if (initialCharge) {
      // Vient de la file d'attente (FileAttenteEntretiens) : la charge est
      // déjà choisie, l'OCR déjà fait. On applique les deux d'un coup — il ne
      // reste à l'utilisateur qu'à vérifier et enregistrer.
      setLinkedCharge(initialCharge)
      setForm(prefillDepuisCharge(
        { ...EMPTY_FORM, date: new Date().toISOString().slice(0, 10) }, initialCharge, vehicles,
      ))
      if (initialOcr?.kilometrage != null) {
        setForm(p => ({ ...p, mileage_km: String(Math.round(initialOcr.kilometrage as number)) }))
      }
    } else {
      setForm({ ...EMPTY_FORM, date: new Date().toISOString().slice(0, 10) })
      setLinkedCharge(null)
    }
    // `vehicles` inclus : encore vide au tout premier rendu (chargement async
    // dans l'effet du dessus), le véhicule devinable depuis la charge ne
    // peut se déduire qu'une fois la liste arrivée.
  }, [maintenance, open, initialCharge, initialOcr, vehicles])

  const set = (k: keyof typeof form, v: string) => setForm(p => ({ ...p, [k]: v }))

  /**
   * Rattacher une facture pre-remplit ce que son libelle dit deja.
   *
   * « E.LECLERC MASTIC FG-788-FB OPEL MOVANO » nomme le vehicule par sa
   * plaque, et la description de l'operation est le libelle lui-meme debarrasse
   * du fournisseur. Rien de tout cela ne demande d'IA.
   *
   * On n'ECRASE jamais une valeur deja saisie.
   */
  const handleChargeSelect = (charge: ChargePick) => {
    setLinkedCharge(charge)
    setForm(prev => prefillDepuisCharge(prev, charge, vehicles))
  }

  /**
   * Lecture du JUSTIFICATIF, pour le KILOMETRAGE — la seule information utile
   * qu'une facture d'entretien porte et qu'un libelle ne dira jamais.
   *
   * A la demande : c'est un OCR, quelques secondes, et faillible.
   */
  const [lectureEnCours, setLectureEnCours] = useState(false)

  const lireLeJustificatif = async () => {
    if (!linkedCharge) return
    setLectureEnCours(true)
    try {
      // force: true — clic explicite de l'utilisateur, contrairement à la
      // file d'attente qui se contente du résultat déjà mémorisé.
      const { data, error } = await supabase.functions.invoke('lire-facture', {
        body: { charge_id: linkedCharge.id, force: true },
      })
      if (error || !data?.ok) {
        toast(data?.error ?? error?.message ?? 'Lecture indisponible', 'error')
        return
      }
      const lu = parseLectureOcr(data.data)
      if (lu.kilometrage == null) {
        toast(lu.raison === 'aucun justificatif'
          ? 'Cette facture n\'a pas de justificatif à lire'
          : lu.raison === 'service surchargé'
          ? 'Service de lecture surchargé — réessaie dans quelques instants'
          : 'Aucun kilométrage lisible sur le justificatif')
        return
      }
      setForm(prev => ({ ...prev, mileage_km: String(Math.round(lu.kilometrage as number)) }))
      toast('Kilométrage lu — vérifie avant d\'enregistrer')
    } finally {
      setLectureEnCours(false)
    }
  }

  const handleDetach = () => {
    setLinkedCharge(null)
    set('chargeId', '')
  }

  // Tout en HT : le HT est saisi (ou repris de la facture Pennylane), la TVA se déduit (20 % par défaut,
  // modifiable), le TTC n'est qu'un total pour Pennylane et la trésorerie.
  const htCts = form.cost_ht_str ? Math.round(parseFloat(form.cost_ht_str) * 100) : null
  const tvaCts = htCts == null ? null : form.tva_str !== '' ? Math.round(parseFloat(form.tva_str) * 100) : Math.round(htCts * 0.2)
  const costCts = htCts == null ? null : htCts + (tvaCts ?? 0)

  const handleSave = async () => {
    if (!form.vehicle_id) { toast('Le véhicule est requis', 'error'); return }
    if (!form.date) { toast('La date est requise', 'error'); return }

    setSaving(true)
    try {
      const payload = {
        date: form.date,
        vehicle_id: form.vehicle_id,
        type: (form.type || null) as MaintenanceType | null,
        description: form.description || null,
        mileage_km: form.mileage_km ? parseInt(form.mileage_km) : null,
        cost_cts: costCts,
        cost_ht_cts: htCts,
        tva_cts: tvaCts,
        // Le président a regardé cette fiche : le HT est vérifié.
        ht_verifie_le: new Date().toISOString(),
        supplier_id: form.supplier_id || null,
        next_due_date: form.next_due_date || null,
        next_due_km: form.next_due_km ? parseInt(form.next_due_km) : null,
        receipt_url: linkedCharge?.receipt_url ?? (isEdit ? maintenance?.receipt_url ?? null : null),
        notes: form.notes || null,
        charge_id: form.chargeId || null,
      }

      if (isEdit && maintenance) {
        const { error } = await updateMaintenance(maintenance.id, payload)
        if (error) throw error
        toast('Entretien mis à jour')
      } else {
        if (!companyId) throw new Error('Profil non chargé')
        const { error } = await createMaintenance({ ...payload, company_id: companyId } as MaintenanceInsert)
        if (error) throw error
        toast('Entretien enregistré')
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
    const { error } = await deleteMaintenance(maintenance!.id)
    if (error) throw error
    toast('Entretien supprimé')
    onSaved()
    onClose()
  }

  const drawerTitle = isEdit
    ? `Entretien — ${maintenance!.vehicles?.label ?? '...'}`
    : 'Nouvel entretien'

  return (
    <>
      <Drawer open={open} onClose={onClose} title={drawerTitle}>
        <div className="flex flex-col gap-4">
          {isEdit && maintenance && (
            <div className="flex items-center gap-2 mb-1">
              {maintenance.charges && <Badge color="success">Facturé</Badge>}
              <span className="ml-auto font-mono text-xs text-[var(--text-muted)]">
                {new Date(maintenance.date).toLocaleDateString('fr-FR')}
              </span>
            </div>
          )}

          {/* ── Rapprochement charge ─────────────────────────────────────────── */}
          {linkedCharge ? (
            <>
              <LinkedChargeCard charge={linkedCharge} onDetach={handleDetach} />
              <button
                type="button"
                onClick={lireLeJustificatif}
                disabled={lectureEnCours}
                className="flex items-center gap-2 px-4 min-h-[44px] rounded-[var(--r-md)]
                  border border-[var(--border)] text-sm text-[var(--text)]
                  hover:border-[var(--brand)] transition-colors disabled:opacity-50"
              >
                <ScanLine size={15} />
                {lectureEnCours ? 'Lecture…' : 'Lire le justificatif (kilométrage)'}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setSelectorOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-[var(--r-md)] border border-dashed border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--brand)] hover:text-[var(--brand)] transition-colors text-sm"
            >
              <Link2 size={14} />
              Rapprocher une facture
            </button>
          )}

          {/* ── Ventilation de la facture (décompose LA charge liée en sous-lignes) */}
          {linkedCharge && linkedCharge.montant_ttc_cts != null && linkedCharge.montant_ttc_cts > 0 && (
            <div className="rounded-[var(--r-lg)] border border-[var(--border)] p-4 flex flex-col gap-3">
              <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">
                Ventilation de la facture
              </span>
              <VentilationFacture
                chargeId={linkedCharge.id}
                chargeAmountCts={linkedCharge.montant_ttc_cts}
                categoryType="entretien"
                onChanged={onSaved}
              />
            </div>
          )}

          {/* ── Ventilation partielle (édition uniquement — cible = cet entretien) */}
          {isEdit && maintenance && costCts != null && costCts > 0 && (
            <div className="rounded-[var(--r-lg)] border border-[var(--border)] p-4 flex flex-col gap-3">
              <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">
                Ventilation (allocations partielles)
              </span>
              <PanneauVentilation
                targetTable="vehicle_maintenances"
                targetId={maintenance.id}
                targetAmountCts={costCts}
                fetchCharges={() => getUnlinkedChargesFor('vehicle_maintenances')}
                onChanged={onSaved}
              />
            </div>
          )}

          {/* Le champ « Type » a ete retire : il proposait une liste figee que
              l'utilisateur ne pouvait pas faire evoluer. Ce sont desormais les
              categories, librement creees, qui disent de quoi il s'agit — et
              une meme facture peut en porter plusieurs, ce qu'un « type »
              unique ne permettait pas. La colonne reste en base : l'historique
              deja saisi n'est pas detruit, il n'est simplement plus affiche. */}
          <Field label="Date *">
            <Input type="date" value={form.date} onChange={v => set('date', v)} />
          </Field>

          <Field label="Véhicule *">
            <ListeDeroulante valeur={form.vehicle_id} ariaLabel="Véhicule" placeholder="— Sélectionner un véhicule —" recherche={false}
              onChange={v => set('vehicle_id', v)} options={vehicles.map(v => ({ valeur: v.id, libelle: v.label, detail: v.plate ?? undefined }))} />
          </Field>

          <Field label="Description">
            <Input value={form.description} onChange={v => set('description', v)}
              placeholder="Détail de l'intervention…" />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label={linkedCharge ? 'Coût HT (€) — depuis la facture' : 'Coût HT (€)'}>
              <Input type="number" value={form.cost_ht_str} onChange={v => set('cost_ht_str', v)}
                placeholder="0.00" />
            </Field>
            <Field label="Kilométrage">
              <Input type="number" value={form.mileage_km} onChange={v => set('mileage_km', v)}
                placeholder="125000" />
            </Field>
          </div>

          {htCts != null && htCts !== 0 && (
            <div className="grid grid-cols-2 gap-3 items-end">
              <Field label={`TVA (€)${form.tva_str === '' ? ' — auto 20 %' : ''}`}>
                <Input type="number" value={form.tva_str} onChange={v => set('tva_str', v)}
                  placeholder={((tvaCts ?? 0) / 100).toFixed(2)} />
              </Field>
              <div className="flex items-center justify-between px-4 min-h-[44px] rounded-[var(--r-md)] bg-[var(--bg-elevated)] border border-[var(--border)]">
                <span className="text-sm text-[var(--text-muted)]">TTC (pour info)</span>
                <span className="font-mono font-semibold text-[var(--text)]">{formatCents(costCts ?? 0)}</span>
              </div>
            </div>
          )}

          <Field label="Prestataire / Garage">
            <ListeDeroulante valeur={form.supplier_id} ariaLabel="Prestataire" placeholder="— Aucun —"
              onChange={v => set('supplier_id', v)} options={[{ valeur: '', libelle: '— Aucun —' }, ...suppliers.map(s => ({ valeur: s.id, libelle: s.label }))]} />
          </Field>

          {/* Prochaine échéance */}
          <div className="rounded-[var(--r-lg)] border border-[var(--border)] p-4 flex flex-col gap-3">
            <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">
              Prochaine échéance
            </span>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Date">
                <Input type="date" value={form.next_due_date} onChange={v => set('next_due_date', v)} />
              </Field>
              <Field label="Kilométrage">
                <Input type="number" value={form.next_due_km} onChange={v => set('next_due_km', v)}
                  placeholder="135000" />
              </Field>
            </div>
          </div>

          <Field label="Notes">
            <textarea
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              rows={3}
              placeholder="Observations, pièces remplacées…"
              className={`${inputCls} field-area resize-none`}
            />
          </Field>

          <div className="flex items-center gap-2 pt-3 border-t border-[var(--border)]">
            <Button variant="primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Enregistrement…' : isEdit && maintenance?.ht_verifie_le == null ? 'Valider' : 'Enregistrer'}
            </Button>
            <Button variant="secondary" onClick={onClose}>Annuler</Button>
            {isEdit && (
              <DeleteButton
                onDelete={handleDelete}
                confirmTitle="Supprimer cet entretien ?"
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
        fetchCharges={() => getUnlinkedChargesFor('vehicle_maintenances')}
      />
    </>
  )
}

/**
 * Ce qu'une charge Pennylane rattachée dit d'elle-même, appliqué au formulaire.
 *
 * N'ÉCRASE jamais une valeur déjà saisie (`prev.x ||`) : la lecture propose,
 * elle ne corrige pas quelqu'un qui vient de taper.
 */
function prefillDepuisCharge(
  prev: typeof EMPTY_FORM,
  charge: ChargePick,
  vehicles: Lookup[] = [],
): typeof EMPTY_FORM {
  const vehiculeId = trouverVehicule(charge.label, vehicles)

  return {
    ...prev,
    chargeId: charge.id,
    date: charge.date,
    supplier_id: charge.supplier_id ?? prev.supplier_id,
    vehicle_id: prev.vehicle_id || (vehiculeId ?? ''),
    description: prev.description || descriptionDepuisLibelle(charge.label, charge.suppliers?.name),
    cost_ht_str: charge.montant_ht_cts != null
      ? (charge.montant_ht_cts / 100).toFixed(2)
      : prev.cost_ht_str,
    tva_str: charge.tva_cts != null ? (charge.tva_cts / 100).toFixed(2) : prev.tva_str,
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

