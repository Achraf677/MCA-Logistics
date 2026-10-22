import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Search } from 'lucide-react'
import { PRESTATIONS, PRESTATION_LABELS, PRESTATION_AIDES } from '../lib/prestations'
import type { Prestation } from '../lib/prestations'

// Briques communes des fiches de saisie (fiche livraison, devis) : mêmes blocs,
// même choix du client, même choix de prestation — un seul exemplaire.

/** Champ d'une fiche (libellé lisible, erreur sous le champ). */
export function Champ({ label, children, error }: { label: string; children: ReactNode; error?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-[var(--text-muted)]">
        {label}
      </label>
      {children}
      {error && <span className="text-[var(--danger)] text-xs">{error}</span>}
    </div>
  )
}

/** Bloc titré d'une fiche : surface propre, titre net, liseré de marque. */
export function Bloc({ titre, children, icone, droite }: {
  titre: string
  children: ReactNode
  icone?: ReactNode
  /** Geste ou info à droite du titre. */
  droite?: ReactNode
}) {
  return (
    <section className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg-card)] p-4 flex flex-col gap-3.5">
      <header className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
          {icone ? <span className="text-[var(--brand)]">{icone}</span>
            : <span className="h-4 w-[3px] rounded-full bg-[var(--brand)]" aria-hidden="true" />}
          {titre}
        </h3>
        {droite}
      </header>
      {children}
    </section>
  )
}

/**
 * Choix du client avec RECHERCHE : la liste déroulante de 30+ noms ne se
 * parcourait qu'à l'œil. Liste dans le flux (pas en position absolue) : le
 * tiroir défile, une liste flottante y serait rognée.
 */
export function ChoixClient({ clients, value, onChange, disabled }: {
  clients: Array<{ id: string; label: string }>
  value: string
  onChange: (id: string) => void
  disabled?: boolean
}) {
  const choisi = clients.find(c => c.id === value) ?? null
  const [ouvert, setOuvert] = useState(false)
  const [q, setQ] = useState('')
  const filtres = useMemo(() => {
    const t = q.trim().toLowerCase()
    const tries = [...clients].sort((a, b) => a.label.localeCompare(b.label, 'fr'))
    return t ? tries.filter(c => c.label.toLowerCase().includes(t)) : tries
  }, [clients, q])

  if (!ouvert) {
    return (
      <button type="button" disabled={disabled}
        onClick={() => { setQ(''); setOuvert(true) }}
        className={`field text-left flex items-center justify-between gap-2 disabled:opacity-60`}>
        <span className={choisi ? 'text-[var(--text)] truncate' : 'text-[var(--text-disabled)]'}>
          {choisi?.label ?? 'Choisir un client…'}
        </span>
        <Search size={14} className="text-[var(--text-muted)] shrink-0" />
      </button>
    )
  }
  return (
    <div className="flex flex-col gap-1">
      <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher un client…"
        className="field"
        onKeyDown={e => {
          if (e.key === 'Escape') setOuvert(false)
          if (e.key === 'Enter' && filtres[0]) { e.preventDefault(); onChange(filtres[0].id); setOuvert(false) }
        }} />
      <ul className="max-h-[14rem] overflow-y-auto rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--bg)]">
        {filtres.length === 0 && <li className="px-3 py-2 text-xs text-[var(--text-muted)]">Aucun client</li>}
        {filtres.map(c => (
          <li key={c.id}>
            <button type="button" onClick={() => { onChange(c.id); setOuvert(false) }}
              className={`w-full text-left px-3 py-1.5 text-sm hover:bg-[var(--bg-card-hover)]
                ${c.id === value ? 'text-[var(--brand)] font-medium' : 'text-[var(--text)]'}`}>
              {c.label}
            </button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={() => setOuvert(false)} className="self-start text-xs text-[var(--text-muted)] hover:text-[var(--text)]">
        Fermer la liste
      </button>
    </div>
  )
}

/** Prestation : pastilles (une seule active) + aide de la prestation choisie. */
export function ChoixPrestation({ value, onChange, disabled, avecVide = false }: {
  value: Prestation | ''
  onChange: (p: Prestation) => void
  disabled?: boolean
  /** Aucune prestation choisie possible (devis : « non précisée »). */
  avecVide?: boolean
}) {
  return (
    <>
      <div className="flex flex-wrap gap-1 p-1 rounded-[var(--r-lg)] bg-[color-mix(in_srgb,var(--text)_6%,transparent)] w-fit max-w-full" role="radiogroup" aria-label="Prestation">
        {PRESTATIONS.map(p => (
          <button key={p} type="button" role="radio" aria-checked={value === p}
            disabled={disabled}
            onClick={() => onChange(p)}
            title={PRESTATION_AIDES[p]}
            className={`h-8 px-3.5 rounded-[var(--r-md)] text-xs transition-colors disabled:opacity-60
              ${value === p
                ? 'bg-[var(--brand)] text-white font-semibold shadow-sm'
                : 'text-[var(--text-muted)] hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] hover:text-[var(--text)]'}`}>
            {PRESTATION_LABELS[p]}
          </button>
        ))}
      </div>
      {!value && avecVide && <span className="text-xs text-[var(--text-muted)]">Choisir la prestation chiffrée.</span>}
    </>
  )
}
