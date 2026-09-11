import { useState, useEffect } from 'react'
import { Trash2, Lock } from 'lucide-react'
import { Drawer } from '../../shared/ui/Drawer'
import { Button } from '../../shared/ui/Button'
import { Badge } from '../../shared/ui/Badge'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { useToast } from '../../shared/ui/useToast'
import { supabase, useProfile } from '../../app/providers'
import { usePermissions } from '../../shared/permissions/usePermissions'
import { createCharge, updateCharge, deleteCharge, getChargesPennylaneProches } from './charges.queries'
import { trouverDoublonsPennylane, type Doublon, type ChargeConnue } from './doublons.logic'
import { categoryColor, formatCents } from './charges.logic'
import { fromHtAndRate, fromHtAndManualTva } from '../../shared/lib/montants'
import { TvaRateInput } from '../../shared/ui/TvaRateInput'
import { FacturePdfLink } from '../../shared/ui/FacturePdfLink'
import { VentilationFacture } from '../../shared/ui/VentilationFacture'
import type { ChargeRow, ChargeInsert, ChargeCategoryRow } from './charges.types'
import { Field } from '../../shared/ui/Field'

interface Props {
  open: boolean
  onClose: () => void
  charge?: ChargeRow | null
  onSaved: () => void
  categories: ChargeCategoryRow[]
  /** Valeurs de depart pour une creation (ex. un ticket chauffeur). Elles
   *  remplissent le formulaire et restent entierement modifiables : le
   *  pre-remplissage propose, il n'impose pas. */
  prefill?: { date?: string; label?: string; notes?: string } | null
  /** Appele apres une CREATION reussie, avec l'identifiant de la charge.
   *  Permet a l'appelant de rattacher ce qui doit l'etre (ticket, piece). */
  onCreated?: (chargeId: string) => void | Promise<void>
}

type Lookup = { id: string; label: string }


const EMPTY_FORM = {
  date: new Date().toISOString().slice(0, 10),
  label: '',
  category_id: '',
  supplier_id: '',
  montant_ht: '',
  tva_rate: '20',
  tva_amount: '',
  notes: '',
  mode_paiement: 'qonto' as 'qonto' | 'note_de_frais' | 'especes' | 'prepaye' | 'autre',
  avance_par: '',
  rembourse_le: '',
}

const MODE_PAIEMENT_LABELS: Record<string, string> = {
  qonto:         'Qonto (compte pro)',
  note_de_frais: 'Note de frais',
  especes:       'Espèces',
  prepaye:       'Jetons / prépayé',
  autre:         'Autre canal',
}

