import { useState, useEffect, useCallback } from 'react'
import { Wrench, AlertTriangle, Euro, Calendar, ClipboardCheck, Check } from 'lucide-react'
import { Shell } from '../../app/Shell'
import { ChiffreCarte } from '../../shared/ui/ChiffreCarte'
import { BarreRecherche } from '../../shared/ui/BarreRecherche'
import { ListeDeroulante } from '../../shared/ui/ListeDeroulante'
import { PastilleFiltre } from '../../shared/ui/PastilleFiltre'
import { BoutonIcone } from '../../shared/ui/BoutonIcone'
import { useToast } from '../../shared/ui/useToast'
import { Badge } from '../../shared/ui/Badge'
import { Button } from '../../shared/ui/Button'
import { EmptyState } from '../../shared/ui/EmptyState'
import { SkeletonKpis, SkeletonTable } from '../../shared/ui/Skeleton'
import { FacturePdfLink } from '../../shared/ui/FacturePdfLink'
import { DrawerEntretien } from './DrawerEntretien'
import { FileAttenteEntretiens } from './FileAttenteEntretiens'
import { RecapEntretiens } from './RecapEntretiens'
import { supabase } from '../../app/providers'
import { getMaintenances, validerHt } from './entretiens.queries'
import { listAllocationsForCharges, type AllocationRow } from '../../shared/lib/allocations.queries'
import { formatCents, formatMileage, kpiSummary, htEntretien, enHt, aujourdhuiLocal } from './entretiens.logic'
import type { MaintenanceRow, MaintenanceFilters } from './entretiens.types'
import type { ActionKey } from '../../shared/actions/ActionBar'
import type { ChargePick } from '../../shared/types/charges'
import type { LectureOcr } from '../../shared/lib/lectureFacture'

type VehicleLookup = { id: string; label: string; plate?: string | null }

