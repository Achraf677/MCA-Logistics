import { useState, useEffect, useCallback } from 'react'
import { Fuel, Euro, Droplet, Gauge } from 'lucide-react'
import { Shell } from '../../app/Shell'
import { ChiffreCarte } from '../../shared/ui/ChiffreCarte'
import { BarreRecherche } from '../../shared/ui/BarreRecherche'
import { ListeDeroulante } from '../../shared/ui/ListeDeroulante'
import { PastilleFiltre } from '../../shared/ui/PastilleFiltre'
import { useAffichageMontant, SelecteurHtTtc } from '../../shared/ui/AffichageMontant'
import { SkeletonKpis } from '../../shared/ui/Skeleton'
import { Badge } from '../../shared/ui/Badge'
import { Button } from '../../shared/ui/Button'
import { EmptyState } from '../../shared/ui/EmptyState'
import { SkeletonTable } from '../../shared/ui/Skeleton'
import { DrawerCarburant } from './DrawerCarburant'
import { FileAttenteCarburant } from './FileAttenteCarburant'
import { DrawerReleve } from './DrawerReleve'
import { listProduitsVehicule } from '../../shared/lib/produitsVehicule.queries'
import type { ProduitVehicule } from '../../shared/lib/produitsVehicule'
import { useToast } from '../../shared/ui/useToast'
import { supabase } from '../../app/providers'
import { getFuelLogs, exportFuelCSV } from './carburant.queries'
import {
  libelleProduit, couleurProduit,
  formatCents, formatLiters, formatPricePerLiter, kpiSummary, filtrerProduit, produitsUtilises,
  montantPlein, prixLitreMilli,
} from './carburant.logic'
import { FacturePdfLink } from '../../shared/ui/FacturePdfLink'
import { downloadCSV } from '../../shared/lib/download'
import type { FuelLogRow, FuelFilters } from './carburant.types'
import type { ActionKey } from '../../shared/actions/ActionBar'
import type { ChargePick } from '../../shared/types/charges'
import type { LectureOcr } from '../../shared/lib/lectureFacture'

type VehicleLookup = { id: string; label: string; plate?: string | null }

