import { useState, useEffect, useCallback, useMemo } from 'react'
import { Building2, ChevronRight, Droplets, Euro, Trash2, Wrench } from 'lucide-react'
import { Shell } from '../../app/Shell'
import { AvatarInitiales } from '../../shared/ui/AvatarInitiales'
import { ChiffreCarte } from '../../shared/ui/ChiffreCarte'
import { ListeDeroulante } from '../../shared/ui/ListeDeroulante'
import { PastilleFiltre } from '../../shared/ui/PastilleFiltre'
import { Badge } from '../../shared/ui/Badge'
import { BarreRecherche } from '../../shared/ui/BarreRecherche'
import { Button } from '../../shared/ui/Button'
import { EmptyState } from '../../shared/ui/EmptyState'
import { ContactLinks } from '../../shared/ui/ContactLinks'
import { telHref } from '../../shared/lib/contact'
import { SkeletonTable, SkeletonKpis } from '../../shared/ui/Skeleton'
import { Drawer } from '../../shared/ui/Drawer'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { useToast } from '../../shared/ui/useToast'
import { useProfile } from '../../app/providers'
import { useSync } from '../../app/SyncProvider'
import { usePermissions } from '../../shared/permissions/usePermissions'
import { getSuppliers, createSupplier, updateSupplier, deactivateSupplier, deleteSupplier, getChargesDouzeMois } from './fournisseurs.queries'
import { CATEGORY_LABELS, getCategoryLabel, isTvaDeductible, countByCategory, normalizeSiren, validateSiren, findDuplicate, cumulerDepensesParFournisseur, type ChargePourCumul, type DepensesFournisseur } from './fournisseurs.logic'
import { formatMoney } from '../../shared/lib/money'
import type { Supplier, SupplierInsert, SupplierFilters } from './fournisseurs.types'
import type { ActionKey } from '../../shared/actions/ActionBar'

