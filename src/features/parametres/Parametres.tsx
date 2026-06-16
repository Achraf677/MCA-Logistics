import { useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import { Building2, LogOut } from 'lucide-react'
import { Shell } from '../../app/Shell'
import { Button } from '../../shared/ui/Button'
import { Skeleton } from '../../shared/ui/Skeleton'
import { useToast } from '../../shared/ui/useToast'
import { AddressAutocomplete } from '../../shared/ui/AddressAutocomplete'
import { useProfile, supabase } from '../../app/providers'
import { getCompany, updateCompany } from './parametres.queries'
import type { CompanyData } from './parametres.queries'
import { DriveConnect } from './DriveConnect'
import { DriveAccess } from './DriveAccess'

const EMPTY: Omit<CompanyData, 'id'> = {
  name: '', siren: '', siret: '', tva_intra: '',
  address: '', depot_lat: null, depot_lng: null,
  capital_cts: null, iban: '', bic: '',
  transport_license_expiry: null, rc_pro_expiry: null,
}

export function Parametres() {
  const { companyId, loading: profileLoading, profile } = useProfile()
  const { toast } = useToast()
  const [form, setForm]           = useState(EMPTY)
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [dirty, setDirty]         = useState(false)
  const [logoutLoading, setLogoutLoading] = useState(false)

  const handleLogout = async () => {
    setLogoutLoading(true)
    const { error } = await supabase.auth.signOut()
    if (error) { toast(error.message, 'error'); setLogoutLoading(false) }
    // Succès : onAuthStateChange → user=null → LoginPage
  }

  useEffect(() => {
    // Attendre que le profil soit chargé
    if (profileLoading) return
    // Pas de companyId une fois le profil chargé : on arrête le spinner
    if (!companyId) { setLoading(false); return }

    getCompany(companyId).then(({ data }) => {
      if (data) {
        setForm({
          name:        data.name ?? '',
          siren:       data.siren ?? '',
          siret:       data.siret ?? '',
          tva_intra:   data.tva_intra ?? '',
          address:     data.address ?? '',
          depot_lat:   data.depot_lat,
          depot_lng:   data.depot_lng,
          capital_cts: data.capital_cts,
          iban:        data.iban ?? '',
          bic:         data.bic ?? '',
          transport_license_expiry: data.transport_license_expiry,
          rc_pro_expiry:            data.rc_pro_expiry,
        })
      }
      setLoading(false)
    })
  }, [companyId, profileLoading])

  const set = (k: keyof typeof form, v: string) => {
    setForm(p => ({ ...p, [k]: v }))
    setDirty(true)
  }

  const handleSave = async () => {
    if (!companyId) return
    setSaving(true)
    const { error } = await updateCompany(companyId, {
      name:      form.name || undefined,
      siren:     form.siren || null,
      siret:     form.siret || null,
      tva_intra: form.tva_intra || null,
      address:   form.address || null,
      depot_lat: form.depot_lat,
      depot_lng: form.depot_lng,
      capital_cts: form.capital_cts,
      iban:      form.iban || null,
      bic:       form.bic || null,
      transport_license_expiry: form.transport_license_expiry || null,
      rc_pro_expiry:            form.rc_pro_expiry || null,
    })
    if (error) toast((error as Error).message, 'error')
    else { toast('Paramètres enregistrés'); setDirty(false) }
    setSaving(false)
  }

  if (loading) {
    return (
      <Shell pageTitle="Paramètres">
        <div className="max-w-2xl space-y-4">
          {[0,1,2,3,4].map(i => <Skeleton key={i} className="h-14" />)}
        </div>
      </Shell>
    )
  }

  return (
    <Shell pageTitle="Paramètres">
      <div className="max-w-2xl space-y-6">

        {/* En-tête société */}
        <div className="flex items-center gap-3 p-4 rounded-[var(--r-lg)] bg-[var(--brand-soft)] border border-[var(--brand)]/20">
          <Building2 size={20} className="text-[var(--brand)] shrink-0" />
          <div>
            <p className="font-semibold text-[var(--text)]">{form.name || 'Société'}</p>
            {form.siren && <p className="text-[var(--fs-xs)] text-[var(--text-muted)]">SIREN : {form.siren}</p>}
          </div>
        </div>

        {/* Section Identité */}
        <Section title="Identité légale">
          <Field label="Raison sociale *">
            <Input value={form.name} onChange={v => set('name', v)} placeholder="MCA Logistics" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="SIREN">
              <Input value={form.siren ?? ''} onChange={v => set('siren', v)} placeholder="123456789" />
            </Field>
            <Field label="SIRET">
              <Input value={form.siret ?? ''} onChange={v => set('siret', v)} placeholder="12345678900001" />
            </Field>
          </div>
          <Field label="N° TVA intracommunautaire">
            <Input value={form.tva_intra ?? ''} onChange={v => set('tva_intra', v)} placeholder="FR12345678901" />
          </Field>
          <Field label="Capital social (€)">
            <input
              type="number"
              value={form.capital_cts != null ? form.capital_cts / 100 : ''}
              onChange={e => {
                const v = e.target.value
                setForm(p => ({ ...p, capital_cts: v ? Math.round(parseFloat(v) * 100) : null }))
                setDirty(true)
              }}
              placeholder="7200"
              className={inputCls}
            />
          </Field>
        </Section>

        {/* Section Coordonnées */}
        <Section title="Coordonnées">
          <AddressAutocomplete
            label="Adresse du dépôt"
            value={form.address ?? ''}
            placeholder="17 rue de la Chapelle, 67540 Ostwald"
            onChange={v => {
              setForm(p => ({ ...p, address: v, depot_lat: null, depot_lng: null }))
              setDirty(true)
            }}
            onSelect={s => {
              setForm(p => ({ ...p, address: s.address, depot_lat: s.lat, depot_lng: s.lng }))
              setDirty(true)
            }}
          />
          {form.depot_lat != null && form.depot_lng != null && (
            <p className="text-[var(--fs-xs)] text-[var(--text-muted)] font-mono">
              📍 {form.depot_lat.toFixed(5)}, {form.depot_lng.toFixed(5)}
            </p>
          )}
        </Section>

        {/* Section Bancaire */}
        <Section title="Informations bancaires">
          <Field label="IBAN">
            <Input value={form.iban ?? ''} onChange={v => set('iban', v.replace(/\s/g, ''))}
              placeholder="FR7616958000019515253956892" />
          </Field>
          <Field label="BIC / SWIFT">
            <Input value={form.bic ?? ''} onChange={v => set('bic', v)} placeholder="QNTOFRP1XXX" />
          </Field>
          {form.iban && (
            <p className="text-[var(--fs-xs)] text-[var(--text-muted)] font-mono">
              {form.iban.replace(/(.{4})/g, '$1 ').trim()}
            </p>
          )}
        </Section>

        {/* Section Conformité */}
        <Section title="Conformité / Documents société">
          <Field label="Licence de transport / inscription registre (DREAL)">
            <input
              type="date"
              value={form.transport_license_expiry ?? ''}
              onChange={e => {
                setForm(p => ({ ...p, transport_license_expiry: e.target.value || null }))
                setDirty(true)
              }}
              className={inputCls}
            />
          </Field>
          <Field label="Assurance RC pro + marchandises">
            <input
              type="date"
              value={form.rc_pro_expiry ?? ''}
              onChange={e => {
                setForm(p => ({ ...p, rc_pro_expiry: e.target.value || null }))
                setDirty(true)
              }}
              className={inputCls}
            />
          </Field>
        </Section>

        {/* Actions */}
        <div className="flex items-center gap-3 pt-2">
          <Button variant="primary" onClick={handleSave} disabled={saving || !dirty}>
            {saving ? 'Enregistrement…' : 'Enregistrer les modifications'}
          </Button>
          {!dirty && !saving && (
            <span className="text-[var(--fs-xs)] text-[var(--text-muted)]">Aucune modification</span>
          )}
        </div>

        {/* Section Google Drive */}
        <Section title="Google Drive">
          <DriveConnect />
        </Section>

        {/* Section Accès Drive — président uniquement */}
        {profile?.role === 'president' && (
          <Section title="Accès Drive">
            <DriveAccess />
          </Section>
        )}

        {/* Section Compte */}
        <Section title="Compte">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[var(--fs-body)] text-[var(--text)]">{profile?.full_name ?? '—'}</p>
              {profile?.email && (
                <p className="text-[var(--fs-xs)] text-[var(--text-muted)]">{profile.email}</p>
              )}
            </div>
            <button
              onClick={handleLogout}
              disabled={logoutLoading}
              className="flex items-center gap-2 px-3 py-1.5 rounded-[var(--r-md)] border border-[var(--border)] text-[var(--fs-sm)] text-[var(--text-muted)] hover:text-[var(--danger)] hover:border-[var(--danger)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <LogOut size={14} />
              {logoutLoading ? 'Déconnexion…' : 'Se déconnecter'}
            </button>
          </div>
        </Section>
      </div>
    </Shell>
  )
}

// ── Sous-composants ──────────────────────────────────────────────────────────

const inputCls = `w-full h-9 px-3 rounded-[var(--r-md)] bg-[var(--bg)] border border-[var(--border)]
  text-[var(--text)] text-[var(--fs-body)] focus:outline-none focus:border-[var(--brand)]
  transition-colors disabled:opacity-50 disabled:cursor-not-allowed`

function Input({ type = 'text', value, onChange, placeholder }: {
  type?: string; value: string; onChange: (v: string) => void; placeholder?: string
}) {
  return (
    <input type={type} value={value} placeholder={placeholder}
      onChange={e => onChange(e.target.value)} className={inputCls} />
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[var(--fs-xs)] font-medium text-[var(--text-muted)] uppercase tracking-wide">{label}</label>
      {children}
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-[var(--r-lg)] border border-[var(--border)] overflow-hidden">
      <div className="px-4 py-2.5 bg-[var(--bg-elevated)] border-b border-[var(--border)]">
        <span className="text-[var(--fs-xs)] font-semibold text-[var(--text-muted)] uppercase tracking-wide">{title}</span>
      </div>
      <div className="p-4 flex flex-col gap-4">{children}</div>
    </div>
  )
}