export function Carburant() {
  const { toast } = useToast()
  const [rows, setRows]         = useState<FuelLogRow[]>([])
  const [vehicles, setVehicles] = useState<VehicleLookup[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [filters, setFilters]   = useState<FuelFilters>({})
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selected, setSelected] = useState<FuelLogRow | null>(null)
  const [initialCharge, setInitialCharge] = useState<ChargePick | null>(null)
  const [initialOcr, setInitialOcr] = useState<LectureOcr | null>(null)
  const [queueRefresh, setQueueRefresh] = useState(0)
  // Pleins sans facture liée — indépendant de `filters` (envoyés à la requête) :
  // filtre client, sur les lignes déjà chargées, comme le reste des filtres spéciaux.
  const [filtreARapprocher, setFiltreARapprocher] = useState(false)
  const [recherche, setRecherche] = useState('')
  const [mode, setMode] = useAffichageMontant()
  const suffixe = mode === 'ttc' ? 'TTC' : 'HT'

  useEffect(() => {
    // La plaque est chargée : c'est elle qui relie une facture carburant à un
    // véhicule sans ambiguïté (voir trouverVehicule, dans la file d'attente).
    supabase.from('vehicles').select('id, label, plate').eq('status', 'active').order('label')
      .then(({ data }) => setVehicles((data ?? []).map(v => ({ id: v.id, label: v.label, plate: v.plate }))))
  }, [])

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    const { data, error } = await getFuelLogs(filters)
    if (error) setError(error.message)
    else setRows((data ?? []) as unknown as FuelLogRow[])
    setLoading(false)
  }, [filters])

  useEffect(() => { load() }, [load])

  const handleAction = async (key: ActionKey) => {
    if (key === 'nouveau') { setSelected(null); setInitialCharge(null); setInitialOcr(null); setDrawerOpen(true) }
    if (key === 'export') {
      const csv = await exportFuelCSV(filters)
      downloadCSV(csv, 'carburant.csv')
      toast('Export téléchargé')
    }
  }

  const openRow = (row: FuelLogRow) => { setSelected(row); setInitialCharge(null); setInitialOcr(null); setDrawerOpen(true) }

  // Depuis la file d'attente : la charge et sa lecture OCR sont déjà en poche,
  // il ne reste qu'à vérifier et enregistrer dans le drawer.
  const handleValiderDepuisFile = (charge: ChargePick, ocr: LectureOcr | null) => {
    setSelected(null)
    setInitialCharge(charge)
    setInitialOcr(ocr)
    setDrawerOpen(true)
  }

  // Relevé de carte carburant (une facture → plusieurs pleins).
  const [releveCharge, setReleveCharge] = useState<ChargePick | null>(null)
  // Produits personnalisés (Paramètres) : libellés, famille, listes déroulantes.
  const [produits, setProduits] = useState<ProduitVehicule[]>([])
  useEffect(() => { void listProduitsVehicule().then(setProduits) }, [])

  // Filtre « Tous / Carburants / Consommables / <produit> », côté client : les
  // KPIs suivent la sélection (litres et prix/L restent de toute façon carburants).
  const puces = produitsUtilises(rows)
  const filtreProduit = filters.produit ?? 'all'
  const choisirProduit = (v: string) => setFilters(f => ({ ...f, produit: v === 'all' ? undefined : v }))
  const rowsFamille = filtrerProduit(rows, filters.produit, produits)
  const kpis = kpiSummary(rowsFamille, produits)
  const nbARapprocher = rowsFamille.filter(r => !r.charge_id).length
  const mot = recherche.trim().toLowerCase()
  const displayRows = rowsFamille
    .filter(r => !filtreARapprocher || !r.charge_id)
    .filter(r => !mot || [r.vehicles?.label, r.vehicles?.plate, r.team_members?.full_name, r.station].filter(Boolean).join(' ').toLowerCase().includes(mot))

  const hasFilters = !!(
    (filters.vehicle_id && filters.vehicle_id !== 'all') ||
    (filters.produit && filters.produit !== 'all') ||
    filters.date_from || filters.date_to || filtreARapprocher || recherche
  )
  const resetFilters = () => { setFilters({}); setFiltreARapprocher(false); setRecherche('') }
  const carburantsSeuls = filters.produit === 'famille:carburant'
  const basculeCarburants = () => choisirProduit(carburantsSeuls ? 'all' : 'famille:carburant')

  return (
    <Shell pageTitle="Carburant & consommables" actions={['nouveau', 'export']} onAction={handleAction}
      actionsGauche={<SelecteurHtTtc mode={mode} onChange={setMode} />}>
      {/* Tuiles cliquables (HT) : chaque geste filtre la liste */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5"><SkeletonKpis count={4} /></div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          <ChiffreCarte libelle="Achats" icone={<Fuel size={13} />} valeur={String(kpis.nb)}
            detail={nbARapprocher > 0 ? `${nbARapprocher} à rapprocher` : 'tous rapprochés'} ton={nbARapprocher > 0 ? 'warning' : undefined}
            titre="Voir les achats sans facture liée" actif={filtreARapprocher} onClick={() => setFiltreARapprocher(v => !v)} />
          <ChiffreCarte libelle={`Total ${suffixe}`} icone={<Euro size={13} />} valeur={formatCents(mode === 'ttc' ? kpis.totalTtcCts : kpis.totalHtCts)} detail="carburant + consommables"
            titre="Tout afficher" actif={false} onClick={resetFilters} />
          <ChiffreCarte libelle="Litres" icone={<Droplet size={13} />} valeur={formatLiters(kpis.totalLiters)} detail="carburant seulement"
            titre="Carburants seulement" actif={carburantsSeuls} onClick={basculeCarburants} />
          <ChiffreCarte libelle={`Prix moy. / L ${suffixe}`} icone={<Gauge size={13} />} valeur={formatPricePerLiter(mode === 'ttc' ? kpis.avgPricePerLiterTtc : kpis.avgPricePerLiter)} detail="moyenne pondérée"
            titre="Carburants seulement" actif={carburantsSeuls} onClick={basculeCarburants} />
        </div>
      )}

      <FileAttenteCarburant vehicles={vehicles} onValider={handleValiderDepuisFile} onImporterReleve={setReleveCharge} refreshToken={queueRefresh} />

      {/* Recherche + filtres */}
      <div className="flex flex-wrap items-center gap-2.5 mb-4">
        <BarreRecherche value={recherche} onChange={setRecherche} placeholder="Chercher : véhicule, plaque, chauffeur, station…" ariaLabel="Rechercher un plein"
          raccourci className="basis-full sm:basis-auto sm:flex-1 min-w-[14rem] max-w-xl" compteur={`${displayRows.length} résultat${displayRows.length > 1 ? 's' : ''}`} />
        <input type="date" value={filters.date_from ?? ''} aria-label="Date début"
          onChange={e => setFilters(f => ({ ...f, date_from: e.target.value || undefined }))} title="Date début" className="field !w-auto" />
        <input type="date" value={filters.date_to ?? ''} aria-label="Date fin"
          onChange={e => setFilters(f => ({ ...f, date_to: e.target.value || undefined }))} title="Date fin" className="field !w-auto" />
        <div className="w-full min-[420px]:w-52">
          <ListeDeroulante valeur={filters.vehicle_id ?? 'all'} ariaLabel="Véhicule" recherche={false}
            onChange={v => setFilters(f => ({ ...f, vehicle_id: (v || 'all') as FuelFilters['vehicle_id'] }))}
            options={[{ valeur: 'all', libelle: 'Tous véhicules' }, ...vehicles.map(v => ({ valeur: v.id, libelle: v.label }))]} />
        </div>
        <div className="w-full min-[420px]:w-56">
          <ListeDeroulante valeur={filtreProduit} ariaLabel="Produit" onChange={choisirProduit}
            options={[
              { valeur: 'all', libelle: 'Tous les produits' },
              { valeur: 'famille:carburant', libelle: 'Carburants' },
              { valeur: 'famille:liquide', libelle: 'Consommables' },
              ...puces.map(p => ({ valeur: p.code, libelle: `${libelleProduit(p.code, produits)} (${p.nb})` })),
            ]} />
        </div>
        <PastilleFiltre actif={filtreARapprocher} onClick={() => setFiltreARapprocher(v => !v)}>
          À rapprocher{nbARapprocher > 0 ? ` (${nbARapprocher})` : ''}
        </PastilleFiltre>
        {hasFilters && (
          <button type="button" onClick={resetFilters}
            className="text-sm text-[var(--text-muted)] hover:text-[var(--brand)] underline-offset-2 hover:underline">Tout réinitialiser</button>
        )}
      </div>

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
          icon={<Fuel size={48} />}
          title="Aucun plein enregistré"
          description={hasFilters
            ? 'Aucun résultat pour ces filtres.'
            : 'Commencez à enregistrer les pleins de carburant.'}
          action={!hasFilters
            ? { label: '+ Saisir un plein', onClick: () => { setSelected(null); setDrawerOpen(true) } }
            : undefined}
        />
      ) : (
        <>
          {/* Desktop */}
          <div className="hidden md:block overflow-x-auto panel rounded-[var(--r-xl)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[var(--bg-elevated)] text-[var(--text-muted)] text-left">
                  {['Date', 'Véhicule', 'Chauffeur', 'Litres', `€/L ${suffixe}`, `Total ${suffixe}`, 'Produit', 'Facture', ''].map(h => (
                    <th key={h} className="px-4 py-2.5 font-medium text-xs">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayRows.map((row, i) => (
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
                    <td className="px-4 py-3 text-[var(--text-muted)]">{row.team_members?.full_name ?? '—'}</td>
                    <td className="px-4 py-3 font-mono">{row.liters > 0 ? `${row.liters.toFixed(2)} L` : '—'}</td>
                    <td className="px-4 py-3 font-mono text-xs text-[var(--text-muted)]">
                      {row.liters > 0 ? formatPricePerLiter(prixLitreMilli(row, mode)).replace(' €/L', ' €') : '—'}
                    </td>
                    <td className="px-4 py-3 font-mono font-semibold text-[var(--text)]">
                      {formatCents(montantPlein(row, mode))}
                    </td>
                    <td className="px-4 py-3">
                      {row.fuel_type
                        ? <Badge color={couleurProduit(row.fuel_type)}>{libelleProduit(row.fuel_type, produits)}</Badge>
                        : <span className="text-[var(--text-disabled)]">—</span>}
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
                      ) : (
                        <span className="text-[var(--text-disabled)]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="ghost" size="compact" onClick={e => { e.stopPropagation(); openRow(row) }}>Voir</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile */}
          <div className="md:hidden flex flex-col gap-3">
            {displayRows.map(row => (
              <button
                key={row.id}
                onClick={() => openRow(row)}
                className="w-full text-left bg-[var(--bg-card)] rounded-[var(--r-lg)] border border-[var(--border)] p-4 hover:bg-[var(--bg-card-hover)] transition-colors"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <span className="font-medium text-[var(--text)]">{row.vehicles?.label ?? '—'}</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {row.charges && <Badge color="success">Facturé</Badge>}
                    {row.fuel_type && <Badge color={couleurProduit(row.fuel_type)}>{libelleProduit(row.fuel_type, produits)}</Badge>}
                  </div>
                </div>
                <div className="flex items-end justify-between gap-2">
                  <div className="flex flex-col gap-0.5 text-xs text-[var(--text-muted)]">
                    <span>{new Date(row.date).toLocaleDateString('fr-FR')}</span>
                    <span>{row.liters > 0 ? `${row.liters.toFixed(2)} L · ${formatPricePerLiter(prixLitreMilli(row, mode))}` : '—'}</span>
                    {row.station && <span>{row.station}</span>}
                  </div>
                  <span className="font-mono font-semibold text-[var(--text)]">{formatCents(montantPlein(row, mode))}</span>
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      <DrawerCarburant
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        fuelLog={selected}
        initialCharge={initialCharge}
        initialOcr={initialOcr}
        produits={produits}
        onSaved={() => { load(); setQueueRefresh(n => n + 1) }}
      />
      <DrawerReleve
        open={releveCharge != null}
        onClose={() => setReleveCharge(null)}
        charge={releveCharge}
        produits={produits}
        onSaved={() => { load(); setQueueRefresh(n => n + 1) }}
      />
    </Shell>
  )
}
