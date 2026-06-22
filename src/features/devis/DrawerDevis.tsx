import { useState, useEffect, useMemo } from 'react'
import type { ReactNode } from 'react'
import { Drawer }     from '../../shared/ui/Drawer'
import { TvaRateInput } from '../../shared/ui/TvaRateInput'
import { Button }     from '../../shared/ui/Button'
import { Badge }      from '../../shared/ui/Badge'
import { useToast }   from '../../shared/ui/useToast'
import { useProfile } from '../../app/providers'
import { usePermissions } from '../../shared/permissions/usePermissions'
import { eurosToCentimes, centimesToEuros, formatMoney } from '../../shared/lib/money'
import {
  STATUS_LABELS, STATUS_COLORS, isExpiredDisplay, addDays,
} from './devis.logic'
import {
  createQuote, updateQuote, updateQuoteStatus, deleteQuote,
  listClientsLight, sendToPennylane, convertToInvoice, transformToDelivery,
} from './devis.queries'
import type { Quote, QuoteStatus } from './devis.types'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  open: boolean
  onClose: () => void
  quote?: Quote | null
  onSaved: () => void
}


// ── Helpers ───────────────────────────────────────────────────────────────────

const TODAY = new Date().toISOString().slice(0, 10)

function todayPlus30(): string {
  return addDays(TODAY, 30)
}

const EMPTY_FORM = {
  client_id:   '',
  date:        TODAY,
  valid_until: todayPlus30(),
  description: '',
  amount_ht:   '',
  tva_rate:    20,
  notes:       '',
}

// ── Composant ─────────────────────────────────────────────────────────────────

