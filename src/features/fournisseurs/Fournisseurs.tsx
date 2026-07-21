import { useState, useEffect, useCallback, useMemo } from 'react'
import { Building2, Trash2 } from 'lucide-react'
import { Shell } from '../../app/Shell'
import { KpiCard } from '../../shared/ui/KpiCard'
import { Badge } from '../../shared/ui/Badge'
import { Button } from '../../shared/ui/Button'
import { EmptyState } from '../../shared/ui/EmptyState'
import { ContactLinks } from '../../shared/ui/ContactLinks'
import { telHref, mailtoHref } from '../../shared/lib/contact'
import { SkeletonTable, SkeletonKpis } from '../../shared/ui/Skeleton'
import { Drawer } from '../../shared/ui/Drawer'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { useToast } from '../../shared/ui/useToast'
import { useProfile } from '../../app/providers'
import { usePermissions } from '../../shared/permissions/usePermissions'
import { getSuppliers, createSupplier, updateSupplier, deactivateSupplier, deleteSupplier } from './fournisseurs.queries'
import { CATEGORY_LABELS, getCategoryLabel, isTvaDeductible, countByCategory, normalizeSiren, validateSiren, findDuplicate } from './fournisseurs.logic'
import type { Supplier, SupplierInsert, SupplierFilters } from './fournisseurs.types'
import type { ActionKey } from '../../shared/actions/ActionBar'

const inputClass = `w-full h-9 px-3 rounded-[var(--r-md)] bg-[var(--bg)] border border-[var(--border)]
  text-[var(--text)] text-[var(--fs-body)] focus:outline-none focus:border-[var(--brand)] transition-colors`

function FieldGroup({ label, children, error }: { label: string; children: React.ReactNode; error?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[var(--fs-xs)] font-medium text-[var(--text-muted)] uppercase tracking-wide">{label}</label>
      {children}
      {error && <span className="text-[var(--danger)] text-[var(--fs-xs)]">{error}</span>}
    </div>
  )
}