export function Entretiens() {
  const { toast } = useToast()
  const [rows, setRows]         = useState<MaintenanceRow[]>([])
  const [vehicles, setVehicles] = useState<VehicleLookup[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [filters, setFilters]   = useState<MaintenanceFilters>({})
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selected, setSelected] = useState<MaintenanceRow | null>(null)
  const [initialCharge, setInitialCharge] = useState<ChargePick | null>(null)
  const [initialOcr, setInitialOcr] = useState<LectureOcr | null>(null)
  const [queueRefresh, setQueueRefresh] = useState(0)
  // Entretiens sans facture liée — filtre client, indépendant de `filters`
  // (envoyés à la requête), comme le reste des filtres spéciaux du site.
  const [filtreARapprocher, setFiltreARapprocher] = useState(false)
  const [filtreAVerifier, setFiltreAVerifier] = useState(false)
  const [recherche, setRecherche] = useState('')
  // Sous-lignes de ventilation "pure" par charge_id — remplace l'affichage du
  // montant brut quand la facture liée a été décomposée (voir DrawerEntretien).
  const [ventilationByCharge, setVentilationByCharge] = useState<Map<string, AllocationRow[]>>(new Map())

  useEffect(() => {
    // La plaque est chargée : c'est elle qui relie une facture d'entretien à
    // un véhicule sans ambiguïté (voir trouverVehicule, dans la file d'attente).
    supabase.from('vehicles').select('id, label, plate').order('label')
      .then(({ data }) => setVehicles((data ?? []).map(v => ({ id: v.id, label: v.label, plate: v.plate }))))
  }, [])

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    const { data, error } = await getMaintenances(filters)
    if (error) { setError(error.message); setLoading(false); return }
    const maintenanceRows = (data ?? []) as unknown as MaintenanceRow[]
    setRows(maintenanceRows)
    setLoading(false)

    const chargeIds = maintenanceRows.map(r => r.charges?.id).filter((id): id is string => !!id)
    const { data: ventilation } = await listAllocationsForCharges(chargeIds)
    const byCharge = new Map<string, AllocationRow[]>()
    for (const l of ventilation ?? []) {
      const arr = byCharge.get(l.charge_id) ?? []
      arr.push(l)
      byCharge.set(l.charge_id, arr)
    }
    setVentilationByCharge(byCharge)
  }, [filters])

  useEffect(() => { load() }, [load])

  const handleAction = (key: ActionKey) => {
    if (key === 'nouveau') { setSelected(null); setInitialCharge(null); setInitialOcr(null); setDrawerOpen(true) }
  }

  const openRow = (row: MaintenanceRow) => { setSelected(row); setInitialCharge(null); setInitialOcr(null); setDrawerOpen(true) }

  // Depuis la file d'attente : la charge et sa lecture OCR sont déjà en poche,
  // il ne reste qu'à vérifier et enregistrer dans le drawer.
  const handleValiderDepuisFile = (charge: ChargePick, ocr: LectureOcr | null) => {
    setSelected(null)
    setInitialCharge(charge)
    setInitialOcr(ocr)
    setDrawerOpen(true)
  }

  const kpis = kpiSummary(rows)
  const nbARapprocher = rows.filter(r => !r.charge_id).length
  const mot = recherche.trim().toLowerCase()
  const displayRows = rows
    .filter(r => !filtreARapprocher || !r.charge_id)
    .filter(r => !filtreAVerifier || r.ht_verifie_le == null)
    .filter(r => !mot || [r.vehicles?.label, r.vehicles?.plate, r.description, r.suppliers?.name].filter(Boolean).join(' ').toLowerCase().includes(mot))
  const hasFilters = !!(
    (filters.vehicle_id && filters.vehicle_id !== 'all') ||
    filters.date_from || filters.date_to || filtreARapprocher || filtreAVerifier || recherche
  )
  const resetFilters = () => { setFilters({}); setFiltreARapprocher(false); setFiltreAVerifier(false); setRecherche('') }
  const today = aujourdhuiLocal()

  // « J'ai vérifié le HT » : optimiste, la ligne change tout de suite, un échec la remet.
  const verifier = async (row: MaintenanceRow) => {
    const avant = row.ht_verifie_le
    setRows(rs => rs.map(r => r.id === row.id ? { ...r, ht_verifie_le: new Date().toISOString() } : r))
    const { error } = await validerHt(row.id)
    if (error) {
      setRows(rs => rs.map(r => r.id === row.id ? { ...r, ht_verifie_le: avant } : r))
      toast(error.message, 'error')
    }
  }
  const boutonVerifier = (row: MaintenanceRow) => row.ht_verifie_le == null && (
    <span onClick={e => e.stopPropagation()}>
      <BoutonIcone taille="sm" icone={Check} libelle="Valider le HT" onClick={() => void verifier(row)} />
    </span>
  )

  return (
    <Shell pageTitle="Entretiens" actions={['nouveau']} onAction={handleAction}>
      <FileAttenteEntretiens vehicles={vehicles} onValider={handleValiderDepuisFile} refreshToken={queueRefresh} />

      {/* Tuiles cliquables (HT) : chaque geste filtre la liste */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5"><SkeletonKpis count={4} /></div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          <ChiffreCarte libelle="À vérifier" icone={<ClipboardCheck size={13} />} valeur={String(kpis.aVerifier)} detail="HT à valider un par un"
            ton={kpis.aVerifier > 0 ? 'warning' : undefined}
            titre="Opérations dont le HT n'a pas encore été vérifié" actif={filtreAVerifier} onClick={() => setFiltreAVerifier(v => !v)} />
          <ChiffreCarte libelle="Interventions" icone={<Wrench size={13} />} valeur={String(kpis.nb)}
            detail={nbARapprocher > 0 ? `${nbARapprocher} sans facture` : 'toutes rapprochées'}
            titre="Tout afficher" actif={false} onClick={resetFilters} />
          <ChiffreCarte libelle="Total HT" icone={<Euro size={13} />} valeur={formatCents(kpis.totalHtCts)} detail="entretien + fournitures"
            titre="Tout afficher" actif={false} onClick={resetFilters} />
          <ChiffreCarte libelle="Échéances" icone={<Calendar size={13} />} valeur={String(kpis.withNextDue)}
            detail={kpis.overdue > 0 ? `${kpis.overdue} dépassée${kpis.overdue > 1 ? 's' : ''}` : 'à venir'}
            ton={kpis.overdue > 0 ? 'danger' : undefined}
            titre="Opérations avec une prochaine échéance" actif={false} onClick={resetFilters} />
        </div>
      )}

      {/* Recherche + filtres */}
      <div className="flex flex-wrap items-center gap-2.5 mb-4">
        <BarreRecherche value={recherche} onChange={setRecherche} placeholder="Chercher : véhicule, plaque, description, garage…" ariaLabel="Rechercher un entretien"
          raccourci className="basis-full sm:basis-auto sm:flex-1 min-w-[14rem] max-w-xl" compteur={`${displayRows.length} résultat${displayRows.length > 1 ? 's' : ''}`} />
        <input type="date" value={filters.date_from ?? ''} aria-label="Date début"
          onChange={e => setFilters(f => ({ ...f, date_from: e.target.value || undefined }))} title="Date début" className="field !w-auto" />
        <input type="date" value={filters.date_to ?? ''} aria-label="Date fin"
          onChange={e => setFilters(f => ({ ...f, date_to: e.target.value || undefined }))} title="Date fin" className="field !w-auto" />
        <div className="w-full min-[420px]:w-52">
          <ListeDeroulante valeur={filters.vehicle_id ?? 'all'} ariaLabel="Véhicule" recherche={false}
            onChange={v => setFilters(f => ({ ...f, vehicle_id: (v || 'all') as MaintenanceFilters['vehicle_id'] }))}
            options={[{ valeur: 'all', libelle: 'Tous véhicules' }, ...vehicles.map(v => ({ valeur: v.id, libelle: v.label }))]} />
        </div>
        <PastilleFiltre actif={filtreAVerifier} onClick={() => setFiltreAVerifier(v => !v)}>
          À vérifier{kpis.aVerifier > 0 ? ` (${kpis.aVerifier})` : ''}
        </PastilleFiltre>
        <PastilleFiltre actif={filtreARapprocher} onClick={() => setFiltreARapprocher(v => !v)}>
          À rapprocher{nbARapprocher > 0 ? ` (${nbARapprocher})` : ''}
        </PastilleFiltre>
        {hasFilters && (
          <button type="button" onClick={resetFilters}
            className="text-sm text-[var(--text-muted)] hover:text-[var(--brand)] underline-offset-2 hover:underline">Tout réinitialiser</button>
        )}
      </div>

      {/* Où part l'argent — suit les filtres de date/véhicule ci-dessus, mais pas
          le filtre « à rapprocher » : c'est une répartition financière, pas une
          file d'action. */}
      {!loading && !error && (
        <RecapEntretiens rows={rows} ventilationParCharge={ventilationByCharge} />
      )}

      {/* Contenu */}
      {loading ? (
        <SkeletonTable rows={6} />
      ) : error ? (
        <div className="flex flex-col items-center py-16 gap-3">
          <p className="text-[var(--danger)] text-sm">{error}</p>
          <Button variant="secondary" onClick={load}>Réessayer</Button>
        </div>
      ) : displayRows.length === 0 ? (
        <EmptyState
          icon={<Wrench size={48} />}
          title="Aucun entretien"
          description={hasFilters ? 'Aucun résultat pour ces filtres.' : 'Commencez à enregistrer les entretiens.'}
          action={!hasFilters
            ? { label: '+ Nouvel entretien', onClick: () => { setSelected(null); setDrawerOpen(true) } }
            : undefined}
        />
      ) : (
        <>
          {/* Desktop */}
          <div className="hidden md:block overflow-x-auto panel rounded-[var(--r-xl)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[var(--bg-elevated)] text-[var(--text-muted)] text-left">
                  {['Date', 'Véhicule', 'Description', 'Coût HT', 'km', 'Prochaine éch.', 'Facture', ''].map(h => (
                    <th key={h} className="px-4 py-2.5 font-medium text-xs">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayRows.map((row, i) => {
                  const isOverdue = row.next_due_date != null && row.next_due_date < today
                  const ventilation = row.charges ? ventilationByCharge.get(row.charges.id) : undefined
                  return (
                    <tr
                      key={row.id}
                      onClick={() => openRow(row)}
                      className={`border-t border-[var(--border)] cursor-pointer transition-colors hover:bg-[var(--bg-card-hover)]
                        ${i % 2 === 0 ? '' : 'bg-[var(--bg-card)]/40'}`}
                    >
                      <td className="px-4 py-3 font-mono text-xs text-[var(--text-muted)]">
                        {new Date(row.date).toLocaleDateString('fr-FR')}
                      </td>
                      <td className="px-4 py-3 font-medium text-[var(--text)]">
                        {row.vehicles?.label ?? '—'}
                        {row.vehicles?.plate && (
                          <span className="ml-2 font-mono text-xs text-[var(--text-muted)]">
                            {row.vehicles.plate}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[var(--text-muted)] max-w-[180px] truncate">
                        {row.description ?? '—'}
                      </td>
                      <td className="px-4 py-3 font-mono">
                        {ventilation && ventilation.length > 0 ? (
                          <div className="flex flex-col gap-0.5">
                            {ventilation.map(l => (
                              <div key={l.id} className="flex items-center gap-1.5 text-xs">
                                <span className="text-[var(--text-muted)] truncate max-w-[100px]">
                                  {l.charge_categories?.name ?? l.note ?? 'Sans catégorie'}
                                </span>
                                <span className="text-[var(--text)]">{formatCents(enHt(row, l.amount_cts))}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          htEntretien(row) != null ? formatCents(htEntretien(row)!) : '—'
                        )}
                        {row.ht_verifie_le == null && <span title="HT à vérifier" className="ml-2 inline-block w-1.5 h-1.5 rounded-full bg-amber-300 align-middle" />}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-[var(--text-muted)]">
                        {row.mileage_km != null ? formatMileage(row.mileage_km) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        {row.next_due_date ? (
                          <span className={`flex items-center gap-1 text-xs font-mono
                            ${isOverdue ? 'text-[var(--danger)]' : 'text-[var(--text-muted)]'}`}>
                            {isOverdue && <AlertTriangle size={11} />}
                            {new Date(row.next_due_date).toLocaleDateString('fr-FR')}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        {row.charges ? (
                          <div className="flex items-center gap-2">
                            <Badge color="success">Facturé</Badge>
                            <FacturePdfLink
                              pennylane_id={row.charges.pennylane_id}
                              receipt_url={row.charges.receipt_url}
                              label=""
                              iconSize={13}
                              className="inline-flex items-center text-[var(--brand)] hover:opacity-80 disabled:opacity-50"
                            />
                          </div>
                        ) : <span className="text-[var(--text-disabled)]">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="inline-flex items-center gap-1">
                          {boutonVerifier(row)}
                          <Button variant="ghost" size="compact" onClick={e => { e.stopPropagation(); openRow(row) }}>Voir</Button>
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile */}
          <div className="md:hidden flex flex-col gap-3">
            {displayRows.map(row => {
              const isOverdue = row.next_due_date != null && row.next_due_date < today
              const ventilation = row.charges ? ventilationByCharge.get(row.charges.id) : undefined
              return (
                <button
                  key={row.id}
                  onClick={() => openRow(row)}
                  className="w-full text-left bg-[var(--bg-card)] rounded-[var(--r-lg)] border border-[var(--border)] p-4 hover:bg-[var(--bg-card-hover)] transition-colors"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="font-medium text-[var(--text)]">{row.vehicles?.label ?? '—'}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {row.ht_verifie_le == null && <Badge color="warning">À vérifier</Badge>}
                      {row.charges && <Badge color="success">Facturé</Badge>}
                      {boutonVerifier(row)}
                    </div>
                  </div>
                  <div className="flex items-end justify-between gap-2">
                    <div className="flex flex-col gap-0.5 text-xs text-[var(--text-muted)]">
                      <span>{new Date(row.date).toLocaleDateString('fr-FR')}</span>
                      {row.description && <span className="truncate max-w-[200px]">{row.description}</span>}
                      {row.next_due_date && (
                        <span className={isOverdue ? 'text-[var(--danger)]' : ''}>
                          Éch. {new Date(row.next_due_date).toLocaleDateString('fr-FR')}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {ventilation && ventilation.length > 0 ? (
                        ventilation.map(l => (
                          <span key={l.id} className="text-xs text-[var(--text)]">
                            {l.charge_categories?.name ?? l.note ?? 'Sans catégorie'} · {formatCents(enHt(row, l.amount_cts))}
                          </span>
                        ))
                      ) : (
                        <span className="font-mono font-semibold text-[var(--text)]">
                          {htEntretien(row) != null ? formatCents(htEntretien(row)!) : '—'}
                        </span>
                      )}
                      <FacturePdfLink
                        pennylane_id={row.charges?.pennylane_id}
                        receipt_url={row.charges?.receipt_url}
                        label=""
                        iconSize={12}
                        className="inline-flex items-center text-[var(--brand)] hover:opacity-80 disabled:opacity-50"
                      />
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </>
      )}

      <DrawerEntretien
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        maintenance={selected}
        initialCharge={initialCharge}
        initialOcr={initialOcr}
        onSaved={() => { load(); setQueueRefresh(n => n + 1) }}
      />
    </Shell>
  )
}
