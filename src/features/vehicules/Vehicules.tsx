import { useState, useEffect, useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Car, AlertTriangle, CalendarClock, ClipboardList, Wrench } from 'lucide-react'
import { Shell } from '../../app/Shell'
import { AvatarInitiales } from '../../shared/ui/AvatarInitiales'
import { Badge } from '../../shared/ui/Badge'
import { BarreRecherche } from '../../shared/ui/BarreRecherche'
import { Button } from '../../shared/ui/Button'
import { ChiffreCarte } from '../../shared/ui/ChiffreCarte'
import { EmptyState } from '../../shared/ui/EmptyState'
import { ListeDeroulante } from '../../shared/ui/ListeDeroulante'
import { PastilleFiltre } from '../../shared/ui/PastilleFiltre'
import { SkeletonCards, SkeletonKpis } from '../../shared/ui/Skeleton'
import { DrawerVehicule } from './DrawerVehicule'
import { getVehicles, getKmReleves } from './vehicules.queries'
import { downloadCSV } from '../../shared/lib/download'
import { useToast } from '../../shared/ui/useToast'
import {
  STATUS_LABELS, STATUS_COLORS, FUEL_LABELS, getCritairClass, formatMileage, kmConnus, filtrerVehicules,
  compteursVehicules, descriptionVehicule, resumeEcheance, exportVehiculesCSV, type CriteresVehicules,
} from './vehicules.logic'
import type { Vehicle } from './vehicules.types'
import type { ActionKey } from '../../shared/actions/ActionBar'

const COULEUR_RESUME: Record<string, string> = {
  overdue: 'text-red-400',
  soon: 'text-amber-300',
  manque: 'text-amber-300',
  ok: 'text-[var(--success)]',
  none: 'text-[var(--text-muted)]',
}

