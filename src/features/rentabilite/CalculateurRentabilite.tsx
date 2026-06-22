import { useState, useEffect, useMemo, useRef } from 'react'
import {
  LineChart as ReLineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, ReferenceDot,
} from 'recharts'
import {
  Plus, Trash2, RotateCcw, Fuel, ChevronDown, ChevronUp,
  Clock, Wrench, CircleDollarSign, Save, FolderOpen, RefreshCw,
  X, MapPin, Navigation, Euro, TrendingDown, TrendingUp, Percent, Target, Gauge,
} from 'lucide-react'
import { KpiCard } from '../../shared/ui/KpiCard'
import { Badge } from '../../shared/ui/Badge'
import { deriveCoutsUnitaires, simulateCourse } from './rentabilite.logic'
import { useProfile, supabase } from '../../app/providers'
import type { CostProfil, ProfilData } from './rentabilite.profils.queries'
import { listProfils, createProfil, updateProfil, deleteProfil } from './rentabilite.profils.queries'
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'

/* ── Helpers ─────────────────────────────────────────────── */
const eur0 = (n: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(isFinite(n) ? n : 0)
const eur2 = (n: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(isFinite(n) ? n : 0)
const num = (n: number, d = 0) =>
  new Intl.NumberFormat('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }).format(isFinite(n) ? n : 0)
const uid = () => Math.random().toString(36).slice(2, 9)
const pct1 = (r: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(isFinite(r) ? r : 0)

type Freq = 'mensuel' | 'parJour' | 'auKm'

interface LineItem {
  id: string
  label: string
  freq: Freq
  montant: number | string
}

interface Params {
  jours:     number | string
  gazoleTTC: number | string
  tvaRecup:  number | string
  conso:     number | string
  kmJour:    number | string
}

const DEF_PARAMS: Params = { jours: 21, gazoleTTC: 2.05, tvaRecup: 100, conso: 10, kmJour: 450 }

interface CourseForm {
  prixPropose:    number | ''
  distanceCharge: number | ''
  dureeH:         number | ''
  kilometresVide: number | ''
  peages:         number | ''
  attenteH:       number | ''
  nbPoints:       number | ''
  margeCible:     number | ''
}
const DEF_COURSE: CourseForm = {
  prixPropose: '', distanceCharge: '', dureeH: '',
  kilometresVide: 0, peages: 0, attenteH: 0, nbPoints: 1, margeCible: 20,
}

const mkRecettes = (): LineItem[] => [
  { id: uid(), label: 'Forfait journalier', freq: 'parJour', montant: 200 },
]

const mkDepenses = (): LineItem[] => [
  { id: uid(), label: 'Salaire chargé chauffeur',       freq: 'mensuel', montant: 2000  },
  { id: uid(), label: 'Tickets resto (part patronale)', freq: 'parJour', montant: 7.2   },
  { id: uid(), label: 'Assurance véhicule',             freq: 'mensuel', montant: 300   },
  { id: uid(), label: 'Pennylane',                      freq: 'mensuel', montant: 79    },
  { id: uid(), label: 'Claude (HT)',                    freq: 'mensuel', montant: 18    },
  { id: uid(), label: 'Google Workspace (HT)',          freq: 'mensuel', montant: 6.75  },
  { id: uid(), label: 'Leasing / amortissement véhicule', freq: 'mensuel', montant: 500 },
  { id: uid(), label: 'Entretien, pneus, vidanges',     freq: 'auKm',    montant: 0.04  },
]

/* ── Sub-components ──────────────────────────────────────── */

function Field({ label, suffix, value, onChange, step = 1, min = 0 }: {
  label: string; suffix?: string; value: number | string
  onChange: (v: number | string) => void; step?: number; min?: number
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[var(--fs-xs)] uppercase tracking-wide text-[var(--text-muted)]">{label}</span>
      <div className="flex items-center rounded-[var(--r-md)] overflow-hidden border border-[var(--border)] bg-[var(--bg-card)]">
        <input
          type="number" step={step} min={min} value={value}
          onChange={(e) => onChange(e.target.value === '' ? '' : parseFloat(e.target.value))}
          className="font-mono w-full px-3 py-2 text-[var(--fs-sm)] outline-none bg-transparent text-[var(--text)]"
        />
        {suffix && <span className="font-mono text-[var(--fs-xs)] px-2 select-none text-[var(--text-disabled)]">{suffix}</span>}
      </div>
    </label>
  )
}

function Row({ item, onChange, onDelete, isIncome }: {
  item: LineItem; onChange: (item: LineItem) => void; onDelete: () => void; isIncome?: boolean
}) {
  return (
    <div className="grid grid-cols-12 gap-2 items-center">
      <input
        value={item.label}
        onChange={(e) => onChange({ ...item, label: e.target.value })}
        className="col-span-5 px-2 py-1.5 text-[var(--fs-sm)] rounded-[var(--r-sm)] outline-none border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text)]"
      />
      <select
        value={item.freq}
        onChange={(e) => onChange({ ...item, freq: e.target.value as Freq })}
        className="col-span-3 px-1.5 py-1.5 text-[var(--fs-xs)] rounded-[var(--r-sm)] outline-none border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-muted)]"
      >
        <option value="mensuel">/ mois</option>
        <option value="parJour">/ jour</option>
        <option value="auKm">/ km</option>
      </select>
      <div className="col-span-3 flex items-center rounded-[var(--r-sm)] overflow-hidden border border-[var(--border)] bg-[var(--bg-card)]">
        <input
          type="number" step="0.01" value={item.montant}
          onChange={(e) => onChange({ ...item, montant: e.target.value === '' ? '' : parseFloat(e.target.value) })}
          className={`font-mono w-full px-2 py-1.5 text-[var(--fs-sm)] outline-none text-right bg-transparent ${isIncome ? 'text-[var(--profit)]' : 'text-[var(--loss)]'}`}
        />
        <span className="text-[10px] px-1.5 text-[var(--text-disabled)]">€</span>
      </div>
      <button onClick={onDelete} className="col-span-1 flex justify-center opacity-50 hover:opacity-100 transition-opacity">
        <Trash2 size={15} className="text-[var(--loss)]" />
      </button>
    </div>
  )
}

function RateChip({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-[var(--r-md)] text-[var(--fs-xs)] bg-[var(--bg-deep)] text-[var(--text-muted)]">
      <Icon size={13} className="text-[var(--gold)] shrink-0" />
      <span>{label}</span>
      <span className="font-mono font-semibold ml-auto text-[var(--text)]">{value}</span>
    </div>
  )
}

/* ── Trajet & map ────────────────────────────────────────── */

interface TrajetResult {
  distance_km:      number
  duree_min:        number
  peage_estime_eur: number
  geometry:         { type: string; coordinates: [number, number][] }
  depart_coords:    [number, number]
  arrivee_coords:   [number, number]
  depart_label:     string
  arrivee_label:    string
}

const mkDotIcon = (color: string) =>
  L.divIcon({
    html: `<div style="width:12px;height:12px;background:${color};border:2px solid #fff;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>`,
    className: '',
    iconSize:   [12, 12] as unknown as L.PointExpression,
    iconAnchor: [6, 6]  as unknown as L.PointExpression,
  })

function FitBounds({ positions }: { positions: [number, number][] }) {
  const map    = useMap()
  const posRef = useRef(positions)
  useEffect(() => {
    if (posRef.current.length > 1) map.fitBounds(L.latLngBounds(posRef.current), { padding: [24, 24] })
  }, [map])
  return null
}

function TrajetMap({ geometry, departCoords, arriveeCoords }: {
  geometry:      TrajetResult['geometry']
  departCoords:  [number, number]
  arriveeCoords: [number, number]
}) {
  const latlngs = useMemo(
    () => geometry.coordinates.map(([lon, lat]) => [lat, lon] as [number, number]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [geometry.coordinates],
  )
  return (
    <div style={{ height: 280, borderRadius: 'var(--r-xl)', overflow: 'hidden', position: 'relative', zIndex: 0 }}>
      <MapContainer
        center={departCoords}
        zoom={10}
        style={{ height: '100%', width: '100%' }}
        attributionControl
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='© <a href="https://openstreetmap.org">OSM</a>'
          maxZoom={18}
        />
        <Polyline positions={latlngs} pathOptions={{ color: 'var(--brand)', weight: 4, opacity: 0.85 }} />
        <Marker position={departCoords} icon={mkDotIcon('#15803D')}>
          <Popup>Départ</Popup>
        </Marker>
        <Marker position={arriveeCoords} icon={mkDotIcon('#DC2626')}>
          <Popup>Arrivée</Popup>
        </Marker>
        <FitBounds positions={latlngs} />
      </MapContainer>
    </div>
  )
}

/* ── Main component ──────────────────────────────────────── */

export function CalculateurRentabilite() {
  const [params, setParams]   = useState<Params>(DEF_PARAMS)
  const [recettes, setRecettes] = useState<LineItem[]>(() => mkRecettes())
  const [depenses, setDepenses] = useState<LineItem[]>(() => mkDepenses())
  const [loaded, setLoaded]   = useState(false)
  const [courseForm, setCourseForm] = useState<CourseForm>(DEF_COURSE)
  const [detailOpen, setDetailOpen] = useState(false)

  const [trajetDepart,  setTrajetDepart]  = useState('')
  const [trajetArrivee, setTrajetArrivee] = useState('')
  const [trajetLoading, setTrajetLoading] = useState(false)
  const [trajetError,   setTrajetError]   = useState<string | null>(null)
  const [trajetResult,  setTrajetResult]  = useState<TrajetResult | null>(null)

  const { companyId } = useProfile()
  const [profils, setProfils]               = useState<CostProfil[]>([])
  const [profilsLoading, setProfilsLoading] = useState(true)
  const [selectedId, setSelectedId]         = useState('')
  const [loadedId, setLoadedId]             = useState<string | null>(null)
  const [opBusy, setOpBusy]                 = useState(false)
  const [opMsg, setOpMsg]                   = useState<{ ok: boolean; text: string } | null>(null)
  const [newName, setNewName]               = useState<string | null>(null)
  const loadLockRef                         = useRef(false)

  useEffect(() => {
    try {
      const saved = localStorage.getItem('mca-renta')
      if (saved) {
        const s = JSON.parse(saved) as { params?: Params; recettes?: LineItem[]; depenses?: LineItem[] }
        if (s.params)   setParams(s.params)
        if (s.recettes) setRecettes(s.recettes)
        if (s.depenses) setDepenses(s.depenses)
      }
    } catch { /* première visite */ }
    setLoaded(true)
  }, [])

  useEffect(() => {
    if (!loaded) return
    const t = setTimeout(() => {
      try { localStorage.setItem('mca-renta', JSON.stringify({ params, recettes, depenses })) } catch { /* storage plein */ }
    }, 400)
    return () => clearTimeout(t)
  }, [params, recettes, depenses, loaded])

  useEffect(() => {
    setProfilsLoading(true)
    listProfils().then(({ data, error }) => {
      setProfilsLoading(false)
      if (error) {
        setOpMsg({ ok: false, text: `Chargement des profils : ${(error as { message: string }).message}` })
        return
      }
      setProfils((data ?? []) as CostProfil[])
    })
  }, [])

  useEffect(() => {
    if (!opMsg) return
    const t = setTimeout(() => setOpMsg(null), 5000)
    return () => clearTimeout(t)
  }, [opMsg])

  /* ── Gestion des profils ─────────────────────────────── */
  const hasData = recettes.length > 0 || depenses.length > 0 ||
    Object.values(params).some((v) => Number(v) !== 0)

  const refreshProfils = () =>
    listProfils().then(({ data }) => setProfils((data ?? []) as CostProfil[]))

  function doLoadProfil(p: CostProfil) {
    if (loadLockRef.current || opBusy) return
    if (hasData && !window.confirm(`Charger "${p.name}" remplacera votre saisie en cours. Continuer ?`)) return
    loadLockRef.current = true
    setParams(p.data.params as unknown as Params)
    setRecettes(p.data.recettes as unknown as LineItem[])
    setDepenses(p.data.depenses as unknown as LineItem[])
    setLoadedId(p.id)
    setSelectedId(p.id)
    setCourseForm(DEF_COURSE)
    setOpMsg({ ok: true, text: `Profil "${p.name}" chargé.` })
    requestAnimationFrame(() => { loadLockRef.current = false })
  }

  async function doSaveProfil() {
    if (!newName?.trim()) return
    if (!companyId) { setOpMsg({ ok: false, text: 'Session non initialisée — réessayez dans un instant.' }); return }
    setOpBusy(true)
    const data: ProfilData = { version: 1, params: params as unknown as Record<string, number | string>, recettes, depenses }
    const { data: created, error } = await createProfil(newName.trim(), data, companyId)
    setOpBusy(false)
    if (error || !created) {
      setOpMsg({ ok: false, text: `Erreur création : ${(error as { message: string })?.message ?? 'inconnue'}` })
      return
    }
    const c = created as unknown as CostProfil
    setNewName(null)
    await refreshProfils()
    setLoadedId(c.id)
    setSelectedId(c.id)
    setOpMsg({ ok: true, text: `Profil "${c.name}" enregistré.` })
  }

  async function doUpdateProfil() {
    if (!loadedId) return
    setOpBusy(true)
    const data: ProfilData = { version: 1, params: params as unknown as Record<string, number | string>, recettes, depenses }
    const { error } = await updateProfil(loadedId, data)
    setOpBusy(false)
    if (error) {
      setOpMsg({ ok: false, text: `Erreur mise à jour : ${(error as { message: string }).message}` })
      return
    }
    setOpMsg({ ok: true, text: 'Profil mis à jour.' })
  }

  async function doDeleteProfil() {
    const p = profils.find((x) => x.id === selectedId)
    if (!p || !window.confirm(`Supprimer le profil "${p.name}" ? Cette action est irréversible.`)) return
    setOpBusy(true)
    const { error } = await deleteProfil(p.id)
    setOpBusy(false)
    if (error) {
      setOpMsg({ ok: false, text: `Erreur suppression : ${(error as { message: string }).message}` })
      return
    }
    const nom = p.name
    if (loadedId === p.id) setLoadedId(null)
    setSelectedId('')
    await refreshProfils()
    setOpMsg({ ok: true, text: `Profil "${nom}" supprimé.` })
  }

  /* ── Calculs ─────────────────────────────────────────── */
  const r = useMemo(() => {
    const p  = (k: keyof Params): number => { const v = params[k]; return v === '' || v == null ? 0 : Number(v) }
    const mt = (x: number | string): number => (x === '' || x == null ? 0 : Number(x))

    const jours   = p('jours')
    const kmJour  = p('kmJour')
    const kmTotal = kmJour * jours
    const litresJour = (kmJour * p('conso')) / 100
    const litresMois = litresJour * jours
    const couts     = deriveCoutsUnitaires(params, depenses)
    const coutLitre = couts.coutLitreHT
    const carbJour  = litresJour * coutLitre
    const carbMois  = carbJour * jours

    const recParJour  = recettes.filter((x) => x.freq === 'parJour').reduce((s, x) => s + mt(x.montant), 0)
    const recAuKm     = recettes.filter((x) => x.freq === 'auKm').reduce((s, x) => s + mt(x.montant), 0)
    const recMensuel  = recettes.filter((x) => x.freq === 'mensuel').reduce((s, x) => s + mt(x.montant), 0)
    const rJour = recParJour + recAuKm * kmJour
    const Rfix  = recMensuel
    const CA    = rJour * jours + Rfix

    const depMensuel = depenses.filter((x) => x.freq === 'mensuel').reduce((s, x) => s + mt(x.montant), 0)
    const depParJour = depenses.filter((x) => x.freq === 'parJour').reduce((s, x) => s + mt(x.montant), 0)
    const depAuKm    = depenses.filter((x) => x.freq === 'auKm').reduce((s, x) => s + mt(x.montant), 0)
    const F       = depMensuel
    const vJour   = depParJour + depAuKm * kmJour + carbJour
    const chargesVar  = vJour * jours
    const chargesTot  = F + chargesVar

    const resultat  = CA - chargesTot
    const margeJour = rJour - vJour
    const tauxMCV   = rJour > 0 ? margeJour / rJour : 0

    const seuilJours    = margeJour > 0 ? (F - Rfix) / margeJour : Infinity
    const recJourNec    = vJour + (jours > 0 ? (F - Rfix) / jours : 0)
    const prixForfaitMin = recJourNec - recAuKm * kmJour

    const coutKm  = kmTotal > 0 ? chargesTot / kmTotal : 0
    const recKm   = kmTotal > 0 ? CA / kmTotal : 0
    const margeKm = recKm - coutKm

    const resAnnuel = resultat * 12
    let is = 0
    if (resAnnuel > 0) is = Math.min(resAnnuel, 42500) * 0.15 + Math.max(0, resAnnuel - 42500) * 0.25
    const netAnnuel = resAnnuel - is

    const maxJours = Math.max(31, Math.ceil(isFinite(seuilJours) ? seuilJours : 0) + 4, jours + 4)
    const cvp: { d: number; CA: number; Charges: number }[] = []
    for (let d = 0; d <= maxJours; d++) cvp.push({ d, CA: rJour * d + Rfix, Charges: F + vJour * d })

    const breakdown = [
      { name: 'Carburant', value: carbMois },
      ...depenses.map((x) => ({
        name: x.label || '—',
        value: x.freq === 'mensuel' ? mt(x.montant)
             : x.freq === 'parJour' ? mt(x.montant) * jours
             : mt(x.montant) * kmTotal,
      })),
    ].filter((x) => x.value > 0).sort((a, b) => b.value - a.value)

    /* Nouvelles métriques enrichies */
    const margeNettePct = CA > 0 ? resultat / CA : 0
    const topPoste      = breakdown.length > 0 ? breakdown[0].name : '—'

    /* Sensibilité */
    const tvaR       = p('tvaRecup') / 100
    const deltaLitre = (0.10 / 1.2) + (0.10 / 6) * (1 - tvaR)
    const sensiJour1      = margeJour
    const sensiGazole     = -(litresMois * deltaLitre)
    const sensiRecette1   = -rJour

    return {
      jours, kmTotal, litresMois, coutLitre, carbMois, CA, F, vJour, chargesVar, chargesTot,
      resultat, margeJour, tauxMCV, seuilJours, recJourNec, prixForfaitMin, rJour, Rfix,
      coutKm, recKm, margeKm, resAnnuel, is, netAnnuel, cvp, breakdown, maxJours,
      partCarb: CA > 0 ? carbMois / CA : 0,
      margeNettePct, topPoste,
      sensiJour1, sensiGazole, sensiRecette1,
      couts,
    }
  }, [params, recettes, depenses])

  const nv = (v: number | string): number => (v === '' || v == null ? 0 : Number(v))
  const courseReady =
    nv(courseForm.prixPropose) > 0 &&
    nv(courseForm.distanceCharge) > 0 &&
    nv(courseForm.dureeH) > 0

  const courseResult = useMemo(() => {
    if (!courseReady) return null
    return simulateCourse({
      prixPropose:    nv(courseForm.prixPropose),
      distanceCharge: nv(courseForm.distanceCharge),
      dureeH:         nv(courseForm.dureeH),
      kilometresVide: nv(courseForm.kilometresVide),
      peages:         nv(courseForm.peages),
      attenteH:       nv(courseForm.attenteH),
      nbPoints:       nv(courseForm.nbPoints),
      margeCible:     nv(courseForm.margeCible) / 100,
    }, r.couts)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseForm, r.couts])

  /* ── Dérivées présentation ───────────────────────────── */
  const positive   = r.resultat >= 0
  const seuilTxt   = isFinite(r.seuilJours) ? `${num(r.seuilJours, 1)} j` : '∞'
  const seuilPct   = isFinite(r.seuilJours) && r.seuilJours > 0
    ? Math.min(100, (r.jours / r.seuilJours) * 100) : (r.jours > 0 ? 100 : 0)

  const courseVerdictInfo = courseResult
    ? courseResult.verdict === 'rentable'
      ? { textCls: 'text-[var(--profit)]', badge: 'success' as const, emoji: '✅', label: 'RENTABLE' }
      : courseResult.verdict === 'limite'
      ? { textCls: 'text-[var(--warn)]',   badge: 'warning' as const, emoji: '⚠️', label: 'LIMITE'   }
      : { textCls: 'text-[var(--loss)]',   badge: 'danger'  as const, emoji: '❌', label: 'À REFUSER'}
    : null

  const reset = () => {
    setParams({ jours: 0, gazoleTTC: 0, tvaRecup: 0, conso: 0, kmJour: 0 })
    setRecettes([])
    setDepenses([])
    setCourseForm(DEF_COURSE)
    setDetailOpen(false)
    setLoadedId(null)
    setSelectedId('')
    setNewName(null)
    setTrajetDepart('')
    setTrajetArrivee('')
    setTrajetError(null)
    setTrajetResult(null)
  }

  async function calculerTrajet() {
    if (!trajetDepart.trim() || !trajetArrivee.trim()) return
    setTrajetLoading(true)
    setTrajetError(null)
    setTrajetResult(null)

    const { data, error } = await supabase.functions.invoke('route-calc', {
      body: { depart: trajetDepart.trim(), arrivee: trajetArrivee.trim() },
    })

    setTrajetLoading(false)

    if (error || !data?.ok) {
      setTrajetError(data?.error ?? error?.message ?? 'Erreur de calcul.')
      return
    }

    const d = data.data as TrajetResult
    setTrajetResult(d)
    setCourseForm((f) => ({
      ...f,
      distanceCharge: Math.round(d.distance_km),
      dureeH:         Math.round((d.duree_min / 60) * 10) / 10,
    }))
  }

  /* ── Rendu ───────────────────────────────────────────── */
  return (
    <div className="space-y-5 min-w-0">

      {/* ── 1. Bandeau profils + verdict ───────────────────── */}
      <div className="glass rounded-[var(--r-xl)] px-4 py-3 flex flex-col gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[var(--fs-xs)] font-semibold uppercase tracking-widest text-[var(--text-muted)] shrink-0">Profil</span>

          {profilsLoading ? (
            <span className="text-[var(--fs-xs)] text-[var(--text-disabled)]">Chargement…</span>
          ) : (
            <>
              <select
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                disabled={opBusy}
                className="text-[var(--fs-sm)] rounded-[var(--r-md)] px-2 py-1.5 outline-none border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text)]"
                style={{ minWidth: 120, maxWidth: 220 }}
              >
                <option value="">— aucun —</option>
                {profils.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}{p.id === loadedId ? ' ✓' : ''}
                  </option>
                ))}
              </select>

              {selectedId && selectedId !== loadedId && (
                <button
                  onClick={() => { const p = profils.find((x) => x.id === selectedId); if (p) doLoadProfil(p) }}
                  disabled={opBusy}
                  className="flex items-center gap-1 text-[var(--fs-xs)] px-2.5 py-1.5 rounded-[var(--r-md)] transition-colors text-[var(--profit)] border border-[var(--border)]"
                  style={{ background: 'var(--profit-soft)' }}
                >
                  <FolderOpen size={13} /> Charger
                </button>
              )}

              {loadedId && (
                <button
                  onClick={doUpdateProfil}
                  disabled={opBusy}
                  className="flex items-center gap-1 text-[var(--fs-xs)] px-2.5 py-1.5 rounded-[var(--r-md)] transition-colors text-[var(--text-muted)] border border-[var(--border)] bg-[var(--bg-deep)]"
                >
                  <RefreshCw size={13} /> Mettre à jour
                </button>
              )}

              {selectedId && (
                <button
                  onClick={doDeleteProfil}
                  disabled={opBusy}
                  className="flex items-center gap-1 text-[var(--fs-xs)] px-2.5 py-1.5 rounded-[var(--r-md)] transition-colors text-[var(--loss)] border border-[var(--border)]"
                  style={{ background: 'var(--loss-soft)' }}
                >
                  <Trash2 size={13} /> Supprimer
                </button>
              )}
            </>
          )}

          {newName === null && (
            <button
              onClick={() => setNewName('')}
              disabled={opBusy}
              className="flex items-center gap-1 text-[var(--fs-xs)] px-2.5 py-1.5 rounded-[var(--r-md)] transition-colors text-[var(--text-muted)] border border-[var(--border)] bg-[var(--bg-deep)]"
            >
              <Save size={13} /> Enregistrer…
            </button>
          )}

          {/* Verdict badge + reset — alignés à droite */}
          <div className="ml-auto flex items-center gap-3 shrink-0 flex-wrap">
            <Badge color={positive ? 'success' : 'danger'}>
              {positive
                ? `Bénéficiaire · +${eur0(r.resultat)}/mois`
                : `Déficitaire · ${eur0(r.resultat)}/mois`}
            </Badge>
            <button
              onClick={reset}
              className="flex items-center gap-1.5 text-[var(--fs-xs)] px-3 py-1.5 rounded-[var(--r-md)] transition-colors text-[var(--text-muted)] border border-[var(--border)] hover:border-[var(--border-strong)]"
            >
              <RotateCcw size={12} /> Réinitialiser
            </button>
          </div>
        </div>

        {/* Champ nom nouveau profil */}
        {newName !== null && (
          <div className="flex items-center gap-2 flex-wrap">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') doSaveProfil(); if (e.key === 'Escape') setNewName(null) }}
              placeholder="Nom du profil"
              className="text-[var(--fs-sm)] px-3 py-1.5 rounded-[var(--r-md)] outline-none border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text)]"
              style={{ minWidth: 180 }}
            />
            <button
              onClick={doSaveProfil}
              disabled={opBusy || !newName.trim()}
              className="text-[var(--fs-xs)] px-2.5 py-1.5 rounded-[var(--r-md)] text-[var(--profit)] border border-[var(--border)] disabled:opacity-40"
              style={{ background: 'var(--profit-soft)' }}
            >
              Créer
            </button>
            <button
              onClick={() => setNewName(null)}
              className="p-1.5 rounded-[var(--r-md)] text-[var(--text-muted)] border border-[var(--border)] bg-[var(--bg-deep)]"
            >
              <X size={13} />
            </button>
          </div>
        )}

        {opMsg && (
          <p className={`text-[var(--fs-xs)] ${opMsg.ok ? 'text-[var(--profit)]' : 'text-[var(--loss)]'}`}>
            {opMsg.text}
          </p>
        )}
      </div>

      {/* ── 2. 6 KpiCards ──────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 [&>*]:min-w-0">
        <KpiCard label="CA mensuel"     value={eur0(r.CA)}        sub={`${eur0(r.rJour)}/jour`}          tone="success" icon={<Euro size={18}/>} />
        <KpiCard label="Charges"        value={eur0(r.chargesTot)} sub={`fixes ${eur0(r.F)}`}            tone="danger"  icon={<TrendingDown size={18}/>} />
        <KpiCard label="Résultat/mois"  value={eur0(r.resultat)}  sub={pct1(r.margeNettePct)}            tone={positive ? 'success' : 'danger'} icon={<TrendingUp size={18}/>} />
        <KpiCard label="Marge/jour"     value={eur0(r.margeJour)} sub={`MCV ${pct1(r.tauxMCV)}`}        tone={r.margeJour >= 0 ? 'success' : 'danger'} icon={<Percent size={18}/>} />
        <KpiCard label="Point mort"     value={seuilTxt}           sub={`/ ${num(r.jours)} jours`}       tone="warning" icon={<Target size={18}/>} />
        <KpiCard label="Coût / km"      value={eur2(r.coutKm)}    sub={`rec. ${eur2(r.recKm)}/km`}      tone="info"    icon={<Gauge size={18}/>} />
      </div>

      {/* ── 3. Deux colonnes ───────────────────────────────── */}
      <div className="grid lg:grid-cols-[1.6fr_1fr] gap-5 items-start [&>*]:min-w-0">

        {/* ── Colonne gauche : saisie ─────────────────────── */}
        <div className="flex flex-col gap-5">

          {/* 01 Paramètres */}
          <section className="glass rounded-[var(--r-xl)] p-5">
            <div className="flex items-center gap-2 mb-4">
              <span className="font-mono text-[var(--fs-xs)] px-1.5 py-0.5 rounded-[var(--r-sm)] bg-[var(--bg-deep)] text-[var(--text-disabled)]">01</span>
              <h2 className="font-semibold text-[var(--text)]">Paramètres d'exploitation</h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Field label="Jours travaillés / mois" value={params.jours}      onChange={(v) => setParams({ ...params, jours: v })} />
              <Field label="Km / jour"   suffix="km"      value={params.kmJour}     onChange={(v) => setParams({ ...params, kmJour: v })}    step={10} />
              <Field label="Consommation" suffix="L/100"  value={params.conso}      onChange={(v) => setParams({ ...params, conso: v })}     step={0.5} />
              <Field label="Prix gazole" suffix="€/L TTC" value={params.gazoleTTC}  onChange={(v) => setParams({ ...params, gazoleTTC: v })} step={0.01} />
              <Field label="TVA récupérable" suffix="%"   value={params.tvaRecup}   onChange={(v) => setParams({ ...params, tvaRecup: v })}  step={10} />
            </div>
            <div className="mt-4 flex items-center gap-2 text-[var(--fs-xs)] rounded-[var(--r-md)] px-3 py-2 bg-[var(--bg-deep)] text-[var(--text-muted)]">
              <Fuel size={14} className="text-[var(--gold)] shrink-0" />
              <span>
                {num(r.litresMois, 0)} L/mois · coût réel{' '}
                <b className="font-mono">{eur2(r.coutLitre)}/L HT</b> · carburant{' '}
                <b className="font-mono">{eur0(r.carbMois)}/mois</b> ({num(r.partCarb * 100, 0)} % du CA)
              </span>
            </div>
          </section>

          {/* 02 Recettes */}
          <section className="glass rounded-[var(--r-xl)] p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[var(--fs-xs)] px-1.5 py-0.5 rounded-[var(--r-sm)] bg-[var(--bg-deep)] text-[var(--text-disabled)]">02</span>
                <h2 className="font-semibold text-[var(--text)]">Recettes</h2>
              </div>
              <button
                onClick={() => setRecettes([...recettes, { id: uid(), label: 'Nouvelle recette', freq: 'parJour', montant: 0 }])}
                className="flex items-center gap-1 text-[var(--fs-xs)] font-medium px-2.5 py-1.5 rounded-[var(--r-md)] text-[var(--profit)] border border-[var(--border)]"
                style={{ background: 'var(--profit-soft)' }}
              >
                <Plus size={13} /> Ajouter
              </button>
            </div>
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-12 gap-2 text-[10px] uppercase tracking-wide px-1 text-[var(--text-disabled)]">
                <span className="col-span-5">Libellé</span>
                <span className="col-span-3">Fréquence</span>
                <span className="col-span-3 text-right">Montant HT</span>
                <span className="col-span-1" />
              </div>
              {recettes.map((it) => (
                <Row key={it.id} item={it} isIncome
                  onChange={(n) => setRecettes(recettes.map((x) => (x.id === it.id ? n : x)))}
                  onDelete={() => setRecettes(recettes.filter((x) => x.id !== it.id))}
                />
              ))}
              {recettes.length === 0 && (
                <p className="text-[var(--fs-xs)] py-2 text-[var(--text-disabled)]">Ajoute une recette pour démarrer.</p>
              )}
            </div>
          </section>

          {/* 03 Dépenses */}
          <section className="glass rounded-[var(--r-xl)] p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[var(--fs-xs)] px-1.5 py-0.5 rounded-[var(--r-sm)] bg-[var(--bg-deep)] text-[var(--text-disabled)]">03</span>
                <h2 className="font-semibold text-[var(--text)]">Dépenses</h2>
              </div>
              <button
                onClick={() => setDepenses([...depenses, { id: uid(), label: 'Nouvelle dépense', freq: 'mensuel', montant: 0 }])}
                className="flex items-center gap-1 text-[var(--fs-xs)] font-medium px-2.5 py-1.5 rounded-[var(--r-md)] text-[var(--loss)] border border-[var(--border)]"
                style={{ background: 'var(--loss-soft)' }}
              >
                <Plus size={13} /> Ajouter
              </button>
            </div>
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-12 gap-2 text-[10px] uppercase tracking-wide px-1 text-[var(--text-disabled)]">
                <span className="col-span-5">Libellé</span>
                <span className="col-span-3">Fréquence</span>
                <span className="col-span-3 text-right">Montant HT</span>
                <span className="col-span-1" />
              </div>
              <div className="grid grid-cols-12 gap-2 items-center py-1.5 rounded-[var(--r-md)] px-1 bg-[var(--bg-deep)]">
                <span className="col-span-8 text-[var(--fs-sm)] flex items-center gap-1.5 text-[var(--text-muted)]">
                  <Fuel size={13} className="text-[var(--gold)]" /> Carburant (calculé auto)
                </span>
                <span className="col-span-3 font-mono text-[var(--fs-sm)] text-right text-[var(--loss)]">{eur2(r.carbMois)}</span>
                <span className="col-span-1" />
              </div>
              {depenses.map((it) => (
                <Row key={it.id} item={it}
                  onChange={(n) => setDepenses(depenses.map((x) => (x.id === it.id ? n : x)))}
                  onDelete={() => setDepenses(depenses.filter((x) => x.id !== it.id))}
                />
              ))}
            </div>
          </section>

          {/* Sensibilité */}
          <div className="glass rounded-[var(--r-xl)] p-5">
            <h3 className="text-[var(--fs-xs)] font-semibold uppercase tracking-widest text-[var(--text-muted)] mb-1">Sensibilité</h3>
            <p className="text-[var(--fs-xs)] text-[var(--text-disabled)] mb-3">Impact d'une variation unitaire sur le résultat mensuel</p>
            {[
              { label: '+1 jour travaillé',  delta: r.sensiJour1    },
              { label: 'Gazole +0,10 €/L',   delta: r.sensiGazole   },
              { label: '−1 jour facturé',    delta: r.sensiRecette1 },
            ].map(({ label, delta }) => (
              <div key={label} className="flex items-center justify-between py-2.5 border-b border-[var(--border)] last:border-0">
                <span className="text-[var(--fs-sm)] text-[var(--text-muted)]">{label}</span>
                <span className={`font-mono text-[var(--fs-sm)] font-semibold ${delta >= 0 ? 'text-[var(--profit)]' : 'text-[var(--loss)]'}`}>
                  {delta >= 0 ? '+' : ''}{eur0(delta)}/mois
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Colonne droite : analyse (sticky) ──────────── */}
        <div className="flex flex-col gap-5 lg:sticky lg:top-4">

          {/* Seuil de rentabilité */}
          <div className="glass rounded-[var(--r-xl)] p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-[var(--text)]">Seuil de rentabilité</h3>
              <span className="text-[var(--fs-xs)] font-mono text-[var(--gold)]">point mort</span>
            </div>
            <div className="flex items-baseline gap-2 mb-3">
              <span className="font-mono font-bold text-4xl text-[var(--text)]">{seuilTxt}</span>
              <span className="text-[var(--fs-xs)] text-[var(--text-muted)]">/ {num(r.jours)} jours</span>
            </div>
            <div className="h-2 rounded-full overflow-hidden mb-2" style={{ background: 'var(--bg-deep)' }}>
              <div className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.min(100, seuilPct)}%`,
                  background: positive ? 'var(--profit)' : 'var(--loss)',
                }}
              />
            </div>
            <p className="text-[var(--fs-xs)] text-[var(--text-muted)]">
              {positive
                ? `Seuil atteint — tu dégages ${eur0(r.resultat)}/mois.`
                : isFinite(r.seuilJours)
                  ? `${num(r.seuilJours, 1)} j pour équilibrer — soit ${eur0(r.recJourNec)}/jour à ${num(r.jours)} j.`
                  : `La recette/jour ne couvre pas le coût variable.`}
            </p>
            <div className="grid grid-cols-2 gap-3 mt-4">
              <div className="rounded-[var(--r-md)] p-2.5 bg-[var(--bg-deep)]">
                <div className="text-[10px] uppercase text-[var(--text-disabled)] mb-0.5">Recette/jour mini</div>
                <div className="font-mono text-[var(--fs-sm)] text-[var(--text)]">{eur0(r.recJourNec)}</div>
              </div>
              <div className="rounded-[var(--r-md)] p-2.5 bg-[var(--bg-deep)]">
                <div className="text-[10px] uppercase text-[var(--text-disabled)] mb-0.5">Forfait/jour mini</div>
                <div className="font-mono text-[var(--fs-sm)] text-[var(--text)]">{eur0(r.prixForfaitMin)}</div>
              </div>
            </div>
          </div>

          {/* CA vs charges (CVP) */}
          <div className="glass rounded-[var(--r-xl)] p-5">
            <h3 className="font-semibold text-[var(--fs-sm)] text-[var(--text)] mb-3">CA vs charges selon les jours travaillés</h3>
            <ResponsiveContainer width="100%" height={180}>
              <ReLineChart data={r.cvp} margin={{ top: 5, right: 8, left: -8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="d" tick={{ fontSize: 10, fill: 'var(--text-disabled)' }} tickLine={false} />
                <YAxis
                  tick={{ fontSize: 10, fill: 'var(--text-disabled)' }}
                  tickFormatter={(v: number) => `${Math.round(v / 1000)}k`}
                  tickLine={false} axisLine={false} width={36}
                />
                <Tooltip
                  formatter={(v: unknown) => eur0(Number(v))}
                  labelFormatter={(l: unknown) => `${l} jours`}
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text)' }}
                />
                <Line type="monotone" dataKey="CA"      stroke="var(--profit)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="Charges" stroke="var(--loss)"   strokeWidth={2} dot={false} />
                <ReferenceLine x={r.jours} stroke="var(--text-muted)" strokeDasharray="4 4" />
                {isFinite(r.seuilJours) && r.seuilJours <= r.maxJours && (
                  <ReferenceDot
                    x={Math.round(r.seuilJours)}
                    y={r.rJour * r.seuilJours + r.Rfix}
                    r={5} fill="var(--gold)" stroke="var(--bg)" strokeWidth={2}
                  />
                )}
              </ReLineChart>
            </ResponsiveContainer>
            <div className="flex items-center gap-4 text-[var(--fs-xs)] mt-2 text-[var(--text-muted)]">
              <span className="flex items-center gap-1.5">
                <i className="w-3 h-0.5 inline-block rounded-full" style={{ background: 'var(--profit)' }} /> Recettes
              </span>
              <span className="flex items-center gap-1.5">
                <i className="w-3 h-0.5 inline-block rounded-full" style={{ background: 'var(--loss)' }} /> Charges
              </span>
              <span className="flex items-center gap-1.5">
                <i className="w-2 h-2 rounded-full inline-block" style={{ background: 'var(--gold)' }} /> Point mort
              </span>
            </div>
          </div>

          {/* Répartition des charges */}
          <div className="glass rounded-[var(--r-xl)] p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-[var(--fs-sm)] text-[var(--text)]">Répartition des charges / mois</h3>
              {r.topPoste && (
                <span className="text-[var(--fs-xs)] text-[var(--warning)] font-medium">↑ {r.topPoste}</span>
              )}
            </div>
            <div className="flex flex-col gap-3">
              {r.breakdown.slice(0, 9).map((item, i) => {
                const pct = r.chargesTot > 0 ? Math.min(100, (item.value / r.chargesTot) * 100) : 0
                const isTop = i === 0
                return (
                  <div key={i}>
                    <div className="flex justify-between text-[var(--fs-xs)] mb-1">
                      <span className={isTop ? 'font-semibold text-[var(--warning)]' : 'text-[var(--text-muted)]'}>
                        {item.name}
                      </span>
                      <span className="font-mono text-[var(--text)]">{eur0(item.value)}</span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-deep)' }}>
                      <div className="h-full rounded-full transition-[width] duration-500"
                        style={{
                          width: `${pct}%`,
                          background: isTop ? 'var(--warning)' : 'var(--text-disabled)',
                        }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Projection annuelle */}
          <div className="glass rounded-[var(--r-xl)] p-5">
            <h3 className="font-semibold text-[var(--fs-sm)] text-[var(--text)] mb-3">Projection annuelle</h3>
            <div className="flex flex-col gap-2 text-[var(--fs-sm)]">
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Résultat avant IS</span>
                <span className="font-mono" style={{ color: positive ? 'var(--profit)' : 'var(--loss)' }}>{eur0(r.resAnnuel)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">IS estimé (15 % / 25 %)</span>
                <span className="font-mono text-[var(--text-muted)]">{eur0(r.is)}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-[var(--border)]">
                <span className="font-semibold text-[var(--text)]">Résultat net annuel</span>
                <span className="font-mono font-semibold" style={{ color: r.netAnnuel >= 0 ? 'var(--profit)' : 'var(--loss)' }}>
                  {eur0(r.netAnnuel)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Reste réel / mois après IS</span>
                <span className="font-mono font-semibold" style={{ color: r.netAnnuel >= 0 ? 'var(--profit)' : 'var(--loss)' }}>
                  {eur0(r.netAnnuel / 12)}
                </span>
              </div>
            </div>
          </div>

          <p className="text-[10px] leading-relaxed text-[var(--text-disabled)] px-1">
            Montants en HT. TVA récupérable à 100 % sur le gazole (VUL). Estimation indicative — ne remplace pas ta compta Pennylane.
            Scénarios sauvegardés automatiquement.
          </p>
        </div>
      </div>

      {/* ── 4. Simulateur de course ─────────────────────────── */}
      <div className="glass rounded-[var(--r-xl)] overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--border)]">
          <h2 className="font-semibold text-[var(--text)]">Simulateur de course (go / no-go)</h2>
          <p className="text-[var(--fs-xs)] text-[var(--text-muted)] mt-0.5">
            Calcule si une course est rentable · coûts issus des hypothèses ci-dessus, mis à jour en direct
          </p>
        </div>

        <div className="p-5 space-y-4">

          {/* Trajet A→B */}
          <div className="rounded-[var(--r-xl)] overflow-hidden border border-[var(--border)]">
            <div className="px-4 py-3 flex items-center gap-2 bg-[var(--bg-deep)] border-b border-[var(--border)]">
              <MapPin size={13} className="text-[var(--text-muted)]" />
              <span className="text-[var(--fs-sm)] font-medium text-[var(--text)]">Calcul de trajet A → B</span>
              <span className="text-[10px] ml-auto text-[var(--text-disabled)]">IGN Géoplateforme · auto-injecté</span>
            </div>
            <div className="px-4 py-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-[var(--fs-xs)] uppercase tracking-wide text-[var(--text-muted)]">Départ</span>
                  <input
                    type="text" value={trajetDepart}
                    onChange={(e) => setTrajetDepart(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && calculerTrajet()}
                    placeholder="Ex. Strasbourg"
                    className="px-3 py-2 text-[var(--fs-sm)] rounded-[var(--r-md)] outline-none border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text)] placeholder:text-[var(--text-disabled)]"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[var(--fs-xs)] uppercase tracking-wide text-[var(--text-muted)]">Arrivée</span>
                  <input
                    type="text" value={trajetArrivee}
                    onChange={(e) => setTrajetArrivee(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && calculerTrajet()}
                    placeholder="Ex. Colmar"
                    className="px-3 py-2 text-[var(--fs-sm)] rounded-[var(--r-md)] outline-none border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text)] placeholder:text-[var(--text-disabled)]"
                  />
                </label>
              </div>

              <button
                onClick={calculerTrajet}
                disabled={trajetLoading || !trajetDepart.trim() || !trajetArrivee.trim()}
                className="flex items-center gap-2 text-[var(--fs-sm)] px-4 py-2 rounded-[var(--r-md)] font-medium border border-[var(--border)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-[var(--brand-soft)] text-[var(--brand)] hover:bg-[var(--brand)] hover:text-white"
              >
                {trajetLoading ? <RefreshCw size={14} className="animate-spin" /> : <Navigation size={14} />}
                {trajetLoading ? 'Calcul en cours…' : 'Calculer le trajet'}
              </button>

              {trajetError && (
                <p className="text-[var(--fs-xs)] px-3 py-2 rounded-[var(--r-md)] text-[var(--loss)]" style={{ background: 'var(--loss-soft)' }}>
                  {trajetError}
                </p>
              )}

              {trajetResult && (
                <>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[var(--fs-sm)] py-1">
                    <span className="text-[var(--text-muted)]">
                      Distance : <b className="font-mono text-[var(--text)]">{trajetResult.distance_km} km</b>
                    </span>
                    <span className="text-[var(--text-muted)]">
                      Durée : <b className="font-mono text-[var(--text)]">{trajetResult.duree_min} min</b>
                    </span>
                  </div>
                  <p className="text-[10px] text-[var(--text-disabled)]">
                    Résultats injectés dans le simulateur — modifiables manuellement
                  </p>
                  <TrajetMap
                    geometry={trajetResult.geometry}
                    departCoords={trajetResult.depart_coords}
                    arriveeCoords={trajetResult.arrivee_coords}
                  />
                </>
              )}
            </div>
          </div>

          {/* Coûts unitaires courants */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <RateChip icon={Fuel}             label="Carburant" value={`${eur2(r.couts.coutCarburantKm)}/km`} />
            <RateChip icon={Wrench}           label="Usure km"  value={`${eur2(r.couts.coutUsureKm)}/km`} />
            <RateChip icon={Clock}            label="Temps"     value={`${eur0(r.couts.coutTempsHeure)}/h`} />
            <RateChip icon={CircleDollarSign} label="Gazole HT" value={`${eur2(r.couts.coutLitreHT)}/L`} />
          </div>

          {/* Champs obligatoires */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Prix proposé HT *" suffix="€" value={courseForm.prixPropose}
              onChange={(v) => setCourseForm((f) => ({ ...f, prixPropose: v as number | '' }))} step={5} />
            <Field label="Distance en charge *" suffix="km" value={courseForm.distanceCharge}
              onChange={(v) => setCourseForm((f) => ({ ...f, distanceCharge: v as number | '' }))} step={10} />
            <Field label="Durée estimée *" suffix="h" value={courseForm.dureeH}
              onChange={(v) => setCourseForm((f) => ({ ...f, dureeH: v as number | '' }))} step={0.5} />
          </div>

          {/* Champs optionnels */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Field label="Trajet à vide" suffix="km" value={courseForm.kilometresVide}
              onChange={(v) => setCourseForm((f) => ({ ...f, kilometresVide: v as number | '' }))} step={5} />
            <Field label="Péages" suffix="€" value={courseForm.peages}
              onChange={(v) => setCourseForm((f) => ({ ...f, peages: v as number | '' }))} step={1} />
            <Field label="Attente" suffix="h" value={courseForm.attenteH}
              onChange={(v) => setCourseForm((f) => ({ ...f, attenteH: v as number | '' }))} step={0.25} />
            <Field label="Marge cible" suffix="%" value={courseForm.margeCible}
              onChange={(v) => setCourseForm((f) => ({ ...f, margeCible: v as number | '' }))} step={5} min={0} />
          </div>

          {/* Verdict */}
          {!courseReady ? (
            <div className="rounded-[var(--r-xl)] p-4 text-center bg-[var(--bg-deep)]">
              <p className="text-[var(--fs-sm)] text-[var(--text-muted)]">
                Remplissez le prix proposé, la distance et la durée <span className="text-[var(--loss)]">*</span> pour obtenir le verdict.
              </p>
            </div>
          ) : courseResult && courseVerdictInfo && (
            <div className="flex flex-col gap-3">

              {/* Verdict principal */}
              <div className="rounded-[var(--r-xl)] p-4 border border-[var(--border)]"
                style={{ background: `var(--${courseVerdictInfo.badge === 'success' ? 'profit' : courseVerdictInfo.badge === 'warning' ? 'warn' : 'loss'}-soft)` }}>
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-xl">{courseVerdictInfo.emoji}</span>
                  <span className={`font-bold text-lg ${courseVerdictInfo.textCls}`}>{courseVerdictInfo.label}</span>
                  <span className={`ml-auto font-mono font-semibold text-lg ${courseVerdictInfo.textCls}`}>
                    {eur0(courseResult.margeNette)}
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-[var(--fs-sm)]">
                  <span className="text-[var(--text-muted)]">
                    Marge : <b className={`font-mono ${courseVerdictInfo.textCls}`}>{pct1(courseResult.margePct)}</b>
                  </span>
                  <span className="text-[var(--text-muted)]">
                    Prix plancher : <b className="font-mono text-[var(--text)]">{eur0(courseResult.prixPlancher)}</b>
                  </span>
                  <span className="text-[var(--text-muted)]">
                    Prix cible ({nv(courseForm.margeCible)} %) : <b className="font-mono text-[var(--profit)]">{eur0(courseResult.prixCible)}</b>
                  </span>
                </div>
              </div>

              {/* KPIs secondaires */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Prix / h',   value: eur0(courseResult.prixH),   positive: null },
                  { label: 'Marge / h',  value: eur0(courseResult.margeH),  positive: courseResult.margeH  >= 0 },
                  { label: 'Prix / km',  value: eur2(courseResult.prixKm),  positive: null },
                  { label: 'Marge / km', value: eur2(courseResult.margeKm), positive: courseResult.margeKm >= 0 },
                ].map((k) => (
                  <div key={k.label} className="rounded-[var(--r-xl)] p-3 bg-[var(--bg-deep)] border border-[var(--border)]">
                    <div className="text-[10px] uppercase tracking-wide mb-1 text-[var(--text-muted)]">{k.label}</div>
                    <div className="font-mono font-semibold text-base leading-tight"
                      style={{ color: k.positive === null ? 'var(--text)' : k.positive ? 'var(--profit)' : 'var(--loss)' }}>
                      {k.value}
                    </div>
                  </div>
                ))}
              </div>

              {/* Détail des coûts — repliable */}
              <div className="rounded-[var(--r-xl)] overflow-hidden border border-[var(--border)]">
                <button
                  onClick={() => setDetailOpen((o) => !o)}
                  className="w-full flex items-center justify-between px-4 py-3 text-[var(--fs-sm)] font-medium transition-colors bg-[var(--bg-deep)] text-[var(--text-muted)] hover:text-[var(--text)]"
                >
                  <span>Détail des coûts</span>
                  {detailOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                </button>
                {detailOpen && (
                  <div className="px-4 py-3 flex flex-col gap-2 text-[var(--fs-sm)]">
                    {[
                      { label: 'Carburant',  v: courseResult.coutCarburant, note: `${courseResult.kmTotal} km × ${eur2(r.couts.coutCarburantKm)}/km` },
                      { label: 'Usure / km', v: courseResult.coutUsure,     note: `${courseResult.kmTotal} km × ${eur2(r.couts.coutUsureKm)}/km` },
                      { label: 'Temps',      v: courseResult.coutTemps,     note: `${courseResult.heuresTotales.toFixed(1)} h × ${eur0(r.couts.coutTempsHeure)}/h` },
                      { label: 'Péages',     v: courseResult.coutPeages,    note: undefined },
                    ].map((row) => (
                      <div key={row.label} className="flex items-center justify-between gap-4">
                        <div>
                          <span className="text-[var(--text)]">{row.label}</span>
                          {row.note && <span className="ml-2 text-[10px] text-[var(--text-disabled)]">{row.note}</span>}
                        </div>
                        <span className="font-mono text-[var(--text-muted)]">{eur0(row.v)}</span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between pt-2 font-semibold border-t border-[var(--border)]">
                      <span className="text-[var(--text)]">Coût total</span>
                      <span className="font-mono text-[var(--text)]">{eur0(courseResult.coutTotal)}</span>
                    </div>
                  </div>
                )}
              </div>

              <p className="text-[10px] text-[var(--text-disabled)]">
                km total : {courseResult.kmTotal} · durée totale : {courseResult.heuresTotales.toFixed(1)} h · {nv(courseForm.nbPoints)} point(s)
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
