import { useState, useEffect, useMemo } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, ReferenceDot, BarChart, Bar, Cell,
} from 'recharts'
import { Plus, Trash2, RotateCcw, Fuel, ArrowDownRight, ArrowUpRight, ChevronDown, ChevronUp, Clock, Wrench, CircleDollarSign } from 'lucide-react'
import { deriveCoutsUnitaires, simulateCourse } from './rentabilite.logic'

/* Tokens couleur propres au calculateur */
const C = {
  ink:       '#0B1F3A',
  navy:      '#13294B',
  steel:     '#1E3A5F',
  amber:     '#F59E0B',
  profit:    '#15803D',
  profitBg:  '#DCFCE7',
  warn:      '#B45309',
  warnBg:    '#FEF3C7',
  loss:      '#DC2626',
  lossBg:    '#FEE2E2',
  bg:        '#EEF2F7',
  card:      '#FFFFFF',
  border:    '#DDE4ED',
  muted:     '#64748B',
  faint:     '#94A3B8',
} as const

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

/* --- Sub-components --- */

function Field({ label, suffix, value, onChange, step = 1, min = 0 }: {
  label: string; suffix?: string; value: number | string
  onChange: (v: number | string) => void; step?: number; min?: number
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wide" style={{ color: C.muted }}>{label}</span>
      <div className="flex items-center rounded-lg overflow-hidden" style={{ border: `1px solid ${C.border}`, background: '#fff' }}>
        <input
          type="number" step={step} min={min} value={value}
          onChange={(e) => onChange(e.target.value === '' ? '' : parseFloat(e.target.value))}
          className="font-mono w-full px-3 py-2 text-sm outline-none bg-transparent"
          style={{ color: C.ink }}
        />
        {suffix && <span className="font-mono text-xs px-2 select-none" style={{ color: C.faint }}>{suffix}</span>}
      </div>
    </label>
  )
}

function Row({ item, onChange, onDelete, color }: {
  item: LineItem; onChange: (item: LineItem) => void; onDelete: () => void; color: string
}) {
  return (
    <div className="grid grid-cols-12 gap-2 items-center">
      <input
        value={item.label}
        onChange={(e) => onChange({ ...item, label: e.target.value })}
        className="col-span-5 px-2 py-1.5 text-sm rounded-md outline-none"
        style={{ border: `1px solid ${C.border}`, color: C.ink }}
      />
      <select
        value={item.freq}
        onChange={(e) => onChange({ ...item, freq: e.target.value as Freq })}
        className="col-span-3 px-1.5 py-1.5 text-xs rounded-md outline-none"
        style={{ border: `1px solid ${C.border}`, color: C.muted, background: '#fff' }}
      >
        <option value="mensuel">/ mois</option>
        <option value="parJour">/ jour</option>
        <option value="auKm">/ km</option>
      </select>
      <div className="col-span-3 flex items-center rounded-md overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
        <input
          type="number" step="0.01" value={item.montant}
          onChange={(e) => onChange({ ...item, montant: e.target.value === '' ? '' : parseFloat(e.target.value) })}
          className="font-mono w-full px-2 py-1.5 text-sm outline-none text-right"
          style={{ color }}
        />
        <span className="text-[10px] px-1.5" style={{ color: C.faint }}>€</span>
      </div>
      <button onClick={onDelete} className="col-span-1 flex justify-center opacity-50 hover:opacity-100 transition-opacity">
        <Trash2 size={15} style={{ color: C.loss }} />
      </button>
    </div>
  )
}

function Kpi({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="rounded-xl p-3" style={{ background: C.card, border: `1px solid ${C.border}` }}>
      <div className="text-[10px] uppercase tracking-wide mb-1" style={{ color: C.muted }}>{label}</div>
      <div className="font-mono font-semibold text-lg leading-tight" style={{ color: accent ?? C.ink }}>{value}</div>
      {sub && <div className="text-[11px] mt-0.5" style={{ color: C.faint }}>{sub}</div>}
    </div>
  )
}

function RateChip({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs" style={{ background: C.bg, color: C.muted }}>
      <Icon size={13} style={{ color: C.amber }} />
      <span>{label}</span>
      <span className="font-mono font-semibold ml-auto" style={{ color: C.ink }}>{value}</span>
    </div>
  )
}