export function Vehicules() {
  const { toast } = useToast()
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [releves, setReleves] = useState<Awaited<ReturnType<typeof getKmReleves>>>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Lien cloche/dashboard (?filtre=urgent) : pré-coche le filtre échéances au lieu de la liste complète.
  const [searchParams] = useSearchParams()
  const [criteres, setCriteres] = useState<CriteresVehicules>(
    () => searchParams.get('filtre') === 'urgent' ? { echeance: 'urgent' } : {},
  )
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selected, setSelected] = useState<Vehicle | null>(null)
  const today = useMemo(() => new Date(), [])

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    const [{ data, error }, km] = await Promise.all([getVehicles(), getKmReleves()])
    if (error) setError(error.message)
    else { setVehicles(data ?? []); setReleves(km) }
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const openDrawer = (v?: Vehicle) => { setSelected(v ?? null); setDrawerOpen(true) }

  const km = useMemo(() => kmConnus(vehicles, releves), [vehicles, releves])
  const compteurs = useMemo(() => compteursVehicules(vehicles, today), [vehicles, today])
  const affiches = useMemo(() => filtrerVehicules(vehicles, criteres, today), [vehicles, criteres, today])
  const filtresActifs = !!criteres.recherche || (criteres.status ?? 'all') !== 'all' || (criteres.fuel_type ?? 'all') !== 'all'
    || criteres.echeance === 'urgent' || !!criteres.incomplet

  const bascule = (c: Partial<CriteresVehicules>) => {
    const [cle, val] = Object.entries(c)[0] as [keyof CriteresVehicules, unknown]
    setCriteres(p => ({ ...p, [cle]: p[cle] === val ? (cle === 'status' ? 'all' : undefined) : val }))
  }

  const handleAction = (key: ActionKey) => {
    if (key === 'nouveau') openDrawer()
    if (key === 'export') {
      downloadCSV(exportVehiculesCSV(affiches, today, km), 'vehicules.csv')
      toast('Export téléchargé')
    }
  }

  return (
    <Shell pageTitle="Véhicules" actions={['nouveau', 'export']} onAction={handleAction}>
      {/* Tuiles cliquables : chaque geste filtre la liste (elles comptent sur l'ensemble) */}
      {loading && vehicles.length === 0 ? <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5"><SkeletonKpis count={4} /></div> : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          <ChiffreCarte libelle="Actifs" icone={<Car size={13} />} valeur={String(compteurs.actifs)} detail={`sur ${compteurs.total} véhicule${compteurs.total > 1 ? 's' : ''}`}
            titre="Véhicules en service" actif={criteres.status === 'active'} onClick={() => bascule({ status: 'active' })} />
          <ChiffreCarte libelle="En maintenance" icone={<Wrench size={13} />} valeur={String(compteurs.maintenance)} detail="à l'atelier"
            ton={compteurs.maintenance > 0 ? 'warning' : undefined}
            titre="Véhicules en maintenance" actif={criteres.status === 'maintenance'} onClick={() => bascule({ status: 'maintenance' })} />
          <ChiffreCarte libelle="Échéances" icone={<CalendarClock size={13} />} valeur={String(compteurs.echeancesProches)}
            detail={compteurs.echeancesDepassees > 0 ? `${compteurs.echeancesDepassees} dépassée${compteurs.echeancesDepassees > 1 ? 's' : ''}` : 'proches (30 j)'}
            ton={compteurs.echeancesDepassees > 0 ? 'danger' : compteurs.echeancesProches > 0 ? 'warning' : undefined}
            titre="CT, assurance, révision proches ou dépassés" actif={criteres.echeance === 'urgent'} onClick={() => bascule({ echeance: 'urgent' })} />
          <ChiffreCarte libelle="À renseigner" icone={<ClipboardList size={13} />} valeur={String(compteurs.aRenseigner)} detail="CT ou assurance manquants"
            ton={compteurs.aRenseigner > 0 ? 'warning' : undefined}
            titre="Véhicules sans date de contrôle technique ou d'assurance" actif={!!criteres.incomplet} onClick={() => bascule({ incomplet: true })} />
        </div>
      )}

      {/* Recherche + filtres */}
      <div className="flex flex-wrap items-center gap-2.5 mb-4">
        <BarreRecherche value={criteres.recherche ?? ''} onChange={v => setCriteres(p => ({ ...p, recherche: v }))}
          placeholder="Chercher un véhicule : nom, plaque, marque…" ariaLabel="Rechercher un véhicule" raccourci
          className="basis-full sm:basis-auto sm:flex-1 min-w-[14rem] max-w-xl" compteur={`${affiches.length} résultat${affiches.length > 1 ? 's' : ''}`} />
        <div className="w-full min-[420px]:w-52 sm:w-52">
          <ListeDeroulante valeur={criteres.status ?? 'all'} ariaLabel="Statut" recherche={false}
            onChange={v => setCriteres(p => ({ ...p, status: v as CriteresVehicules['status'] }))}
            options={[{ valeur: 'all', libelle: 'Tous statuts' }, ...(Object.entries(STATUS_LABELS) as [string, string][]).map(([v, l]) => ({ valeur: v, libelle: l }))]} />
        </div>
        <div className="w-full min-[420px]:w-52 sm:w-52">
          <ListeDeroulante valeur={criteres.fuel_type ?? 'all'} ariaLabel="Carburant" recherche={false}
            onChange={v => setCriteres(p => ({ ...p, fuel_type: v as CriteresVehicules['fuel_type'] }))}
            options={[{ valeur: 'all', libelle: 'Tous carburants' }, ...(Object.entries(FUEL_LABELS) as [string, string][]).map(([v, l]) => ({ valeur: v, libelle: l }))]} />
        </div>
        <PastilleFiltre actif={criteres.echeance === 'urgent'} onClick={() => bascule({ echeance: 'urgent' })}>Échéances proches</PastilleFiltre>
        {filtresActifs && (
          <button type="button" onClick={() => setCriteres({})}
            className="text-sm text-[var(--text-muted)] hover:text-[var(--brand)] underline-offset-2 hover:underline">Tout réinitialiser</button>
        )}
      </div>

      {loading ? <SkeletonCards rows={3} />
        : error ? (
          <div className="flex flex-col items-center py-16 gap-3">
            <p className="text-[var(--danger)] text-sm">{error}</p>
            <Button variant="secondary" onClick={load}>Réessayer</Button>
          </div>
        ) : affiches.length === 0 ? (
          <EmptyState
            icon={<Car size={48} />}
            title={filtresActifs ? 'Aucun véhicule ne correspond' : 'Aucun véhicule'}
            description={filtresActifs ? 'Change ou efface les filtres.' : 'Ajoutez les véhicules de votre flotte.'}
            action={filtresActifs ? { label: 'Tout réinitialiser', onClick: () => setCriteres({}) } : { label: '+ Ajouter un véhicule', onClick: () => openDrawer() }}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 stagger [&>*]:min-w-0">
            {affiches.map(v => {
              const resume = resumeEcheance(v, today)
              const description = descriptionVehicule(v)
              const dernierKm = km.get(v.id) ?? v.mileage_km
              return (
                <button key={v.id} type="button" onClick={() => openDrawer(v)}
                  className="text-left bg-[var(--bg-card)] rounded-[var(--r-xl)] border border-[var(--border)] p-4 hover:bg-[var(--bg-card-hover)] hover:border-[var(--brand)]/30 lift group">
                  <div className="flex items-start gap-3">
                    <AvatarInitiales nom={v.label} discret={v.status === 'inactive'} />
                    <div className="min-w-0 flex-1">
                      <p className="font-display font-semibold text-[var(--text)] group-hover:text-[var(--brand)] transition-colors truncate">{v.label}</p>
                      <p className="font-mono text-xs text-[var(--text-muted)] mt-0.5">{v.plate}</p>
                    </div>
                    <Badge color={STATUS_COLORS[v.status] as 'success' | 'warning' | 'muted'}>{STATUS_LABELS[v.status]}</Badge>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[var(--text-muted)]">
                    <span className="font-mono text-[var(--text)]" title={dernierKm !== v.mileage_km ? `Fiche : ${formatMileage(v.mileage_km)} · dernier relevé : ${formatMileage(dernierKm)}` : 'Kilométrage'}>
                      {formatMileage(dernierKm)}
                    </span>
                    {v.fuel_type && <span>{FUEL_LABELS[v.fuel_type]}</span>}
                    {description && <span className="truncate">{description}</span>}
                  </div>

                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[var(--border-soft)] text-xs">
                    {v.critair && (
                      <span title={`Crit'Air ${v.critair}`} className={`inline-flex items-center justify-center w-6 h-6 shrink-0 rounded-full font-bold ${getCritairClass(v.critair)}`}>{v.critair}</span>
                    )}
                    {resume.texte && (
                      <span className={`inline-flex items-center gap-1 min-w-0 truncate ${COULEUR_RESUME[resume.status]}`}>
                        {(resume.status === 'overdue' || resume.status === 'soon' || resume.status === 'manque') && <AlertTriangle size={12} className="shrink-0" />}
                        <span className="truncate">{resume.texte}</span>
                      </span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        )}

      <DrawerVehicule open={drawerOpen} onClose={() => setDrawerOpen(false)} vehicle={selected} onSaved={load} />
    </Shell>
  )
}
