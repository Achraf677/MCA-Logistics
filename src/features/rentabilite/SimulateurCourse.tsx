import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { RotateCcw, ChevronDown, ChevronUp, ExternalLink, Fuel, Clock, Wrench, CircleDollarSign } from 'lucide-react'
import {
  deriveCoutsUnitaires, simulateCourse,
  DEFAULT_CALC_PARAMS, DEFAULT_CALC_DEPENSES,
  type CoutsUnitaires, type CalcParams, type CalcLineItem,
} from './rentabilite.logic'

/* Tokens — alignés sur CalculateurRentabilite */
const C = {
  ink:      '#0B1F3A',
  navy:     '#13294B',
  amber:    '#F59E0B',
  profit:   '#15803D',
  profitBg: '#DCFCE7',
  warn:     '#B45309',
  warnBg:   '#FEF3C7',
  loss:     '#DC2626',
  lossBg:   '#FEE2E2',
  bg:       '#EEF2F7',
  card:     '#FFFFFF',
  border:   '#DDE4ED',
  muted:    '#64748B',
  faint:    '#94A3B8',
} as const

/* Formatters */
const eur0 = (n: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(isFinite(n) ? n : 0)
const eur2 = (n: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(isFinite(n) ? n : 0)
const pct1 = (r: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(isFinite(r) ? r : 0)

/* Lire les coûts depuis localStorage 'mca-renta' (écrit par CalculateurRentabilite) */
function readCoutsFromStorage(): CoutsUnitaires {
  try {
    const raw = localStorage.getItem('mca-renta')
    if (raw) {
      const s = JSON.parse(raw) as { params?: CalcParams; depenses?: CalcLineItem[] }
      if (s.params && s.depenses) return deriveCoutsUnitaires(s.params, s.depenses)
    }
  } catch { /* pas de données sauvegardées */ }
  return deriveCoutsUnitaires(DEFAULT_CALC_PARAMS, DEFAULT_CALC_DEPENSES)
}

interface CourseForm {
  prixPropose:    number | ''
  distanceCharge: number | ''
  dureeH:         number | ''
  kilometresVide: number | ''
  peages:         number | ''
  attenteH:       number | ''
  nbPoints:       number | ''
  margeCible:     number | ''   // % affiché, converti en ratio lors du calcul
}

const DEF: CourseForm = {
  prixPropose:    '',
  distanceCharge: '',
  dureeH:         '',
  kilometresVide: 0,
  peages:         0,
  attenteH:       0,
  nbPoints:       1,
  margeCible:     20,
}

/* --- Sub-components --- */

function Field({
  label, suffix, value, onChange, step = 1, min = 0, required = false,
}: {
  label: string; suffix?: string; value: number | string
  onChange: (v: number | '') => void; step?: number; min?: number; required?: boolean
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wide flex items-center gap-1" style={{ color: C.muted }}>
        {label}
        {required && <span style={{ color: C.loss }}>*</span>}
      </span>
      <div className="flex items-center rounded-lg overflow-hidden" style={{ border: `1px solid ${C.border}`, background: '#fff' }}>
        <input
          type="number" step={step} min={min} value={value}
          onChange={(e) => onChange(e.target.value === '' ? '' : parseFloat(e.target.value))}
          className="font-mono w-full px-3 py-2 text-sm outline-none bg-transparent"
          style={{ color: C.ink }}
        />
        {suffix && <span className="font-mono text-xs px-2 select-none whitespace-nowrap" style={{ color: C.faint }}>{suffix}</span>}
      </div>
    </label>
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

export function SimulateurCourse() {
  const [couts, setCouts] = useState<CoutsUnitaires>(readCoutsFromStorage)
  const [form, setForm]   = useState<CourseForm>(DEF)
  const [open, setOpen]   = useState(false)  // détail des coûts repliable

  const set = <K extends keyof CourseForm>(k: K, v: CourseForm[K]) =>
    setForm((f) => ({ ...f, [k]: v }))

  const n = (v: number | string): number => v === '' || v == null ? 0 : Number(v)

  const ready =
    n(form.prixPropose) > 0 &&
    n(form.distanceCharge) > 0 &&
    n(form.dureeH) > 0

  const result = useMemo(() => {
    if (!ready) return null
    return simulateCourse(
      {
        prixPropose:    n(form.prixPropose),
        distanceCharge: n(form.distanceCharge),
        dureeH:         n(form.dureeH),
        kilometresVide: n(form.kilometresVide),
        peages:         n(form.peages),
        attenteH:       n(form.attenteH),
        nbPoints:       n(form.nbPoints),
        margeCible:     n(form.margeCible) / 100,
      },
      couts,
    )
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, couts, ready])

  const refreshCouts = () => setCouts(readCoutsFromStorage())
  const reset = () => { setForm(DEF); setOpen(false) }

  /* Couleurs selon le verdict */
  const verdictStyle = result
    ? result.verdict === 'rentable'
      ? { bg: C.profitBg, color: C.profit, emoji: '✅', label: 'RENTABLE' }
      : result.verdict === 'limite'
      ? { bg: C.warnBg,   color: C.warn,   emoji: '⚠️', label: 'LIMITE' }
      : { bg: C.lossBg,   color: C.loss,   emoji: '❌', label: 'À REFUSER' }
    : null

  return (
    <div className="space-y-4 max-w-2xl">

      {/* 1 — Hypothèses en lecture seule */}
      <section className="rounded-2xl p-4" style={{ background: C.card, border: `1px solid ${C.border}` }}>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs px-1.5 py-0.5 rounded" style={{ background: C.bg, color: C.muted }}>Hypothèses</span>
            <span className="text-sm font-medium" style={{ color: C.ink }}>Coûts unitaires (depuis Rentabilité)</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={refreshCouts}
              className="text-xs px-2 py-1 rounded-md transition-colors"
              style={{ color: C.muted, border: `1px solid ${C.border}` }}
              title="Synchroniser avec les dernières hypothèses sauvegardées"
            >
              Synchroniser
            </button>
            <Link
              to="/pilotage?tab=rentabilite"
              className="flex items-center gap-1 text-xs px-2 py-1 rounded-md"
              style={{ color: C.profit, border: `1px solid ${C.border}` }}
            >
              Modifier <ExternalLink size={11} />
            </Link>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <RateChip icon={Fuel}              label="Carburant"  value={`${eur2(couts.coutCarburantKm)}/km`} />
          <RateChip icon={Wrench}            label="Usure km"   value={`${eur2(couts.coutUsureKm)}/km`} />
          <RateChip icon={Clock}             label="Temps"      value={`${eur0(couts.coutTempsHeure)}/h`} />
          <RateChip icon={CircleDollarSign}  label="Gazole HT"  value={`${eur2(couts.coutLitreHT)}/L`} />
        </div>
        <p className="text-[10px] mt-2" style={{ color: C.faint }}>
          Coût temps = charges fixes + variables / ({couts.heuresParJour} h/j). Modifiez les hypothèses dans l'onglet Rentabilité puis cliquez « Synchroniser ».
        </p>
      </section>

      {/* 2 — Entrées de la course */}
      <section className="rounded-2xl p-4" style={{ background: C.card, border: `1px solid ${C.border}` }}>
        <div className="flex items-center gap-2 mb-4">
          <span className="font-mono text-xs px-1.5 py-0.5 rounded" style={{ background: C.bg, color: C.muted }}>Course</span>
          <h2 className="font-semibold text-sm">Données de la course</h2>
        </div>

        {/* Champs obligatoires */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <Field label="Prix proposé HT" suffix="€" required
            value={form.prixPropose} onChange={(v) => set('prixPropose', v)} step={5} />
          <Field label="Distance en charge" suffix="km" required
            value={form.distanceCharge} onChange={(v) => set('distanceCharge', v)} step={10} />
          <Field label="Durée estimée" suffix="h" required
            value={form.dureeH} onChange={(v) => set('dureeH', v)} step={0.5} min={0} />
        </div>

        {/* Champs optionnels */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Field label="Trajet à vide" suffix="km"
            value={form.kilometresVide} onChange={(v) => set('kilometresVide', v)} step={5} />
          <Field label="Péages" suffix="€"
            value={form.peages} onChange={(v) => set('peages', v)} step={1} />
          <Field label="Attente" suffix="h"
            value={form.attenteH} onChange={(v) => set('attenteH', v)} step={0.25} />
          <Field label="Nb de points" suffix="pts"
            value={form.nbPoints} onChange={(v) => set('nbPoints', v)} min={1} />
        </div>

        {/* Marge cible */}
        <div className="mt-3 flex items-center gap-3 flex-wrap">
          <div className="w-40">
            <Field label="Marge cible" suffix="%"
              value={form.margeCible} onChange={(v) => set('margeCible', v)} step={5} min={0} />
          </div>
          <p className="text-[11px] mt-4" style={{ color: C.faint }}>
            Prix cible = coût total × (1 + marge cible)
          </p>
        </div>
      </section>

      {/* 3 — Verdict */}
      {!ready ? (
        <div className="rounded-2xl p-6 text-center" style={{ background: C.bg, border: `1px solid ${C.border}` }}>
          <p className="text-sm" style={{ color: C.muted }}>
            Remplissez les trois champs obligatoires <span style={{ color: C.loss }}>*</span> pour obtenir le verdict.
          </p>
        </div>
      ) : result && verdictStyle && (
        <div className="flex flex-col gap-3">

          {/* Verdict principal */}
          <div className="rounded-2xl p-5" style={{ background: verdictStyle.bg, border: `1px solid ${C.border}` }}>
            <div className="flex items-center gap-3 mb-3">
              <span className="text-2xl">{verdictStyle.emoji}</span>
              <span className="font-bold text-xl" style={{ color: verdictStyle.color }}>{verdictStyle.label}</span>
              <span className="ml-auto font-mono font-semibold text-lg" style={{ color: verdictStyle.color }}>
                {eur0(result.margeNette)}
              </span>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
              <span style={{ color: C.muted }}>
                Marge : <b className="font-mono" style={{ color: verdictStyle.color }}>{pct1(result.margePct)}</b>
              </span>
              <span style={{ color: C.muted }}>
                Prix plancher : <b className="font-mono" style={{ color: C.ink }}>{eur0(result.prixPlancher)}</b>
              </span>
              <span style={{ color: C.muted }}>
                Prix cible ({n(form.margeCible)} %) : <b className="font-mono" style={{ color: C.profit }}>{eur0(result.prixCible)}</b>
              </span>
            </div>
          </div>

          {/* KPIs secondaires */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Prix / h',   value: eur0(result.prixH),   sub: undefined },
              { label: 'Marge / h',  value: eur0(result.margeH),  sub: undefined, accent: result.margeH >= 0 ? C.profit : C.loss },
              { label: 'Prix / km',  value: eur2(result.prixKm),  sub: undefined },
              { label: 'Marge / km', value: eur2(result.margeKm), sub: undefined, accent: result.margeKm >= 0 ? C.profit : C.loss },
            ].map((k) => (
              <div key={k.label} className="rounded-xl p-3" style={{ background: C.card, border: `1px solid ${C.border}` }}>
                <div className="text-[10px] uppercase tracking-wide mb-1" style={{ color: C.muted }}>{k.label}</div>
                <div className="font-mono font-semibold text-base leading-tight" style={{ color: k.accent ?? C.ink }}>{k.value}</div>
              </div>
            ))}
          </div>

          {/* Détail repliable */}
          <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
            <button
              onClick={() => setOpen((o) => !o)}
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium transition-colors"
              style={{ background: C.bg, color: C.muted }}
            >
              <span>Détail des coûts</span>
              {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </button>
            {open && (
              <div className="px-4 py-3 flex flex-col gap-2 text-sm" style={{ background: C.card }}>
                {[
                  { label: 'Carburant',  value: result.coutCarburant, note: `${result.kmTotal} km × ${eur2(couts.coutCarburantKm)}/km` },
                  { label: 'Usure / km', value: result.coutUsure,     note: `${result.kmTotal} km × ${eur2(couts.coutUsureKm)}/km` },
                  { label: 'Temps',      value: result.coutTemps,     note: `${result.heuresTotales.toFixed(1)} h × ${eur0(couts.coutTempsHeure)}/h` },
                  { label: 'Péages',     value: result.coutPeages,    note: undefined },
                ].map((row) => (
                  <div key={row.label} className="flex items-center justify-between gap-4">
                    <div>
                      <span style={{ color: C.ink }}>{row.label}</span>
                      {row.note && <span className="ml-2 text-[11px]" style={{ color: C.faint }}>{row.note}</span>}
                    </div>
                    <span className="font-mono" style={{ color: C.muted }}>{eur0(row.value)}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between pt-2 font-semibold"
                  style={{ borderTop: `1px solid ${C.border}` }}>
                  <span style={{ color: C.ink }}>Coût total</span>
                  <span className="font-mono" style={{ color: C.ink }}>{eur0(result.coutTotal)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Note et reset */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <p className="text-[10px]" style={{ color: C.faint }}>
              Nb de points : {n(form.nbPoints)} · km total : {result.kmTotal} km · durée totale : {result.heuresTotales.toFixed(1)} h
            </p>
            <button
              onClick={reset}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg whitespace-nowrap"
              style={{ color: C.muted, border: `1px solid ${C.border}`, background: C.card }}
            >
              <RotateCcw size={13} /> Réinitialiser
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