export function DrawerCharge({ open, onClose, charge, onSaved, categories, prefill, onCreated }: Props) {
  const { companyId } = useProfile()
  const { toast } = useToast()
  const isEdit = !!charge
  const isPennylane = !!charge?.pennylane_id
  const { can } = usePermissions()

  const [form, setForm] = useState(EMPTY_FORM)
  const [isAvoir, setIsAvoir] = useState(false)
  const [tvaTouched, setTvaTouched] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  // `prefill` arrive sous forme d'objet litteral, donc RECREE a chaque rendu
  // du parent. Le mettre tel quel dans les dependances de l'effet de
  // pre-remplissage le ferait rejouer a CHAQUE rendu, ce qui effacerait la
  // saisie en cours. On depend donc des trois valeurs elles-memes, qui sont
  // des chaines : elles ne changent que si le ticket source change.
  const prefillDate  = prefill?.date
  const prefillLabel = prefill?.label
  const prefillNotes = prefill?.notes

  const [doublons, setDoublons] = useState<Doublon[]>([])
  const [doublonsAcceptes, setDoublonsAcceptes] = useState(false)
  const [nomsFournisseurs, setNomsFournisseurs] = useState<Record<string, string>>({})
  const [suppliers, setSuppliers] = useState<Lookup[]>([])
  const [teamMembers, setTeamMembers] = useState<Lookup[]>([])

  useEffect(() => {
    if (!open) return
    supabase.from('suppliers').select('id, name').eq('active', true).order('name')
      .then(({ data }) => setSuppliers((data ?? []).map(s => ({ id: s.id, label: s.name }))))
    supabase.from('team_members').select('id, full_name').eq('active', true).order('full_name')
      .then(({ data }) => setTeamMembers((data ?? []).map(t => ({ id: t.id, label: t.full_name }))))
  }, [open])

  useEffect(() => {
    if (charge) {
      const negative = charge.montant_ht_cts < 0
      setIsAvoir(negative)
      setTvaTouched(charge.tva_cts != null)
      setForm({
        date: charge.date,
        label: charge.label,
        category_id: charge.category_id ?? '',
        supplier_id: charge.supplier_id ?? '',
        montant_ht: (Math.abs(charge.montant_ht_cts) / 100).toFixed(2),
        tva_rate: String(charge.tva_rate ?? 20),
        tva_amount: charge.tva_cts != null
          ? (Math.abs(charge.tva_cts) / 100).toFixed(2) : '',
        notes: charge.notes ?? '',
        mode_paiement: (charge.mode_paiement ?? 'qonto') as typeof EMPTY_FORM.mode_paiement,
        avance_par: charge.avance_par ?? '',
        rembourse_le: charge.rembourse_le ?? '',
      })
    } else {
      setIsAvoir(false)
      setTvaTouched(false)
      setForm({
        ...EMPTY_FORM,
        date:  prefillDate  ?? new Date().toISOString().slice(0, 10),
        label: prefillLabel ?? '',
        notes: prefillNotes ?? '',
      })
    }
  }, [charge, open, prefillDate, prefillLabel, prefillNotes])

  const set = (k: keyof typeof form, v: string) => setForm(p => ({ ...p, [k]: v }))

  // L'utilisateur saisit toujours positif ; le signe est appliqué à l'enregistrement
  const absHtCts = Math.round(parseFloat(form.montant_ht || '0') * 100)
  const tvaRate = parseFloat(form.tva_rate || '20')
  const tvaAmtCts = Math.round(parseFloat(form.tva_amount || '0') * 100)
  const sign = isAvoir ? -1 : 1

  const montants = tvaTouched && tvaAmtCts > 0
    ? fromHtAndManualTva(absHtCts, tvaAmtCts)
    : fromHtAndRate(absHtCts, tvaRate)

  const htCts = sign * montants.ht_cts
  const tvaCts = sign * montants.tva_cts
  const ttcCts = sign * montants.ttc_cts

  // Auto-suggère la TVA quand HT ou taux changent et que l'utilisateur n'a pas surchargé la TVA
  useEffect(() => {
    if (tvaTouched) return
    const ht = Math.round(parseFloat(form.montant_ht || '0') * 100)
    const rate = parseFloat(form.tva_rate || '20')
    if (ht <= 0) { setForm(p => ({ ...p, tva_amount: '' })); return }
    const suggested = fromHtAndRate(ht, rate).tva_cts
    setForm(p => ({ ...p, tva_amount: (suggested / 100).toFixed(2) }))
  }, [form.montant_ht, form.tva_rate, tvaTouched])

  /**
   * Controle anti-doublon, relance a chaque changement de montant, de date ou
   * de fournisseur.
   *
   * Deliberement PENDANT la saisie et pas au moment d'enregistrer : prevenir
   * quelqu'un qui a fini de taper, c'est l'obliger a tout relire. Le delai de
   * 400 ms evite d'interroger la base a chaque touche du pave numerique.
   *
   * Une charge qui vient elle-meme de Pennylane n'est pas controlee : elle
   * n'est de toute facon pas modifiable ici.
   */
  useEffect(() => {
    if (!open || isPennylane) { setDoublons([]); return }
    const ttc = Math.abs(ttcCts)
    if (ttc <= 0 || !form.date) { setDoublons([]); return }

    let annule = false
    const t = setTimeout(async () => {
      const jour = 86_400_000
      const d = Date.parse(`${form.date}T00:00:00Z`)
      if (Number.isNaN(d)) { setDoublons([]); return }
      const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10)

      const { data } = await getChargesPennylaneProches(ttc, iso(d - 7 * jour), iso(d + 7 * jour))
      if (annule) return

      const lignes = (data ?? []) as unknown as Array<ChargeConnue & { suppliers: { name: string } | null }>
      setNomsFournisseurs(Object.fromEntries(
        lignes.filter(l => l.supplier_id && l.suppliers?.name).map(l => [l.supplier_id!, l.suppliers!.name]),
      ))
      setDoublons(trouverDoublonsPennylane(
        { id: charge?.id ?? null, date: form.date, montant_ttc_cts: ttc,
          supplier_id: form.supplier_id || null, label: form.label },
        lignes,
      ))
      setDoublonsAcceptes(false)
    }, 400)

    return () => { annule = true; clearTimeout(t) }
  }, [open, isPennylane, ttcCts, form.date, form.supplier_id, form.label, charge?.id])

  const doublonBloquant = doublons.length > 0 && !doublonsAcceptes

  const handleSave = async () => {
    if (!form.label.trim()) { toast('Le libellé est requis', 'error'); return }
    if (!form.date) { toast('La date est requise', 'error'); return }
    if (absHtCts <= 0) { toast('Le montant HT doit être supérieur à 0', 'error'); return }
    // Meme garde qu'a l'affichage, mais cote action : le bouton desactive ne
    // protege pas d'une validation au clavier ni d'un double-clic pendant que
    // le controle se termine.
    if (doublonBloquant) {
      toast('Facture déjà présente dans Pennylane — coche la case pour forcer', 'error'); return
    }

    setSaving(true)
    try {
      const payload: Omit<ChargeInsert, 'company_id'> = {
        date: form.date,
        label: form.label.trim(),
        category_id: form.category_id || null,
        supplier_id: form.supplier_id || null,
        montant_ht_cts: htCts,
        tva_rate: tvaRate,
        tva_cts: tvaCts,
        montant_ttc_cts: ttcCts,
        receipt_url: null,
        notes: form.notes || null,
        mode_paiement: form.mode_paiement,
        // Champs uniquement pertinents pour la note de frais — sinon null pour
        // ne pas polluer avec des données obsolètes si l'utilisateur bascule.
        avance_par: form.mode_paiement === 'note_de_frais' ? (form.avance_par || null) : null,
        rembourse_le: form.mode_paiement === 'note_de_frais' ? (form.rembourse_le || null) : null,
      }

      if (isEdit && charge) {
        const { error } = await updateCharge(charge.id, payload)
        if (error) throw error
        toast('Charge mise à jour')
      } else {
        if (!companyId) throw new Error('Profil non chargé')
        const { data: creee, error } = await createCharge({ ...payload, company_id: companyId })
        if (error) throw error
        toast('Charge créée')
        if (creee?.id) await onCreated?.(creee.id)
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
    if (!charge) return
    setDeleting(true)
    const { error } = await deleteCharge(charge.id)
    setDeleting(false)
    if (error) { toast(error.message, 'error'); return }
    setConfirmDelete(false)
    toast('Charge supprimée')
    onSaved()
    onClose()
  }

  const currentCat = charge?.charge_categories ?? null

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={isEdit ? `Charge — ${charge!.label}` : 'Nouvelle charge'}
    >
      <div className="flex flex-col gap-4">
        {/* Bandeau verrouillage Pennylane */}
        {isPennylane && (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-[var(--r-md)] bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--fs-sm)] text-[var(--text-muted)]">
            <Lock size={14} className="shrink-0" />
            <span>Géré dans Pennylane — lecture seule</span>
            <FacturePdfLink
              pennylane_id={charge?.pennylane_id}
              receipt_url={charge?.receipt_url}
              label="Voir la facture"
              className="ml-auto inline-flex items-center gap-1 text-[var(--info)] hover:underline text-[var(--fs-xs)] disabled:opacity-50"
            />
          </div>
        )}

        {/* Immobilisation — jamais modifiable ici (posée par migration/pennylane-sync) */}
        {charge?.est_immobilisation && (
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-[var(--r-md)] bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--fs-sm)]">
            <Badge color="purple">Immobilisation</Badge>
            <span className="text-[var(--text-muted)] text-[var(--fs-xs)]">
              Cette facture est comptabilisée en immobilisation dans Pennylane — elle n'est pas
              incluse dans les charges d'exploitation.
            </span>
          </div>
        )}

        {isEdit && currentCat && (
          <div className="flex items-center gap-2 mb-1">
            <Badge color={categoryColor(currentCat.slug)}>{currentCat.name}</Badge>
            <span className="ml-auto font-mono text-[var(--fs-xs)] text-[var(--text-muted)]">
              {new Date(charge!.date).toLocaleDateString('fr-FR')}
            </span>
          </div>
        )}

        {/* Toggle Charge / Avoir — masqué pour les charges Pennylane */}
        {!isPennylane && (
          <div className="flex rounded-[var(--r-md)] border border-[var(--border)] overflow-hidden text-[var(--fs-sm)] self-start">
            <button
              type="button"
              onClick={() => setIsAvoir(false)}
              className={`px-4 py-1.5 transition-colors ${!isAvoir
                ? 'bg-[var(--brand)] text-white font-medium'
                : 'bg-[var(--bg)] text-[var(--text-muted)] hover:bg-[var(--bg-elevated)]'}`}
            >
              Charge
            </button>
            <button
              type="button"
              onClick={() => setIsAvoir(true)}
              className={`px-4 py-1.5 transition-colors ${isAvoir
                ? 'bg-[var(--loss)] text-white font-medium'
                : 'bg-[var(--bg)] text-[var(--text-muted)] hover:bg-[var(--bg-elevated)]'}`}
            >
              Avoir
            </button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Date *">
            <Input type="date" value={form.date} onChange={v => set('date', v)} />
          </Field>
          <Field label="Catégorie">
            <select value={form.category_id} onChange={e => set('category_id', e.target.value)} className={inputCls}>
              <option value="">— Aucune —</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
        </div>

        <Field label="Libellé *">
          <Input value={form.label} onChange={v => set('label', v)} placeholder="Description de la charge…" />
        </Field>

        <Field label="Fournisseur">
          <select value={form.supplier_id} onChange={e => set('supplier_id', e.target.value)} className={inputCls}>
            <option value="">— Aucun —</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </Field>

        {/* Mode de paiement — hors Qonto → sort du compteur "à rapprocher".
         *   Note de frais → révèle "avancé par" + "remboursé le". */}
        <Field label="Mode de paiement">
          <select
            value={form.mode_paiement}
            onChange={e => set('mode_paiement', e.target.value as typeof form.mode_paiement)}
            className={inputCls}
            disabled={isPennylane}
          >
            {(Object.keys(MODE_PAIEMENT_LABELS) as Array<keyof typeof MODE_PAIEMENT_LABELS>).map(k => (
              <option key={k} value={k}>{MODE_PAIEMENT_LABELS[k]}</option>
            ))}
          </select>
        </Field>

        {form.mode_paiement === 'note_de_frais' && (
          <div className="grid grid-cols-2 gap-3">
            {!form.rembourse_le && (
              <div className="col-span-2 -mb-1">
                <Badge color="warning">À rembourser</Badge>
              </div>
            )}
            <Field label="Avancé par">
              <select
                value={form.avance_par}
                onChange={e => set('avance_par', e.target.value)}
                className={inputCls}
                disabled={isPennylane}
              >
                <option value="">— Choisir —</option>
                {teamMembers.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </Field>
            <Field label={`Remboursé le${form.rembourse_le ? '' : ' (à rembourser)'}`}>
              <Input
                type="date"
                value={form.rembourse_le}
                onChange={v => set('rembourse_le', v)}
                disabled={isPennylane}
              />
            </Field>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Montant HT (€) *">
            <Input type="number" value={form.montant_ht} onChange={v => set('montant_ht', v)} placeholder="0.00" />
          </Field>
          <Field label="TVA (%)">
            <TvaRateInput
              value={parseFloat(form.tva_rate || '20')}
              onChange={r => { set('tva_rate', String(r)); setTvaTouched(false) }}
              disabled={isPennylane}
            />
          </Field>
        </div>

        <Field label={`Montant TVA (€)${tvaTouched ? ' ✎' : ' — auto'}`}>
          <Input
            type="number"
            value={form.tva_amount}
            onChange={v => { set('tva_amount', v); setTvaTouched(true) }}
            placeholder="0.00"
            disabled={isPennylane}
          />
        </Field>

        {absHtCts > 0 && (
          <div className="rounded-[var(--r-md)] bg-[var(--bg-elevated)] border border-[var(--border)] divide-y divide-[var(--border)] overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5">
              <span className="text-[var(--fs-sm)] font-medium text-[var(--text)]">Total TTC</span>
              <span className="font-mono font-semibold text-[var(--text)]">{formatCents(ttcCts)}</span>
            </div>
          </div>
        )}

        <Field label="Notes">
          <textarea
            value={form.notes}
            onChange={e => set('notes', e.target.value)}
            rows={3}
            placeholder="Notes internes…"
            className={`${inputCls} field-area resize-none`}
          />
        </Field>

        {/* Ventilation : découpe la facture en lignes, chacune avec sa catégorie.
            Le mécanisme existait mais n'était branché que dans Entretiens — d'où
            l'impression qu'une facture ne pouvait porter qu'une seule catégorie.
            Réservée à l'édition : il faut une charge enregistrée pour y rattacher
            des lignes. */}
        {isEdit && charge && charge.montant_ttc_cts != null && charge.montant_ttc_cts > 0 && (
          <div className="rounded-[var(--r-lg)] border border-[var(--border)] p-4 flex flex-col gap-3">
            <div className="flex flex-col gap-0.5">
              <span className="text-[var(--fs-xs)] font-semibold text-[var(--text-muted)] uppercase tracking-wide">
                Ventilation par catégorie
              </span>
              <span className="text-[var(--fs-xs)] text-[var(--text-muted)]">
                Pour une facture qui couvre plusieurs postes (lave-glace et AdBlue, par exemple).
              </span>
            </div>
            <VentilationFacture
              chargeId={charge.id}
              chargeAmountCts={charge.montant_ttc_cts}
              onChanged={onSaved}
            />
          </div>
        )}

        {/* Garde-fou anti-doublon. Place JUSTE AU-DESSUS du bouton, la ou le
            regard se trouve au moment de valider — un avertissement en haut
            d'un formulaire long n'est jamais relu. */}
        {doublons.length > 0 && (
          <div className="rounded-[var(--r-lg)] border border-[var(--warning)]/50 bg-[var(--warning)]/10 p-4 flex flex-col gap-3 anim-sheet">
            <div className="flex flex-col gap-0.5">
              <span className="text-[var(--fs-sm)] font-semibold text-[var(--warning)]">
                {doublons.length === 1
                  ? 'Cette facture existe peut-être déjà dans Pennylane'
                  : `${doublons.length} factures Pennylane ressemblent à celle-ci`}
              </span>
              <span className="text-[var(--fs-xs)] text-[var(--text-muted)]">
                Comparaison faite sur les factures déjà rapatriées de Pennylane. Une facture
                saisie chez Pennylane à l'instant peut ne pas encore y figurer.
              </span>
            </div>

            <ul className="flex flex-col gap-2">
              {doublons.map(d => (
                <li key={d.charge.id}
                    className="flex items-start justify-between gap-3 rounded-[var(--r-md)] bg-[var(--bg-deep)] px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-[var(--fs-sm)] text-[var(--text)] truncate">{d.charge.label}</p>
                    <p className="text-[var(--fs-xs)] text-[var(--text-muted)]">
                      {d.charge.date}
                      {d.charge.supplier_id && nomsFournisseurs[d.charge.supplier_id]
                        ? ` · ${nomsFournisseurs[d.charge.supplier_id]}` : ''}
                      {' · '}{d.raison}
                    </p>
                  </div>
                  <span className={`shrink-0 text-[var(--fs-xs)] font-medium ${
                    d.niveau === 'certain' ? 'text-[var(--danger)]' : 'text-[var(--warning)]'
                  }`}>
                    {d.niveau === 'certain' ? 'Quasi sûr' : 'Possible'}
                  </span>
                </li>
              ))}
            </ul>

            {/* « Pennylane en priorite » : on ne bloque pas definitivement,
                mais on oblige a dire oui une fois. Sans ce clic, le bouton
                Enregistrer reste inactif. */}
            <label className="flex items-center gap-2 text-[var(--fs-sm)] text-[var(--text)] cursor-pointer">
              <input type="checkbox" checked={doublonsAcceptes}
                     onChange={e => setDoublonsAcceptes(e.target.checked)} />
              Ce n'est pas un doublon, enregistrer quand même
            </label>
          </div>
        )}

        <div className="flex items-center gap-2 pt-3 border-t border-[var(--border)]">
          {!isPennylane && can('finance.charges', isEdit ? 'update' : 'create') && (
            <Button variant="primary" onClick={handleSave} disabled={saving || doublonBloquant}>
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>Fermer</Button>
          {isEdit && !isPennylane && can('finance.charges', 'delete') && (
            <Button variant="ghost" onClick={() => setConfirmDelete(true)} className="ml-auto text-[var(--danger)]">
              <Trash2 size={14} />
              Supprimer
            </Button>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Supprimer cette charge ?"
        message="Action irréversible."
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
        loading={deleting}
      />
    </Drawer>
  )
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