export function Fournisseurs() {
  const { toast } = useToast()
  const { companyId } = useProfile()
  const { can } = usePermissions()
  const canCreate = can('tiers.fournisseurs', 'create')
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState<SupplierFilters>({ active: true })
  const [search, setSearch] = useState('')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selected, setSelected] = useState<Supplier | null>(null)
  const [form, setForm] = useState<Partial<SupplierInsert>>({})
  const [saving, setSaving] = useState(false)
  const [sirenError, setSirenError] = useState('')
  const [confirmDuplicate, setConfirmDuplicate] = useState(false)
  const [confirmDeactivate, setConfirmDeactivate] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    const { data, error } = await getSuppliers({ ...filters, search: search || undefined })
    if (error) setError(error.message)
    else setSuppliers(data ?? [])
    setLoading(false)
  }, [filters, search])

  useEffect(() => { load() }, [load])

  const openDrawer = (s?: Supplier) => {
    setSelected(s ?? null)
    setForm(s ? {
      name: s.name, siren: s.siren ?? '', siret: s.siret ?? '', tva_intra: s.tva_intra ?? '',
      address: s.address ?? '', email: s.email ?? '', phone: s.phone ?? '',
      category: s.category, pennylane_id: s.pennylane_id ?? '',
      notes: s.notes ?? '', active: s.active, company_id: s.company_id,
    } : { active: true, company_id: companyId ?? '' })
    setSirenError('')
    setDrawerOpen(true)
  }

  const duplicate = useMemo(() => {
    const raw = form.siren ?? ''
    if (!raw.trim()) return null
    return findDuplicate(raw, suppliers, selected?.id)
  }, [form.siren, suppliers, selected])

  const set = (k: keyof SupplierInsert, v: unknown) => setForm(p => ({ ...p, [k]: v }))

  const handleSave = () => {
    if (!form.name?.trim()) { toast('Le nom est requis', 'error'); return }
    if (form.siren && !validateSiren(form.siren)) {
      setSirenError('SIREN invalide (9 chiffres)'); return
    }
    setSirenError('')
    if (duplicate) { setConfirmDuplicate(true); return }
    void doSave()
  }

  const doSave = async () => {
    setConfirmDuplicate(false)
    setSaving(true)
    try {
      if (selected) {
        const { error } = await updateSupplier(selected.id, form)
        if (error) throw error
        toast('Fournisseur mis à jour')
      } else {
        if (!companyId) throw new Error('Profil non chargé')
        const { error } = await createSupplier({ ...form, company_id: companyId } as SupplierInsert)
        if (error) throw error
        toast('Fournisseur créé')
      }
      load(); setDrawerOpen(false)
    } catch (e: unknown) {
      toast((e as Error).message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDeactivate = () => {
    if (!selected) return
    setConfirmDeactivate(true)
  }

  const doDeactivate = async () => {
    if (!selected) return
    setConfirmDeactivate(false)
    const { error } = await deactivateSupplier(selected.id)
    if (error) { toast(error.message, 'error'); return }
    toast(`${selected.name} désactivé`)
    load(); setDrawerOpen(false)
  }

  const doDelete = async () => {
    if (!selected) return
    setDeleting(true)
    const { error } = await deleteSupplier(selected.id)
    setDeleting(false)
    if (error) { toast(error.message, 'error'); return }
    setConfirmDelete(false)
    toast(`${selected.name} supprimé`)
    load(); setDrawerOpen(false)
  }

  const handleAction = (key: ActionKey) => {
    if (key === 'nouveau') openDrawer()
  }

  const byCategory = countByCategory(suppliers)
  const actifs = suppliers.filter(s => s.active).length

  return (
    <Shell pageTitle="Fournisseurs" actions={[...(canCreate ? ['nouveau' as const] : []), 'export']} onAction={handleAction}>
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-5 mb-6 [&>*]:min-w-0">
        {loading ? <SkeletonKpis count={4} /> : <>
          <KpiCard label="Actifs" value={actifs} />
          <KpiCard label="Carburant" value={byCategory.carburant ?? 0} />
          <KpiCard label="Entretien" value={byCategory.entretien ?? 0} />
          <KpiCard label="Autres" value={suppliers.length - (byCategory.carburant ?? 0) - (byCategory.entretien ?? 0)} />
        </>}
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap items-center gap-3 mb-4 glass rounded-[var(--r-xl)] px-4 py-3">
        <input
          type="search" placeholder="Rechercher…" value={search}
          onChange={e => setSearch(e.target.value)}
          className="h-8 px-3 rounded-[var(--r-md)] bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text)] text-[var(--fs-sm)] focus:outline-none focus:border-[var(--brand)] w-48"
        />
        <select
          value={filters.category ?? 'all'}
          onChange={e => setFilters(f => ({ ...f, category: (e.target.value || 'all') as SupplierFilters['category'] }))}
          className="h-8 px-2 rounded-[var(--r-md)] bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text)] text-[var(--fs-sm)] focus:outline-none"
        >
          <option value="all">Toutes catégories</option>
          {(Object.entries(CATEGORY_LABELS) as [string, string][]).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <Button
          variant={filters.active === true ? 'primary' : 'secondary'} size="compact"
          onClick={() => setFilters(f => ({ ...f, active: f.active === true ? undefined : true }))}
        >Actifs uniquement</Button>
      </div>

      {loading ? <SkeletonTable rows={5} />
        : error ? (
          <div className="flex flex-col items-center py-16 gap-3">
            <p className="text-[var(--danger)] text-[var(--fs-sm)]">{error}</p>
            <Button variant="secondary" onClick={load}>Réessayer</Button>
          </div>
        ) : suppliers.length === 0 ? (
          <EmptyState
            icon={<Building2 size={48} />}
            title="Aucun fournisseur"
            description="Ajoutez vos fournisseurs récurrents."
            action={canCreate ? { label: '+ Nouveau fournisseur', onClick: () => openDrawer() } : undefined}
          />
        ) : (
          <>
            {/* Desktop */}
            <div className="hidden md:block overflow-x-auto glass rounded-[var(--r-xl)]">
              <table className="w-full text-[var(--fs-sm)]">
                <thead>
                  <tr className="bg-[var(--bg-elevated)] text-[var(--text-muted)] text-left">
                    {['Nom', 'Catégorie', 'SIRET', 'E-mail', 'Téléphone', ''].map(h => (
                      <th key={h} className="px-4 py-2.5 font-medium text-[var(--fs-xs)] uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {suppliers.map((s, i) => (
                    <tr key={s.id} onClick={() => openDrawer(s)}
                      className={`border-t border-[var(--border)] cursor-pointer hover:bg-[var(--bg-card-hover)] transition-colors
                        ${i % 2 === 0 ? 'bg-[var(--bg)]' : 'bg-[var(--bg-card)]/40'}`}>
                      <td className="px-4 py-3 font-medium text-[var(--text)]">
                        {s.name}
                        {isTvaDeductible(s.category) && (
                          <span className="ml-2.5 inline-flex items-center px-2 py-0.5 rounded-[var(--r-pill)] text-[var(--fs-xs)] font-semibold bg-[var(--success)]/15 text-[var(--success)] border border-[var(--success)]/35 align-middle" title="TVA 100% déductible">TVA ✓</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge color="muted">{getCategoryLabel(s.category)}</Badge>
                      </td>
                      <td className="px-4 py-3 font-mono text-[var(--fs-xs)] text-[var(--text-muted)]">{s.siret ?? '—'}</td>
                      <td className="px-4 py-3 text-[var(--text-muted)]" onClick={e => e.stopPropagation()}>
                        {mailtoHref(s.email)
                          ? <a href={mailtoHref(s.email)!} className="hover:text-[var(--brand)] transition-colors">{s.email}</a>
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-[var(--text-muted)]" onClick={e => e.stopPropagation()}>
                        {telHref(s.phone)
                          ? <a href={telHref(s.phone)!} className="hover:text-[var(--brand)] transition-colors">{s.phone}</a>
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button variant="ghost" size="compact" onClick={e => { e.stopPropagation(); openDrawer(s) }}>Voir</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile */}
            <div className="md:hidden flex flex-col gap-3">
              {suppliers.map(s => (
                <button key={s.id} onClick={() => openDrawer(s)}
                  className="w-full text-left bg-[var(--bg-card)] rounded-[var(--r-lg)] border border-[var(--border)] p-4 hover:bg-[var(--bg-card-hover)] transition-colors">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="font-medium text-[var(--text)]">{s.name}</span>
                    <Badge color="muted">{getCategoryLabel(s.category)}</Badge>
                  </div>
                  <div onClick={e => e.stopPropagation()}>
                    <ContactLinks phone={s.phone} email={s.email} />
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

      {/* Drawer fournisseur */}
      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)}
        title={selected ? selected.name : 'Nouveau fournisseur'}>
        <div className="flex flex-col gap-4">
          <FieldGroup label="Nom *">
            <input value={form.name ?? ''} onChange={e => set('name', e.target.value)} className={inputClass} placeholder="Nom du fournisseur" />
          </FieldGroup>
          <FieldGroup label="Catégorie">
            <select value={form.category ?? ''} onChange={e => set('category', e.target.value || null)} className={inputClass}>
              <option value="">—</option>
              {(Object.entries(CATEGORY_LABELS) as [string, string][]).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </FieldGroup>
          {form.category === 'carburant' && (
            <p className="text-[var(--success)] text-[var(--fs-xs)] bg-[var(--success)]/10 rounded-[var(--r-md)] px-3 py-2">
              TVA récupérable à 100 % pour les VU ≤ 3,5 t (diesel et essence).
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <FieldGroup label="SIREN" error={sirenError}>
              <input
                value={form.siren ?? ''}
                onChange={e => { set('siren', normalizeSiren(e.target.value)); setSirenError('') }}
                maxLength={9}
                className={inputClass}
                placeholder="9 chiffres"
              />
            </FieldGroup>
            <FieldGroup label="SIRET">
              <input value={form.siret ?? ''} onChange={e => set('siret', e.target.value)} className={inputClass} placeholder="14 chiffres" />
            </FieldGroup>
          </div>
          {duplicate && (
            <div className="rounded-[var(--r-md)] border px-3 py-2 flex flex-col gap-1"
              style={{ borderColor: 'var(--warning)', backgroundColor: 'color-mix(in srgb, var(--warning) 12%, transparent)' }}>
              <p className="text-[var(--fs-sm)] font-semibold" style={{ color: 'var(--warning)' }}>
                Doublon possible
              </p>
              <p className="text-[var(--fs-xs)] text-[var(--text-muted)]">
                Un fournisseur avec le même SIREN existe déjà :{' '}
                <button
                  type="button"
                  onClick={() => openDrawer(duplicate)}
                  className="underline hover:opacity-80 transition-opacity"
                  style={{ color: 'var(--brand)' }}
                >
                  {duplicate.name}
                </button>
              </p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <FieldGroup label="N° TVA intra">
              <input value={form.tva_intra ?? ''} onChange={e => set('tva_intra', e.target.value)} className={inputClass} />
            </FieldGroup>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FieldGroup label="E-mail">
              <input type="email" value={form.email ?? ''} onChange={e => set('email', e.target.value)} className={inputClass} />
            </FieldGroup>
            <FieldGroup label="Téléphone">
              <input type="tel" value={form.phone ?? ''} onChange={e => set('phone', e.target.value)} className={inputClass} />
            </FieldGroup>
          </div>
          <FieldGroup label="Adresse">
            <input value={form.address ?? ''} onChange={e => set('address', e.target.value)} className={inputClass} />
          </FieldGroup>
          <FieldGroup label="Notes">
            <textarea value={form.notes ?? ''} onChange={e => set('notes', e.target.value)} rows={3} className={`${inputClass} h-auto resize-none`} />
          </FieldGroup>
          <div className="flex gap-2 pt-2 border-t border-[var(--border)]">
            <Button variant="primary" onClick={handleSave} disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</Button>
            <Button variant="secondary" onClick={() => setDrawerOpen(false)}>Annuler</Button>
            {selected?.active && (
              <Button variant="ghost" onClick={handleDeactivate} className="ml-auto text-[var(--danger)]">Désactiver</Button>
            )}
            {selected && can('tiers.fournisseurs', 'delete') && (
              <Button variant="ghost" onClick={() => setConfirmDelete(true)}
                className={`${selected.active ? '' : 'ml-auto'} text-[var(--danger)]`}>
                <Trash2 size={14} />
                Supprimer
              </Button>
            )}
          </div>
        </div>
      </Drawer>

      <ConfirmDialog
        open={confirmDuplicate}
        title="Doublon SIREN détecté"
        message={duplicate
          ? `Un fournisseur avec le même SIREN existe déjà : « ${duplicate.name} ». Voulez-vous quand même enregistrer ?`
          : ''}
        confirmLabel="Enregistrer quand même"
        onConfirm={doSave}
        onCancel={() => setConfirmDuplicate(false)}
        loading={saving}
      />

      <ConfirmDialog
        open={confirmDeactivate}
        title="Désactiver le fournisseur"
        message={selected ? `Le fournisseur « ${selected.name} » sera désactivé et masqué des listes actives.` : ''}
        confirmLabel="Désactiver"
        onConfirm={doDeactivate}
        onCancel={() => setConfirmDeactivate(false)}
        loading={false}
      />

      <ConfirmDialog
        open={confirmDelete}
        title="Supprimer ce fournisseur ?"
        message="Action irréversible."
        onConfirm={doDelete}
        onCancel={() => setConfirmDelete(false)}
        loading={deleting}
      />
    </Shell>
  )
}
