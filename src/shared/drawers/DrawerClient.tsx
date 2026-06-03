import { useState, useEffect } from 'react'
import { Drawer } from '../ui/Drawer'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import { useToast } from '../ui/useToast'
import { createClient, updateClient, deactivateClient } from '../../features/clients/clients.queries'
import {
  CLIENT_TYPE_LABELS, CLIENT_TYPE_COLORS, validateSiret,
} from '../../features/clients/clients.logic'
import type { Client, ClientInsert } from '../../features/clients/clients.types'
import { useProfile } from '../../app/providers'

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
}

type Tab = 'detail'

export function DrawerClient({ open, onClose, client, onSaved }: DrawerClientProps) {
  const { companyId } = useProfile()
  const { toast } = useToast()
  const [tab] = useState<Tab>('detail')
  const [form, setForm] = useState<Partial<ClientInsert>>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [siretError, setSiretError] = useState('')

  const isEdit = !!client

  useEffect(() => {
    if (client) {
      setForm({
        name: client.name, siret: client.siret ?? '', tva_intra: client.tva_intra ?? '',
        address: client.address ?? '', city: client.city ?? '', postal_code: client.postal_code ?? '',
        email: client.email ?? '', phone: client.phone ?? '', type: client.type,
        payment_terms: client.payment_terms, notes: client.notes ?? '', active: client.active,
      })
    } else {
      setForm(EMPTY_FORM)
    }
    setSiretError('')
  }, [client, open])

  const set = (k: keyof typeof form, v: unknown) => setForm(p => ({ ...p, [k]: v }))

  const handleSave = async () => {
    if (!form.name?.trim()) { toast('Le nom est requis', 'error'); return }
    if (form.siret && !validateSiret(form.siret)) {
      setSiretError('SIRET invalide (14 chiffres)'); return
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

  const handleDeactivate = async () => {
    if (!client) return
    if (!confirm(`Désactiver ${client.name} ?`)) return
    const { error } = await deactivateClient(client.id)
    if (error) { toast(error.message, 'error'); return }
    toast(`${client.name} désactivé`)
    onSaved()
    onClose()
  }

  return (
    <Drawer open={open} onClose={onClose} title={isEdit ? client!.name : 'Nouveau client'}>
      {tab === 'detail' && (
        <div className="flex flex-col gap-5">
          {/* Statut */}
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

          {/* Champs */}
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

          <FieldGroup label="Notes">
            <textarea
              value={form.notes ?? ''}
              onChange={e => set('notes', e.target.value)}
              rows={3}
              className={`${inputClass} resize-none`}
              placeholder="Notes internes…"
            />
          </FieldGroup>

          {/* Actions */}
          <div className="flex items-center gap-2 pt-2 border-t border-[var(--border)]">
            <Button variant="primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
            <Button variant="secondary" onClick={onClose}>Annuler</Button>
            {isEdit && client!.active && (
              <Button variant="ghost" onClick={handleDeactivate} className="ml-auto text-[var(--danger)]">
                Désactiver
              </Button>
            )}
          </div>
        </div>
      )}
    </Drawer>
  )
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
