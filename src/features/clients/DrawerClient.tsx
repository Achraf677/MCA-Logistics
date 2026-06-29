import { useState, useEffect } from 'react'
import { Trash2 } from 'lucide-react'
import { Drawer } from '../../shared/ui/Drawer'
import { Button } from '../../shared/ui/Button'
import { Badge } from '../../shared/ui/Badge'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { useToast } from '../../shared/ui/useToast'
import {
  createClient, updateClient, deactivateClient, deleteClient,
  countDeliveriesForClient, countQuotesForClient, getClientDeliveries,
} from './clients.queries'
import {
  CLIENT_TYPE_LABELS, CLIENT_TYPE_COLORS, validateSiret,
  TARIFF_MODE_LABELS, computeEncours, paymentStatusOf,
} from './clients.logic'
import { formatMoney } from '../../shared/lib/money'
import type { Client, ClientInsert, DeliveryForEncours, TariffMode } from './clients.types'
import { useProfile } from '../../app/providers'
import { usePermissions } from '../../shared/permissions/usePermissions'
import { DocumentsPanel } from '../documents/DocumentsPanel'

interface DrawerClientProps {
  open: boolean
  onClose: () => void
  client?: Client | null
  onSaved: () => void
}

const EMPTY_FORM: Partial<ClientInsert> = {
  name: '', siret: '', tva_intra: '', address: '', city: '',
  postal_code: '', email: '', phone: '', type: null,
  payment_terms: 30, notes: '', active: true,
  tariff_mode: 'manuel', tariff_rate_cts: null,
}

type Tab = 'detail' | 'historique' | 'encours' | 'documents'