export function DrawerDevis({ open, onClose, quote, onSaved }: Props) {
  const { companyId } = useProfile()
  const { can } = usePermissions()
  const { toast } = useToast()
  const isEdit = !!quote

  const [form, setForm] = useState(EMPTY_FORM)
  const [clients, setClients] = useState<{ id: string; name: string }[]>([])
  const [saving, setSaving] = useState(false)
  const [actioning, setActioning] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // ── Chargement clients ────────────────────────────────────────────────────

  useEffect(() => {
    if (!open) return
    listClientsLight().then(({ data }) => setClients(data ?? []))
  }, [open])

  // ── Initialisation formulaire ─────────────────────────────────────────────

  useEffect(() => {
    if (quote) {
      setForm({
        client_id:   quote.client_id,
        date:        quote.date,
        valid_until: quote.valid_until ?? todayPlus30(),
        description: quote.description ?? '',
        amount_ht:   quote.amount_ht_cts != null
          ? centimesToEuros(quote.amount_ht_cts).toFixed(2) : '',
        tva_rate:    quote.tva_rate ?? 20,
        notes:       quote.notes ?? '',
      })
    } else {
      setForm({ ...EMPTY_FORM, date: TODAY, valid_until: todayPlus30() })
    }
  }, [quote, open])

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm(p => ({ ...p, [k]: v }))

  // ── Calcul TTC ────────────────────────────────────────────────────────────

  const htCts  = useMemo(() => {
    const v = parseFloat(form.amount_ht)
    return isNaN(v) ? 0 : eurosToCentimes(v)
  }, [form.amount_ht])

  const tvaCts = useMemo(() => Math.round(htCts * form.tva_rate / 100), [htCts, form.tva_rate])
  const ttcCts = useMemo(() => htCts + tvaCts, [htCts, tvaCts])

  // ── Statut courant ─────────────────────────────────────────────────────────

  const statut: QuoteStatus = quote?.statut ?? 'brouillon'
  const isReadOnly = isEdit && statut !== 'brouillon'
  const isTerminal = ['refuse', 'facture', 'expire', 'transforme'].includes(statut)
  const expired    = isExpiredDisplay(quote?.valid_until ?? null, statut)

  // ── Validation ────────────────────────────────────────────────────────────

  function validate(): string | null {
    if (!form.client_id)            return 'Le client est requis'
    if (!form.description.trim())   return 'La description est requise'
    if (htCts <= 0)                 return 'Le montant HT doit être supérieur à 0'
    return null
  }

  // ── Enregistrer ───────────────────────────────────────────────────────────

  const handleSave = async () => {
    const err = validate()
    if (err) { toast(err, 'error'); return }

    setSaving(true)
    try {
      const payload = {
        client_id:      form.client_id,
        date:           form.date,
        valid_until:    form.valid_until || null,
        description:    form.description.trim() || null,
        amount_ht_cts:  htCts,
        tva_rate:       form.tva_rate,
        tva_cts:        tvaCts,
        amount_ttc_cts: ttcCts,
        notes:          form.notes.trim() || null,
      }

      if (isEdit && quote) {
        const { error } = await updateQuote(quote.id, payload)
        if (error) throw error
        toast('Devis mis à jour')
      } else {
        if (!companyId) throw new Error('Profil non chargé')
        const { error } = await createQuote({
          ...payload,
          company_id:            companyId,
          statut:                'brouillon',
          pennylane_quote_id:    null,
          pennylane_invoice_id:  null,
        })
        if (error) throw error
        toast('Devis créé')
      }
      onSaved()
      onClose()
    } catch (e: unknown) {
      toast((e as Error).message ?? 'Erreur', 'error')
    } finally {
      setSaving(false)
    }
  }

  // ── Envoyer chez Pennylane ────────────────────────────────────────────────

  const handleSend = async () => {
    if (!quote) return
    setActioning(true)
    const { data, error } = await sendToPennylane(quote.id)
    if (error || !data?.ok) {
      toast(data?.error ?? (error as Error)?.message ?? 'Erreur Pennylane', 'error')
      setActioning(false)
      return
    }
    await updateQuoteStatus(quote.id, 'envoye')
    toast('Devis envoyé chez Pennylane')
    onSaved()
    onClose()
    setActioning(false)
  }

  // ── Marquer accepté/refusé ────────────────────────────────────────────────

  const handleMark = async (s: QuoteStatus) => {
    if (!quote) return
    setActioning(true)
    const { error } = await updateQuoteStatus(quote.id, s)
    setActioning(false)
    if (error) { toast((error as Error).message ?? 'Erreur', 'error'); return }
    toast(`Devis marqué : ${STATUS_LABELS[s]}`)
    onSaved()
    onClose()
  }

  // ── Transformer en livraison ──────────────────────────────────────────────

  const handleTransform = async () => {
    if (!quote || !companyId) return
    setActioning(true)
    const { error } = await transformToDelivery(quote, companyId)
    setActioning(false)
    if (error) { toast((error as Error).message ?? 'Erreur', 'error'); return }
    toast('Devis transformé en livraison (à planifier)')
    onSaved(); onClose()
  }

  // ── Convertir en facture ──────────────────────────────────────────────────

  const handleConvert = async () => {
    if (!quote) return
    setActioning(true)
    const { data, error } = await convertToInvoice(quote.id)
    if (error || !data?.ok) {
      toast(data?.error ?? (error as Error)?.message ?? 'Erreur Pennylane', 'error')
      setActioning(false)
      return
    }
    await updateQuoteStatus(quote.id, 'facture')
    toast('Devis converti en facture')
    onSaved()
    onClose()
    setActioning(false)
  }

  // ── Supprimer ─────────────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!quote) return
    setDeleting(true)
    const { error } = await deleteQuote(quote.id)
    setDeleting(false)
    if (error) { toast((error as Error).message ?? 'Erreur', 'error'); return }
    setConfirmDelete(false)
    toast('Devis supprimé')
    onSaved()
    onClose()
  }

  const canDelete  = isEdit && can('livraisons.devis', 'delete')
  const isInvoiced = statut === 'facture' || !!quote?.pennylane_invoice_id
  const isLinked   = !!quote?.pennylane_quote_id || !!quote?.pennylane_invoice_id

  const deleteMessage = isInvoiced
    ? "Ce devis est facturé. Le supprimer ici ne touche PAS Pennylane : la facture devra être annulée par un avoir séparément. Action irréversible."
    : isLinked
    ? "Ce devis existe chez Pennylane. Le supprimer ici ne le supprime pas chez Pennylane. Action irréversible."
    : "Action irréversible."

  const deleteAcknowledge = isInvoiced
    ? "Je comprends que ce devis est facturé : la facture Pennylane devra être annulée par un avoir, et cette suppression est irréversible."
    : isLinked
    ? "Je comprends que le devis restera présent chez Pennylane et que cette suppression est irréversible."
    : undefined

  // ── Render ────────────────────────────────────────────────────────────────

  const drawerTitle = isEdit
    ? `Devis — ${quote!.clients?.name ?? '…'}`
    : 'Nouveau devis'

  return (
    <Drawer open={open} onClose={onClose} title={drawerTitle} width="max-w-xl">

      {/* Bandeau statut */}
      {isEdit && (
        <div className="flex items-center gap-2 mb-4">
          <Badge color={STATUS_COLORS[statut]}>{STATUS_LABELS[statut]}</Badge>
          {expired && <Badge color="warning">Expiré</Badge>}
          {quote!.pennylane_quote_id && (
            <span className="ml-auto font-mono text-[var(--fs-xs)] text-[var(--text-muted)]">
              {quote!.pennylane_quote_id}
            </span>
          )}
        </div>
      )}

      <div className="flex flex-col gap-4">

        {/* Client */}
        <Field label="Client *">
          <select
            value={form.client_id}
            onChange={e => set('client_id', e.target.value)}
            disabled={isReadOnly}
            className={inputCls}
          >
            <option value="">— Sélectionner un client —</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date *">
            <input type="date" value={form.date}
              onChange={e => set('date', e.target.value)}
              disabled={isReadOnly} className={inputCls} />
          </Field>
          <Field label="Valable jusqu'au">
            <input type="date" value={form.valid_until}
              onChange={e => set('valid_until', e.target.value)}
              disabled={isReadOnly} className={inputCls} />
          </Field>
        </div>

        {/* Description */}
        <Field label="Description *">
          <input type="text" value={form.description}
            onChange={e => set('description', e.target.value)}
            placeholder="Objet du devis…"
            disabled={isReadOnly} className={inputCls} />
        </Field>

        {/* Montant HT + TVA */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Montant HT (€) *">
            <input type="number" min="0" step="0.01" value={form.amount_ht}
              onChange={e => set('amount_ht', e.target.value)}
              placeholder="0.00"
              disabled={isReadOnly} className={inputCls} />
          </Field>
          <Field label="Taux TVA">
            <TvaRateInput
              value={form.tva_rate}
              onChange={r => set('tva_rate', r)}
              disabled={isReadOnly}
            />
          </Field>
        </div>

        {/* Récap TTC */}
        {htCts > 0 && (
          <div className="rounded-[var(--r-lg)] border border-[var(--border)] divide-y divide-[var(--border)] overflow-hidden">
            <InfoRow label="HT"><span className="font-mono">{formatMoney(htCts)}</span></InfoRow>
            <InfoRow label="TVA"><span className="font-mono">{formatMoney(tvaCts)}</span></InfoRow>
            <InfoRow label="TTC">
              <span className="font-mono font-semibold text-[var(--text)]">{formatMoney(ttcCts)}</span>
            </InfoRow>
          </div>
        )}

        {/* Notes */}
        <Field label="Notes">
          <textarea value={form.notes}
            onChange={e => set('notes', e.target.value)}
            rows={3} placeholder="Notes internes…"
            disabled={isTerminal} className={`${inputCls} resize-none`} />
        </Field>

        {/* Actions principales */}
        <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-[var(--border)]">

          {/* Brouillon : enregistrer + envoyer */}
          {statut === 'brouillon' && (
            <>
              <Button variant="primary" onClick={handleSave} disabled={saving || actioning}>
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </Button>
              {isEdit && (
                <Button variant="secondary" onClick={handleSend} disabled={saving || actioning}>
                  {actioning ? '…' : 'Envoyer chez Pennylane'}
                </Button>
              )}
              <Button variant="secondary" onClick={onClose}>Annuler</Button>
            </>
          )}

          {/* Envoyé : marquer accepté / refusé */}
          {statut === 'envoye' && (
            <>
              <Button variant="primary" onClick={() => handleMark('accepte')} disabled={actioning}>
                {actioning ? '…' : 'Marquer accepté'}
              </Button>
              <Button variant="secondary" onClick={() => handleMark('refuse')} disabled={actioning}
                className="text-[var(--danger)] border-[var(--danger)]/40">
                Marquer refusé
              </Button>
              <Button variant="secondary" onClick={onClose}>Fermer</Button>
            </>
          )}

          {/* Accepté : transformer en livraison + facturer directement + marquer refusé */}
          {statut === 'accepte' && (
            <>
              <Button variant="primary" onClick={handleTransform} disabled={actioning}>
                {actioning ? '…' : 'Transformer en livraison'}
              </Button>
              <Button variant="secondary" onClick={handleConvert} disabled={actioning}>
                Facturer directement
              </Button>
              <Button variant="secondary" onClick={() => handleMark('refuse')} disabled={actioning}
                className="text-[var(--danger)] border-[var(--danger)]/40">
                Marquer refusé
              </Button>
              <Button variant="secondary" onClick={onClose}>Fermer</Button>
            </>
          )}

          {/* Terminal : lecture seule */}
          {isTerminal && (
            <Button variant="secondary" onClick={onClose}>Fermer</Button>
          )}

          {/* Suppression globale — président uniquement, tous statuts */}
          {canDelete && (
            <Button variant="ghost" onClick={() => setConfirmDelete(true)}
              className="ml-auto text-[var(--danger)]">
              Supprimer
            </Button>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Supprimer ce devis ?"
        message={deleteMessage}
        acknowledgeLabel={deleteAcknowledge}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
        loading={deleting}
      />
    </Drawer>
  )
}

// ── Sous-composants ───────────────────────────────────────────────────────────

const inputCls = `w-full h-9 px-3 rounded-[var(--r-md)] bg-[var(--bg)] border border-[var(--border)]
  text-[var(--text)] text-[var(--fs-body)] focus:outline-none focus:border-[var(--brand)]
  transition-colors disabled:opacity-50 disabled:cursor-not-allowed`

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[var(--fs-xs)] font-medium text-[var(--text-muted)] uppercase tracking-wide">
        {label}
      </label>
      {children}
    </div>
  )
}

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <span className="text-[var(--fs-sm)] text-[var(--text-muted)]">{label}</span>
      <span className="text-[var(--fs-sm)]">{children}</span>
    </div>
  )
}