/* --- Main component --- */

export function CalculateurRentabilite() {
  const [params, setParams]   = useState<Params>(DEF_PARAMS)
  const [recettes, setRecettes] = useState<LineItem[]>(() => mkRecettes())
  const [depenses, setDepenses] = useState<LineItem[]>(() => mkDepenses())
  const [loaded, setLoaded]   = useState(false)
  const [courseForm, setCourseForm] = useState<CourseForm>(DEF_COURSE)
  const [detailOpen, setDetailOpen] = useState(false)

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

    return {
      jours, kmTotal, litresMois, coutLitre, carbMois, CA, F, vJour, chargesVar, chargesTot,
      resultat, margeJour, tauxMCV, seuilJours, recJourNec, prixForfaitMin, rJour, Rfix,
      coutKm, recKm, margeKm, resAnnuel, is, netAnnuel, cvp, breakdown, maxJours,
      partCarb: CA > 0 ? carbMois / CA : 0,
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

  const courseVerdictStyle = courseResult
    ? courseResult.verdict === 'rentable'
      ? { bg: C.profitBg, color: C.profit, emoji: '✅', label: 'RENTABLE' }
      : courseResult.verdict === 'limite'
      ? { bg: C.warnBg,   color: C.warn,   emoji: '⚠️', label: 'LIMITE' }
      : { bg: C.lossBg,   color: C.loss,   emoji: '❌', label: 'À REFUSER' }
    : null

  const positive    = r.resultat >= 0
  const verdictColor = positive ? C.profit : C.loss
  const verdictBg   = positive ? C.profitBg : C.lossBg
  const seuilTxt    = isFinite(r.seuilJours) ? `${num(r.seuilJours, 1)} j` : 'jamais'
  const seuilPct    = isFinite(r.seuilJours) && r.seuilJours > 0
    ? Math.min(100, (r.jours / r.seuilJours) * 100) : 0

  const reset = () => {
    setParams({ jours: 0, gazoleTTC: 0, tvaRecup: 0, conso: 0, kmJour: 0 })
    setRecettes([])
    setDepenses([])
    setCourseForm(DEF_COURSE)
    setDetailOpen(false)
  }

  return (
    <div className="space-y-4">

      {/* Verdict bar */}
      <div className="rounded-xl px-4 py-3" style={{ background: verdictBg, border: `1px solid ${C.border}` }}>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            {positive
              ? <ArrowUpRight size={18} color={verdictColor} />
              : <ArrowDownRight size={18} color={verdictColor} />}
            <span className="font-semibold" style={{ color: verdictColor }}>
              {positive ? 'Bénéficiaire' : 'Déficitaire'} · {eur0(r.resultat)}/mois
            </span>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="text-sm" style={{ color: C.navy }}>
              Seuil atteint à <b className="font-mono">{seuilTxt}</b> travaillés
              {isFinite(r.seuilJours) && r.seuilJours > 26 && " (> capacité d'un mois)"}
              {!positive && isFinite(r.recJourNec) && (
                <> · objectif <b className="font-mono">{eur0(r.recJourNec)}/jour</b></>
              )}
            </div>
            <button
              onClick={reset}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
              style={{ color: C.muted, border: `1px solid ${C.border}`, background: C.card }}
            >
              <RotateCcw size={13} /> Réinitialiser
            </button>
          </div>
        </div>
      </div>

      {/* Grille principale */}
      <div className="grid lg:grid-cols-[1fr_400px] gap-6 items-start">

        {/* COLONNE GAUCHE : saisies */}
        <div className="flex flex-col gap-6">

          {/* 01 Paramètres */}
          <section className="rounded-2xl p-5" style={{ background: C.card, border: `1px solid ${C.border}` }}>
            <div className="flex items-center gap-2 mb-4">
              <span className="font-mono text-xs px-1.5 py-0.5 rounded" style={{ background: C.bg, color: C.muted }}>01</span>
              <h2 className="font-semibold">Paramètres d'exploitation</h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Field label="Jours travaillés / mois" value={params.jours}     onChange={(v) => setParams({ ...params, jours: v })} />
              <Field label="Km / jour"   suffix="km"     value={params.kmJour}    onChange={(v) => setParams({ ...params, kmJour: v })}    step={10} />
              <Field label="Consommation" suffix="L/100" value={params.conso}     onChange={(v) => setParams({ ...params, conso: v })}     step={0.5} />
              <Field label="Prix gazole" suffix="€/L TTC" value={params.gazoleTTC} onChange={(v) => setParams({ ...params, gazoleTTC: v })} step={0.01} />
              <Field label="TVA récupérable" suffix="%" value={params.tvaRecup}  onChange={(v) => setParams({ ...params, tvaRecup: v })}  step={10} />
            </div>
            <div className="mt-4 flex items-center gap-2 text-xs rounded-lg px-3 py-2" style={{ background: C.bg, color: C.muted }}>
              <Fuel size={14} style={{ color: C.amber }} />
              <span>
                {num(r.litresMois, 0)} L/mois · coût réel{' '}
                <b className="font-mono">{eur2(r.coutLitre)}/L HT</b> · carburant{' '}
                <b className="font-mono">{eur0(r.carbMois)}/mois</b> ({num(r.partCarb * 100, 0)} % du CA)
              </span>
            </div>
          </section>

          {/* 02 Recettes */}
          <section className="rounded-2xl p-5" style={{ background: C.card, border: `1px solid ${C.border}` }}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs px-1.5 py-0.5 rounded" style={{ background: C.bg, color: C.muted }}>02</span>
                <h2 className="font-semibold">Recettes</h2>
              </div>
              <button
                onClick={() => setRecettes([...recettes, { id: uid(), label: 'Nouvelle recette', freq: 'parJour', montant: 0 }])}
                className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg"
                style={{ color: C.profit, background: C.profitBg }}
              >
                <Plus size={13} /> Ajouter
              </button>
            </div>
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-12 gap-2 text-[10px] uppercase tracking-wide px-1" style={{ color: C.faint }}>
                <span className="col-span-5">Libellé</span>
                <span className="col-span-3">Fréquence</span>
                <span className="col-span-3 text-right">Montant HT</span>
                <span className="col-span-1" />
              </div>
              {recettes.map((it) => (
                <Row key={it.id} item={it} color={C.profit}
                  onChange={(n) => setRecettes(recettes.map((x) => (x.id === it.id ? n : x)))}
                  onDelete={() => setRecettes(recettes.filter((x) => x.id !== it.id))}
                />
              ))}
              {recettes.length === 0 && (
                <p className="text-xs py-2" style={{ color: C.faint }}>Ajoute une recette pour démarrer.</p>
              )}
            </div>
          </section>

          {/* 03 Dépenses */}
          <section className="rounded-2xl p-5" style={{ background: C.card, border: `1px solid ${C.border}` }}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs px-1.5 py-0.5 rounded" style={{ background: C.bg, color: C.muted }}>03</span>
                <h2 className="font-semibold">Dépenses</h2>
              </div>
              <button
                onClick={() => setDepenses([...depenses, { id: uid(), label: 'Nouvelle dépense', freq: 'mensuel', montant: 0 }])}
                className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg"
                style={{ color: C.loss, background: C.lossBg }}
              >
                <Plus size={13} /> Ajouter
              </button>
            </div>
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-12 gap-2 text-[10px] uppercase tracking-wide px-1" style={{ color: C.faint }}>
                <span className="col-span-5">Libellé</span>
                <span className="col-span-3">Fréquence</span>
                <span className="col-span-3 text-right">Montant HT</span>
                <span className="col-span-1" />
              </div>
              {/* Carburant — ligne calculée automatiquement */}
              <div className="grid grid-cols-12 gap-2 items-center py-1 rounded-md px-1" style={{ background: C.bg }}>
                <span className="col-span-8 text-sm flex items-center gap-1.5" style={{ color: C.muted }}>
                  <Fuel size={13} style={{ color: C.amber }} /> Carburant (calculé auto)
                </span>
                <span className="col-span-3 font-mono text-sm text-right" style={{ color: C.loss }}>{eur2(r.carbMois)}</span>
                <span className="col-span-1" />
              </div>
              {depenses.map((it) => (
                <Row key={it.id} item={it} color={C.loss}
                  onChange={(n) => setDepenses(depenses.map((x) => (x.id === it.id ? n : x)))}
                  onDelete={() => setDepenses(depenses.filter((x) => x.id !== it.id))}
                />
              ))}
            </div>
          </section>
        </div>

        {/* COLONNE DROITE : résultats (sticky) */}
        <div className="flex flex-col gap-4 lg:sticky lg:top-4">

          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3">
            <Kpi label="CA mensuel"      value={eur0(r.CA)}        sub={`${eur0(r.rJour)}/jour`} />
            <Kpi label="Charges totales" value={eur0(r.chargesTot)} sub={`fixes ${eur0(r.F)}`} />
            <Kpi label="Résultat avant IS" value={eur0(r.resultat)} accent={verdictColor}
              sub={`marge ${num(r.CA > 0 ? (r.resultat / r.CA) * 100 : 0, 1)} %`} />
            <Kpi label="Marge / jour" value={eur0(r.margeJour)} accent={r.margeJour >= 0 ? C.profit : C.loss}
              sub={`MCV ${num(r.tauxMCV * 100, 0)} %`} />
          </div>

          {/* Seuil de rentabilité */}
          <div className="rounded-2xl p-5" style={{ background: C.ink }}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-semibold text-white text-sm">Seuil de rentabilité</h3>
              <span className="font-mono text-xs" style={{ color: C.amber }}>point mort</span>
            </div>
            <div className="flex items-baseline gap-2 mb-3">
              <span className="font-mono font-bold text-3xl text-white">{seuilTxt}</span>
              <span className="text-xs" style={{ color: '#9DB2CE' }}>/ {num(r.jours)} travaillés</span>
            </div>
            <div className="h-2.5 rounded-full overflow-hidden mb-1" style={{ background: '#21364F' }}>
              <div className="h-full rounded-full transition-all"
                style={{ width: `${Math.min(100, seuilPct)}%`, background: positive ? C.amber : C.loss }} />
            </div>
            <p className="text-[11px]" style={{ color: '#9DB2CE' }}>
              {positive
                ? `Tu couvres tes charges et dégages ${eur0(r.resultat)}/mois.`
                : isFinite(r.seuilJours)
                  ? `Il faudrait ${num(r.seuilJours, 1)} jours pour être à l'équilibre — soit ${eur0(r.recJourNec)}/jour à ${num(r.jours)} jours.`
                  : `Chaque jour travaillé perd de l'argent : la recette/jour ne couvre pas le coût variable.`}
            </p>
            <div className="grid grid-cols-2 gap-2 mt-4">
              <div className="rounded-lg p-2.5" style={{ background: '#152940' }}>
                <div className="text-[10px] uppercase" style={{ color: '#7E93B0' }}>Recette/jour mini</div>
                <div className="font-mono text-sm text-white">{eur0(r.recJourNec)}</div>
              </div>
              <div className="rounded-lg p-2.5" style={{ background: '#152940' }}>
                <div className="text-[10px] uppercase" style={{ color: '#7E93B0' }}>Forfait/jour mini</div>
                <div className="font-mono text-sm text-white">{eur0(r.prixForfaitMin)}</div>
              </div>
            </div>
          </div>

          {/* Graphique CVP */}
          <div className="rounded-2xl p-4" style={{ background: C.card, border: `1px solid ${C.border}` }}>
            <h3 className="font-semibold text-sm mb-2">CA vs charges selon le nombre de jours</h3>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={r.cvp} margin={{ top: 5, right: 8, left: -8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                <XAxis dataKey="d" tick={{ fontSize: 10, fill: C.faint }} tickLine={false} />
                <YAxis
                  tick={{ fontSize: 10, fill: C.faint }}
                  tickFormatter={(v: number) => `${Math.round(v / 1000)}k`}
                  tickLine={false} axisLine={false} width={36}
                />
                <Tooltip
                  formatter={(v: unknown) => eur0(Number(v))}
                  labelFormatter={(l: unknown) => `${l} jours`}
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${C.border}` }}
                />
                <Line type="monotone" dataKey="CA"      stroke={C.profit} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="Charges" stroke={C.loss}   strokeWidth={2} dot={false} />
                <ReferenceLine x={r.jours} stroke={C.navy} strokeDasharray="4 4" />
                {isFinite(r.seuilJours) && r.seuilJours <= r.maxJours && (
                  <ReferenceDot
                    x={Math.round(r.seuilJours)}
                    y={r.rJour * r.seuilJours + r.Rfix}
                    r={5} fill={C.amber} stroke="#fff" strokeWidth={2}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
            <div className="flex items-center gap-4 text-[11px] mt-1" style={{ color: C.muted }}>
              <span className="flex items-center gap-1">
                <i className="w-3 h-0.5 inline-block" style={{ background: C.profit }} /> Recettes
              </span>
              <span className="flex items-center gap-1">
                <i className="w-3 h-0.5 inline-block" style={{ background: C.loss }} /> Charges
              </span>
              <span className="flex items-center gap-1">
                <i className="w-2 h-2 rounded-full inline-block" style={{ background: C.amber }} /> Point mort
              </span>
            </div>
          </div>

          {/* Au km */}
          <div className="grid grid-cols-3 gap-3">
            <Kpi label="Recette / km" value={eur2(r.recKm)} />
            <Kpi label="Coût / km"    value={eur2(r.coutKm)} />
            <Kpi label="Marge / km"   value={eur2(r.margeKm)} accent={r.margeKm >= 0 ? C.profit : C.loss} />
          </div>

          {/* Répartition des charges */}
          <div className="rounded-2xl p-4" style={{ background: C.card, border: `1px solid ${C.border}` }}>
            <h3 className="font-semibold text-sm mb-2">Répartition des charges / mois</h3>
            <ResponsiveContainer width="100%" height={Math.max(120, r.breakdown.length * 26)}>
              <BarChart data={r.breakdown} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name"
                  tick={{ fontSize: 10, fill: C.muted }} width={120} tickLine={false} axisLine={false} />
                <Tooltip
                  formatter={(v: unknown) => eur0(Number(v))}
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${C.border}` }}
                  cursor={{ fill: C.bg }}
                />
                <Bar dataKey="value" radius={[0, 4, 4, 0] as [number, number, number, number]}>
                  {r.breakdown.map((e, i) => (
                    <Cell key={i} fill={e.name === 'Carburant' ? C.amber : C.steel} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Projection annuelle + IS */}
          <div className="rounded-2xl p-4" style={{ background: C.card, border: `1px solid ${C.border}` }}>
            <h3 className="font-semibold text-sm mb-3">Projection annuelle</h3>
            <div className="flex flex-col gap-2 text-sm">
              <div className="flex justify-between">
                <span style={{ color: C.muted }}>Résultat avant IS</span>
                <span className="font-mono" style={{ color: verdictColor }}>{eur0(r.resAnnuel)}</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: C.muted }}>IS estimé (15 % / 25 %)</span>
                <span className="font-mono">{eur0(r.is)}</span>
              </div>
              <div className="flex justify-between pt-2" style={{ borderTop: `1px solid ${C.border}` }}>
                <span className="font-semibold">Résultat net</span>
                <span className="font-mono font-semibold" style={{ color: r.netAnnuel >= 0 ? C.profit : C.loss }}>
                  {eur0(r.netAnnuel)}
                </span>
              </div>
            </div>
          </div>

          <p className="text-[10px] leading-relaxed px-1" style={{ color: C.faint }}>
            Montants en HT (la TVA est récupérable sur la majorité des postes). TVA gazole récupérable à 100 % pour un VUL.
            Estimation indicative — ne remplace pas ta compta Pennylane. Tes scénarios sont sauvegardés automatiquement.
          </p>
        </div>
      </div>

      {/* ── Simulateur de course ───────────────────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
        <div className="px-5 py-4" style={{ background: C.navy }}>
          <h2 className="font-semibold text-white">Simulateur de course (go / no-go)</h2>
          <p className="text-xs mt-0.5" style={{ color: '#9DB2CE' }}>
            Calcule si une course est rentable · coûts issus des hypothèses ci-dessus, mis à jour en direct
          </p>
        </div>

        <div className="p-5 space-y-4" style={{ background: C.card }}>

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
            <div className="rounded-xl p-4 text-center" style={{ background: C.bg }}>
              <p className="text-sm" style={{ color: C.muted }}>
                Remplissez le prix proposé, la distance et la durée <span style={{ color: C.loss }}>*</span> pour obtenir le verdict.
              </p>
            </div>
          ) : courseResult && courseVerdictStyle && (
            <div className="flex flex-col gap-3">

              {/* Verdict principal */}
              <div className="rounded-xl p-4" style={{ background: courseVerdictStyle.bg, border: `1px solid ${C.border}` }}>
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-xl">{courseVerdictStyle.emoji}</span>
                  <span className="font-bold text-lg" style={{ color: courseVerdictStyle.color }}>{courseVerdictStyle.label}</span>
                  <span className="ml-auto font-mono font-semibold text-lg" style={{ color: courseVerdictStyle.color }}>
                    {eur0(courseResult.margeNette)}
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                  <span style={{ color: C.muted }}>
                    Marge : <b className="font-mono" style={{ color: courseVerdictStyle.color }}>{pct1(courseResult.margePct)}</b>
                  </span>
                  <span style={{ color: C.muted }}>
                    Prix plancher : <b className="font-mono" style={{ color: C.ink }}>{eur0(courseResult.prixPlancher)}</b>
                  </span>
                  <span style={{ color: C.muted }}>
                    Prix cible ({nv(courseForm.margeCible)} %) : <b className="font-mono" style={{ color: C.profit }}>{eur0(courseResult.prixCible)}</b>
                  </span>
                </div>
              </div>

              {/* KPIs secondaires */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Prix / h',   value: eur0(courseResult.prixH) },
                  { label: 'Marge / h',  value: eur0(courseResult.margeH),  accent: courseResult.margeH  >= 0 ? C.profit : C.loss },
                  { label: 'Prix / km',  value: eur2(courseResult.prixKm) },
                  { label: 'Marge / km', value: eur2(courseResult.margeKm), accent: courseResult.margeKm >= 0 ? C.profit : C.loss },
                ].map((k) => (
                  <div key={k.label} className="rounded-xl p-3" style={{ background: C.bg, border: `1px solid ${C.border}` }}>
                    <div className="text-[10px] uppercase tracking-wide mb-1" style={{ color: C.muted }}>{k.label}</div>
                    <div className="font-mono font-semibold text-base leading-tight" style={{ color: k.accent ?? C.ink }}>{k.value}</div>
                  </div>
                ))}
              </div>

              {/* Détail des coûts — repliable */}
              <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
                <button
                  onClick={() => setDetailOpen((o) => !o)}
                  className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium transition-colors"
                  style={{ background: C.bg, color: C.muted }}
                >
                  <span>Détail des coûts</span>
                  {detailOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                </button>
                {detailOpen && (
                  <div className="px-4 py-3 flex flex-col gap-2 text-sm" style={{ background: C.card }}>
                    {[
                      { label: 'Carburant',  v: courseResult.coutCarburant, note: `${courseResult.kmTotal} km × ${eur2(r.couts.coutCarburantKm)}/km` },
                      { label: 'Usure / km', v: courseResult.coutUsure,     note: `${courseResult.kmTotal} km × ${eur2(r.couts.coutUsureKm)}/km` },
                      { label: 'Temps',      v: courseResult.coutTemps,     note: `${courseResult.heuresTotales.toFixed(1)} h × ${eur0(r.couts.coutTempsHeure)}/h` },
                      { label: 'Péages',     v: courseResult.coutPeages,    note: undefined },
                    ].map((row) => (
                      <div key={row.label} className="flex items-center justify-between gap-4">
                        <div>
                          <span style={{ color: C.ink }}>{row.label}</span>
                          {row.note && <span className="ml-2 text-[11px]" style={{ color: C.faint }}>{row.note}</span>}
                        </div>
                        <span className="font-mono" style={{ color: C.muted }}>{eur0(row.v)}</span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between pt-2 font-semibold" style={{ borderTop: `1px solid ${C.border}` }}>
                      <span style={{ color: C.ink }}>Coût total</span>
                      <span className="font-mono" style={{ color: C.ink }}>{eur0(courseResult.coutTotal)}</span>
                    </div>
                  </div>
                )}
              </div>

              <p className="text-[10px]" style={{ color: C.faint }}>
                km total : {courseResult.kmTotal} · durée totale : {courseResult.heuresTotales.toFixed(1)} h · {nv(courseForm.nbPoints)} point(s)
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