const inputClass = 'field'
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
  // Tous les fournisseurs (sans filtre) : les tuiles comptent sur l'ensemble.
  const [tous, setTous] = useState<Supplier[]>([])
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selected, setSelected] = useState<Supplier | null>(null)
  const [form, setForm] = useState<Partial<SupplierInsert>>({})
  const [saving, setSaving] = useState(false)
  const [sirenError, setSirenError] = useState('')
  const [confirmDuplicate, setConfirmDuplicate] = useState(false)
  const [confirmDeactivate, setConfirmDeactivate] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [depenses, setDepenses] = useState<Map<string, DepensesFournisseur>>(new Map())

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    const { data, error } = await getSuppliers({ ...filters, search: search || undefined })
    if (error) setError(error.message)
    else setSuppliers(data ?? [])
    setLoading(false)
    void getSuppliers({}).then(r => setTous(r.data ?? []))
  }, [filters, search])

  // Les depenses se chargent A PART de la liste : elles ne dependent ni du
  // filtre ni de la recherche, et les recalculer a chaque frappe dans la barre
  // de recherche serait du gaspillage.
  useEffect(() => {
    getChargesDouzeMois().then(({ data }) => {
      setDepenses(cumulerDepensesParFournisseur((data ?? []) as ChargePourCumul[]))
    })
  }, [])

  const { syncState, syncIfStale } = useSync()
  useEffect(() => { syncIfStale('fournisseurs') }, [syncIfStale])
  useEffect(() => { load() }, [load, syncState.fournisseurs.lastSyncAt])

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

  const actifsListe = tous.filter(x => x.active)
  const byCategory = countByCategory(actifsListe)
  const basculeCategorie = (c: SupplierFilters['category']) => setFilters(f => ({ ...f, category: f.category === c ? 'all' : c }))
  const filtresActifs = search !== '' || (filters.category && filters.category !== 'all')

  return (
    <Shell pageTitle="Fournisseurs" actions={[...(canCreate ? ['nouveau' as const] : []), 'export']} onAction={handleAction}>
      {/* Tuiles cliquables : chaque geste filtre la liste */}
      {loading && tous.length === 0 ? <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5"><SkeletonKpis count={4} /></div> : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          <ChiffreCarte libelle="Fournisseurs actifs" icone={<Building2 size={13} />} valeur={String(actifsListe.length)} detail={`sur ${tous.length} au total`}
            titre="Tous les fournisseurs actifs" actif={filters.active === true && (!filters.category || filters.category === 'all')}
            onClick={() => setFilters({ active: true })} />
          <ChiffreCarte libelle="Carburant" icone={<Droplets size={13} />} valeur={String(byCategory.carburant ?? 0)} detail="stations, cartes"
            titre="Fournisseurs de carburant" actif={filters.category === 'carburant'} onClick={() => basculeCategorie('carburant')} />
          <ChiffreCarte libelle="Entretien" icone={<Wrench size={13} />} valeur={String(byCategory.entretien ?? 0)} detail="garages, pièces"
            titre="Fournisseurs d'entretien" actif={filters.category === 'entretien'} onClick={() => basculeCategorie('entretien')} />
          <ChiffreCarte libelle="Dépensé 12 mois" icone={<Euro size={13} />} valeur={formatMoney([...depenses.values()].reduce((t, d) => t + d.totalHtCts, 0))}
            ton="warning" detail="HT, hors immobilisations" titre="Total dépensé" actif={false} onClick={() => setFilters({ active: true })} />
        </div>
      )}

      {/* Recherche + filtres */}
      <div className="flex flex-wrap items-center gap-2.5 mb-4">
        <BarreRecherche value={search} onChange={setSearch} placeholder="Chercher un fournisseur : nom, SIRET…" ariaLabel="Rechercher un fournisseur"
          raccourci className="flex-1 min-w-[14rem] max-w-xl" compteur={`${suppliers.length} résultat${suppliers.length > 1 ? 's' : ''}`} />
        <div className="w-52">
          <ListeDeroulante valeur={filters.category ?? 'all'} ariaLabel="Catégorie" recherche={false}
            onChange={v => setFilters(f => ({ ...f, category: v as SupplierFilters['category'] }))}
            options={[{ valeur: 'all', libelle: 'Toutes catégories' }, ...(Object.entries(CATEGORY_LABELS) as [string, string][]).map(([v, l]) => ({ valeur: v, libelle: l }))]} />
        </div>
        <PastilleFiltre actif={filters.active === true} onClick={() => setFilters(f => ({ ...f, active: f.active === true ? undefined : true }))}>Actifs uniquement</PastilleFiltre>
        {filtresActifs && (
          <button type="button" onClick={() => { setSearch(''); setFilters({ active: true }) }}
            className="text-sm text-[var(--text-muted)] hover:text-[var(--brand)] underline-offset-2 hover:underline">Tout réinitialiser</button>
        )}
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
            description={filtresActifs ? 'Aucun fournisseur ne correspond à ces filtres.' : 'Ajoutez vos fournisseurs récurrents.'}
            action={!filtresActifs && canCreate ? { label: '+ Nouveau fournisseur', onClick: () => openDrawer() } : undefined}
          />
        ) : (
          <>
            {/* Desktop */}
            <div className="hidden md:block overflow-x-auto rounded-[var(--r-xl)] border border-[var(--border)] bg-[var(--bg-card)]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-[var(--text-muted)] border-b border-[var(--border)]">
                    {['Fournisseur', 'Catégorie', 'Dépensé 12 mois', 'Dernière facture', 'SIRET', 'Téléphone', ''].map(h => (
                      <th key={h} className={`px-4 py-2.5 font-medium ${h === 'Dépensé 12 mois' ? 'text-right' : ''}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {suppliers.map(s => (
                    <tr key={s.id} onClick={() => openDrawer(s)} tabIndex={0} onKeyDown={e => { if (e.key === 'Enter') openDrawer(s) }}
                      className="group border-b border-[var(--border)] last:border-0 cursor-pointer hover:bg-[var(--bg-card-hover)] transition-colors">
                      <td className="px-4 py-2.5">
                        <span className="flex items-center gap-3 min-w-0">
                          <AvatarInitiales nom={s.name} discret={!s.active} />
                          <span className="min-w-0">
                            <span className={`block truncate font-medium ${s.active ? 'text-[var(--text)]' : 'text-[var(--text-muted)]'}`}>{s.name}</span>
                            <span className="block truncate text-xs text-[var(--text-muted)]">
                              {!s.active ? 'Inactif' : isTvaDeductible(s.category) ? 'TVA 100 % déductible' : (s.email || '—')}
                            </span>
                          </span>
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge color="muted">{getCategoryLabel(s.category)}</Badge>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[var(--text)]">
                        {depenses.has(s.id) ? formatMoney(depenses.get(s.id)!.totalHtCts) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-[var(--text-muted)]">
                        {depenses.get(s.id)?.derniereDate
                          ? new Date(depenses.get(s.id)!.derniereDate!).toLocaleDateString('fr-FR')
                          : '—'}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-[var(--text-muted)]">{s.siret ?? '—'}</td>
                      <td className="px-4 py-2.5 text-[var(--text-muted)]" onClick={e => e.stopPropagation()}>
                        {telHref(s.phone)
                          ? <a href={telHref(s.phone)!} className="hover:text-[var(--brand)] transition-colors">{s.phone}</a>
                          : '—'}
                      </td>
                      <td className="pr-3 text-[var(--text-disabled)] group-hover:text-[var(--text-muted)]"><ChevronRight size={16} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile */}
            <div className="md:hidden flex flex-col gap-2.5">
              {suppliers.map(s => (
                <button key={s.id} onClick={() => openDrawer(s)}
                  className="w-full text-left bg-[var(--bg-card)] rounded-[var(--r-lg)] border border-[var(--border)] p-3.5 flex items-center gap-3 hover:bg-[var(--bg-card-hover)] transition-colors">
                  <AvatarInitiales nom={s.name} discret={!s.active} />
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-medium text-[var(--text)] truncate">{s.name}</span>
                      <Badge color="muted">{getCategoryLabel(s.category)}</Badge>
                    </span>
                    <span className="block" onClick={e => e.stopPropagation()}>
                      <ContactLinks phone={s.phone} email={s.email} />
                    </span>
                  </span>
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
            <ListeDeroulante valeur={form.category ?? ''} onChange={v => set('category', v || null)} ariaLabel="Catégorie" placeholder="Choisir une catégorie" recherche={false}
              options={(Object.entries(CATEGORY_LABELS) as [string, string][]).map(([v, l]) => ({ valeur: v, libelle: l }))} />
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
            <textarea value={form.notes ?? ''} onChange={e => set('notes', e.target.value)} rows={3} className={`${inputClass} field-area resize-none`} />
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