export function DrawerClient({ open, onClose, client, onSaved }: DrawerClientProps) {
  const { companyId } = useProfile()
  const { toast } = useToast()
  const [tab, setTab] = useState<Tab>('detail')
  const [form, setForm] = useState<Partial<ClientInsert>>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [siretError, setSiretError] = useState('')
  const [confirmDeactivate, setConfirmDeactivate] = useState(false)
  const [deactivating, setDeactivating] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deliveries, setDeliveries] = useState<(DeliveryForEncours & { date: string; description: string | null })[]>([])
  const [deliveriesLoading, setDeliveriesLoading] = useState(false)

  const isEdit = !!client

  useEffect(() => {
    if (client) {
      setForm({
        name: client.name, siret: client.siret ?? '', tva_intra: client.tva_intra ?? '',
        address: client.address ?? '', city: client.city ?? '', postal_code: client.postal_code ?? '',
        email: client.email ?? '', phone: client.phone ?? '', type: client.type,
        payment_terms: client.payment_terms, notes: client.notes ?? '', active: client.active,
        tariff_mode: client.tariff_mode ?? 'manuel',
        tariff_rate_cts: client.tariff_rate_cts,
      })
    } else {
      setForm(EMPTY_FORM)
    }
    setSiretError('')
    setTab('detail')
    setDeliveries([])
  }, [client, open])

  useEffect(() => {
    if ((tab === 'historique' || tab === 'encours') && client && deliveries.length === 0) {
      setDeliveriesLoading(true)
      getClientDeliveries(client.id).then(({ data }) => {
        const paymentTerms = client.payment_terms ?? 30
        setDeliveries((data ?? []).map(d => ({ ...d, payment_terms: paymentTerms })))
        setDeliveriesLoading(false)
      })
    }
  }, [tab, client, deliveries.length])

  const set = (k: keyof typeof form, v: unknown) => setForm(p => ({ ...p, [k]: v }))

  const handleSave = async () => {
    if (!form.name?.trim()) { toast('Le nom est requis', 'error'); return }
    if (form.siret && !validateSiret(form.siret)) {
      setSiretError('SIRET invalide (14 chiffres)'); return
    }
    if (form.tariff_mode !== 'manuel' && !form.tariff_rate_cts) {
      toast('Le tarif est requis pour ce mode', 'error'); return
    }
    setSiretError('')
    setSaving(true)
    try {
      if (isEdit && client) {
        const { error } = await updateClient(client.id, form)
        if (error) throw error
        toast('Client mis à jour')
      } else {
        if (!companyId) throw new Error('Profil non chargé')
        const { error } = await createClient({ ...form, company_id: companyId } as ClientInsert)
        if (error) throw error
        toast('Client créé')
      }
      onSaved()
      onClose()
    } catch (e: unknown) {
      toast((e as Error).message, 'error')
    } finally {
      setSaving(false)
    }
  }

  // Désactivation (archive : active=false) — distincte de la suppression.
  const handleDeactivate = async () => {
    if (!client) return
    setDeactivating(true)
    const { error } = await deactivateClient(client.id)
    setDeactivating(false)
    if (error) { toast(error.message, 'error'); return }
    setConfirmDeactivate(false)
    toast(`${client.name} désactivé`)
    onSaved()
    onClose()
  }

  // Suppression définitive — président uniquement, interdite si le client a des livraisons.
  const handleDeleteClick = async () => {
    if (!client) return
    try {
      const [nLiv, nDevis] = await Promise.all([
        countDeliveriesForClient(client.id),
        countQuotesForClient(client.id),
      ])
      if (nLiv > 0 || nDevis > 0) {
        const parts: string[] = []
        if (nDevis > 0) parts.push(`${nDevis} devis`)
        if (nLiv > 0) parts.push(`${nLiv} livraison(s)`)
        toast(`Ce client a ${parts.join(' et ')} rattaché(s) : suppression impossible. Désactive-le plutôt pour le retirer des listes sans perdre l'historique.`, 'error')
        return
      }
      setConfirmDelete(true)
    } catch (e) {
      toast(`Vérification des éléments liés impossible : ${(e as Error).message}`, 'error')
    }
  }

  const handleDelete = async () => {
    if (!client) return
    setDeleting(true)
    const { error } = await deleteClient(client.id)
    setDeleting(false)
    if (error) {
      const err = error as { code?: string; message?: string }
      const isFk = err.code === '23503' || /foreign key/i.test(err.message ?? '')
      toast(isFk
        ? 'Ce client a des éléments liés : suppression impossible. Désactive-le plutôt.'
        : (err.message ?? 'Erreur'), 'error')
      return
    }
    setConfirmDelete(false)
    toast(`${client.name} supprimé`)
    onSaved()
    onClose()
  }

  const { can } = usePermissions()

  const encours = computeEncours(deliveries)

  return (
    <Drawer open={open} onClose={onClose} title={isEdit ? client!.name : 'Nouveau client'}>
      {/* Tabs */}
      {isEdit && (
        <div className="flex gap-1 mb-5 border-b border-[var(--border)] -mx-5 px-5">
          {(['detail', 'historique', 'encours', 'documents'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-2 text-[var(--fs-sm)] font-medium border-b-2 transition-colors -mb-px ${
                tab === t
                  ? 'border-[var(--brand)] text-[var(--brand)]'
                  : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
              }`}
            >
              {t === 'detail' ? 'Détail' : t === 'historique' ? 'Historique' : t === 'encours' ? 'Encours & paiements' : 'Documents'}
            </button>
          ))}
        </div>
      )}

      {/* ── Onglet Détail ── */}
      {tab === 'detail' && (
        <div className="flex flex-col gap-5">
          {isEdit && (
            <div className="flex items-center gap-2">
              <Badge color={client!.active ? 'success' : 'muted'}>
                {client!.active ? 'Actif' : 'Inactif'}
              </Badge>
              {client!.type && (
                <Badge color={CLIENT_TYPE_COLORS[client!.type] as 'info' | 'success' | 'warning' | 'muted'}>
                  {CLIENT_TYPE_LABELS[client!.type]}
                </Badge>
              )}
            </div>
          )}

          <FieldGroup label="Nom *">
            <Input value={form.name ?? ''} onChange={v => set('name', v)} placeholder="Nom du client" />
          </FieldGroup>

          <div className="grid grid-cols-2 gap-3">
            <FieldGroup label="Type">
              <select
                value={form.type ?? ''}
                onChange={e => set('type', e.target.value || null)}
                className={inputClass}
              >
                <option value="">— Tous —</option>
                {(Object.entries(CLIENT_TYPE_LABELS) as [string, string][]).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </FieldGroup>
            <FieldGroup label="Délai paiement (j)">
              <Input
                type="number" value={String(form.payment_terms ?? 30)}
                onChange={v => set('payment_terms', parseInt(v) || 30)}
              />
            </FieldGroup>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <FieldGroup label="SIRET" error={siretError}>
              <Input value={form.siret ?? ''} onChange={v => { set('siret', v); setSiretError('') }} placeholder="14 chiffres" />
            </FieldGroup>
            <FieldGroup label="N° TVA intracommunautaire">
              <Input value={form.tva_intra ?? ''} onChange={v => set('tva_intra', v)} placeholder="FR…" />
            </FieldGroup>
          </div>

          <FieldGroup label="Adresse">
            <Input value={form.address ?? ''} onChange={v => set('address', v)} placeholder="Rue…" />
          </FieldGroup>
          <div className="grid grid-cols-3 gap-3">
            <FieldGroup label="Code postal">
              <Input value={form.postal_code ?? ''} onChange={v => set('postal_code', v)} />
            </FieldGroup>
            <FieldGroup label="Ville" className="col-span-2">
              <Input value={form.city ?? ''} onChange={v => set('city', v)} />
            </FieldGroup>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <FieldGroup label="E-mail">
              <Input type="email" value={form.email ?? ''} onChange={v => set('email', v)} />
            </FieldGroup>
            <FieldGroup label="Téléphone">
              <Input type="tel" value={form.phone ?? ''} onChange={v => set('phone', v)} />
            </FieldGroup>
          </div>

          {/* Tarif */}
          <div className="pt-3 border-t border-[var(--border)]">
            <p className="text-[var(--fs-xs)] font-medium text-[var(--text-muted)] uppercase tracking-wide mb-3">Tarification</p>
            <div className="grid grid-cols-2 gap-3">
              <FieldGroup label="Mode tarifaire">
                <select
                  value={form.tariff_mode ?? 'manuel'}
                  onChange={e => set('tariff_mode', e.target.value as TariffMode)}
                  className={inputClass}
                >
                  {(Object.entries(TARIFF_MODE_LABELS) as [TariffMode, string][]).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </FieldGroup>
              {form.tariff_mode !== 'manuel' && (
                <FieldGroup label={
                  form.tariff_mode === 'forfait' ? 'Montant forfait (€)' :
                  form.tariff_mode === 'km'      ? 'Prix / km (€)' :
                                                   'Prix / palette (€)'
                }>
                  <Input
                    type="number"
                    value={form.tariff_rate_cts ? String(form.tariff_rate_cts / 100) : ''}
                    onChange={v => set('tariff_rate_cts', v ? Math.round(parseFloat(v) * 100) : null)}
                    placeholder="0,00"
                  />
                </FieldGroup>
              )}
            </div>
            {form.tariff_mode === 'manuel' && (
              <p className="text-[var(--fs-xs)] text-[var(--text-disabled)] mt-1">
                En mode manuel, le montant de chaque livraison est saisi à la main.
              </p>
            )}
          </div>

          <FieldGroup label="Notes">
            <textarea
              value={form.notes ?? ''}
              onChange={e => set('notes', e.target.value)}
              rows={3}
              className={`${inputClass} resize-none`}
              placeholder="Notes internes…"
            />
          </FieldGroup>

          <div className="flex items-center gap-2 pt-2 border-t border-[var(--border)]">
            {can('tiers.clients', isEdit ? 'update' : 'create') && (
              <Button variant="primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </Button>
            )}
            <Button variant="secondary" onClick={onClose}>Annuler</Button>
            {isEdit && client!.active && (
              <Button variant="ghost" onClick={() => setConfirmDeactivate(true)} className="ml-auto text-[var(--danger)]">
                Désactiver
              </Button>
            )}
            {isEdit && can('tiers.clients', 'delete') && (
              <Button variant="ghost" onClick={handleDeleteClick}
                className={`${isEdit && client!.active ? '' : 'ml-auto'} text-[var(--danger)]`}>
                <Trash2 size={14} />
                Supprimer
              </Button>
            )}
          </div>
        </div>
      )}

      {/* ── Onglet Historique ── */}
      {tab === 'historique' && (
        <div className="flex flex-col gap-3">
          {deliveriesLoading ? (
            <div className="flex items-center justify-center py-10 text-[var(--text-muted)] text-[var(--fs-sm)]">
              Chargement…
            </div>
          ) : deliveries.length === 0 ? (
            <div className="flex items-center justify-center py-10 text-[var(--text-muted)] text-[var(--fs-sm)]">
              Aucune livraison
            </div>
          ) : (
            deliveries.map(d => {
              const amount = d.amount_ttc_cts ?? d.montant_ttc_cts ?? 0
              return (
                <div key={d.id} className="flex items-center justify-between gap-2 py-2.5 border-b border-[var(--border)] last:border-0">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[var(--fs-sm)] text-[var(--text)]">{d.description || '—'}</span>
                    <span className="text-[var(--fs-xs)] text-[var(--text-muted)]">{formatDate(d.date)}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <StatusBadge statut={d.statut} />
                    <span className="text-[var(--fs-sm)] font-medium text-[var(--text)]">{formatMoney(amount)}</span>
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}

      {/* ── Onglet Encours & paiements ── */}
      {tab === 'encours' && (
        <div className="flex flex-col gap-4">
          {deliveriesLoading ? (
            <div className="flex items-center justify-center py-10 text-[var(--text-muted)] text-[var(--fs-sm)]">
              Chargement…
            </div>
          ) : (
            <>
              {/* Résumé encours */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[var(--bg-card)] rounded-[var(--r-md)] border border-[var(--border)] px-4 py-3">
                  <p className="text-[var(--fs-xs)] text-[var(--text-muted)] uppercase tracking-wide mb-1">Encours total</p>
                  <p className="text-[var(--fs-lg)] font-semibold text-[var(--text)]">{formatMoney(encours.total_cts)}</p>
                  <p className="text-[var(--fs-xs)] text-[var(--text-muted)]">{encours.count} facture{encours.count > 1 ? 's' : ''}</p>
                </div>
                <div className="bg-[var(--bg-card)] rounded-[var(--r-md)] border border-[var(--border)] px-4 py-3">
                  <p className="text-[var(--fs-xs)] text-[var(--text-muted)] uppercase tracking-wide mb-1">Dont en retard</p>
                  <p className={`text-[var(--fs-lg)] font-semibold ${encours.overdue_cts > 0 ? 'text-[var(--danger)]' : 'text-[var(--text)]'}`}>
                    {formatMoney(encours.overdue_cts)}
                  </p>
                </div>
              </div>

              {/* Liste factures non payées */}
              {encours.count === 0 ? (
                <div className="flex items-center justify-center py-8 text-[var(--text-muted)] text-[var(--fs-sm)]">
                  Aucune facture en attente
                </div>
              ) : (
                <div className="flex flex-col">
                  {deliveries.filter(d => d.statut === 'facturee').map(d => {
                    const today = new Date()
                    const status = paymentStatusOf(d, today)
                    const amount = d.amount_ttc_cts ?? d.montant_ttc_cts ?? 0
                    return (
                      <div key={d.id} className="flex items-center justify-between gap-2 py-2.5 border-b border-[var(--border)] last:border-0">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[var(--fs-sm)] text-[var(--text)]">{d.description || '—'}</span>
                          <span className="text-[var(--fs-xs)] text-[var(--text-muted)]">
                            Facturé le {d.invoiced_at ? formatDate(d.invoiced_at) : '—'}
                            {d.invoiced_at && ` · Échéance ${formatDate(addDays(d.invoiced_at, d.payment_terms))}`}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <PaymentBadge status={status} />
                          <span className="text-[var(--fs-sm)] font-medium text-[var(--text)]">{formatMoney(amount)}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Onglet Documents ── */}
      {tab === 'documents' && (
        <DocumentsPanel entityType="client" entityId={client?.id ?? null} />
      )}

      <ConfirmDialog
        open={confirmDeactivate}
        title="Désactiver ce client ?"
        message={`${client?.name ?? ''} sera archivé (masqué des listes actives). Réversible.`}
        confirmLabel="Désactiver"
        onConfirm={handleDeactivate}
        onCancel={() => setConfirmDeactivate(false)}
        loading={deactivating}
      />

      <ConfirmDialog
        open={confirmDelete}
        title="Supprimer ce client ?"
        message="Action irréversible."
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
        loading={deleting}
      />
    </Drawer>
  )
}

// ── Helpers UI ────────────────────────────────────────────────────────────────

const STATUT_LABELS: Record<string, string> = {
  brouillon: 'Brouillon', validee: 'Validée', facturee: 'Facturée',
  payee: 'Payée', annulee: 'Annulée',
}

function StatusBadge({ statut }: { statut: string }) {
  const color =
    statut === 'payee'    ? 'success' :
    statut === 'facturee' ? 'warning' :
    statut === 'annulee'  ? 'muted'   : 'info'
  return <Badge color={color as 'success' | 'warning' | 'muted' | 'info'}>{STATUT_LABELS[statut] ?? statut}</Badge>
}

function PaymentBadge({ status }: { status: 'a_jour' | 'du' | 'en_retard' }) {
  if (status === 'a_jour') return <Badge color="success">À jour</Badge>
  if (status === 'en_retard') return <Badge color="danger">En retard</Badge>
  return <Badge color="warning">Dû</Badge>
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso)
  d.setDate(d.getDate() + days)
  return d.toISOString()
}

// ── Mini helpers ──────────────────────────────────────────────────────────────
const inputClass = `w-full h-9 px-3 rounded-[var(--r-md)] bg-[var(--bg)] border border-[var(--border)]
  text-[var(--text)] text-[var(--fs-body)] focus:outline-none focus:border-[var(--brand)] transition-colors`

function Input({ type = 'text', value, onChange, placeholder, className = '' }: {
  type?: string; value: string; onChange: (v: string) => void; placeholder?: string; className?: string
}) {
  return (
    <input
      type={type} value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className={`${inputClass} ${className}`}
    />
  )
}

function FieldGroup({ label, children, error, className = '' }: {
  label: string; children: React.ReactNode; error?: string; className?: string
}) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label className="text-[var(--fs-xs)] font-medium text-[var(--text-muted)] uppercase tracking-wide">{label}</label>
      {children}
      {error && <span className="text-[var(--danger)] text-[var(--fs-xs)]">{error}</span>}
    </div>
  )
}
