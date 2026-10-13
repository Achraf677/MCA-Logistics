import type { ReactNode } from 'react'
import { Minus, Plus, User, AlertTriangle } from 'lucide-react'
import { Skeleton } from '../../shared/ui/Skeleton'
import { EmptyState } from '../../shared/ui/EmptyState'
import type { EtatFiche, MaFiche } from './mescourses.types'

/** Briques d'écran communes aux onglets de l'espace salarié. */

export function Carte({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section className={`flex flex-col gap-3 p-4 rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg-card)] ${className}`}>
      {children}
    </section>
  )
}

export function TitreCarte({ icone, children, droite }: { icone?: ReactNode; children: ReactNode; droite?: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      {icone && <span className="text-[var(--text-muted)] shrink-0">{icone}</span>}
      <h2 className="flex-1 min-w-0 text-base font-semibold text-[var(--text)] truncate">{children}</h2>
      {droite}
    </div>
  )
}

export function MessageErreur({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="flex items-start gap-2 p-3 rounded-[var(--r-md)] text-sm
      bg-[var(--danger)]/10 border border-[var(--danger)]/30 text-[var(--danger)]">
      <AlertTriangle size={16} className="shrink-0 mt-0.5" /> <span>{children}</span>
    </p>
  )
}

export const champCls = `w-full min-h-12 px-3 rounded-[var(--r-md)] bg-[var(--bg)] border border-[var(--border)]
  text-base text-[var(--text)] focus:outline-none focus:border-[var(--brand)] disabled:opacity-60`

export const boutonPrimaireCls = `min-h-12 px-4 inline-flex items-center justify-center gap-2 rounded-[var(--r-md)]
  bg-[var(--brand)] text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed`

export const boutonSecondaireCls = `min-h-12 px-4 inline-flex items-center justify-center gap-2 rounded-[var(--r-md)]
  border border-[var(--border)] text-[var(--text)] text-sm font-medium hover:border-[var(--border-strong)]
  disabled:opacity-40 disabled:cursor-not-allowed`

/**
 * Compteur de colis : gros − / + pour le pouce, et saisie directe au milieu
 * (clavier numérique) pour taper « 118 » d'un coup.
 */
export function Compteur({ libelle, aide, valeur, onChange, disabled, onPas }: {
  libelle: string
  aide?: string
  valeur: string
  onChange: (v: string) => void
  onPas: (delta: number) => void
  disabled?: boolean
}) {
  const btn = `w-14 h-14 shrink-0 inline-flex items-center justify-center rounded-[var(--r-md)]
    border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text)] active:bg-[var(--bg-card-hover)]
    disabled:opacity-40`
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-medium text-[var(--text)]">{libelle}
        {aide && <span className="ml-1 text-xs font-normal text-[var(--text-muted)]">{aide}</span>}
      </span>
      <div className="flex items-center gap-2">
        <button type="button" className={btn} onClick={() => onPas(-1)} disabled={disabled} aria-label={`${libelle} : moins un`}>
          <Minus size={22} />
        </button>
        <input type="text" inputMode="numeric" pattern="[0-9]*" value={valeur} placeholder="0"
          onChange={e => onChange(e.target.value.replace(/[^\d]/g, '').slice(0, 6))}
          disabled={disabled} aria-label={libelle}
          className="flex-1 min-w-0 h-14 text-center text-2xl font-semibold tabular-nums rounded-[var(--r-md)]
            bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-[var(--brand)]
            disabled:opacity-60" />
        <button type="button" className={btn} onClick={() => onPas(1)} disabled={disabled} aria-label={`${libelle} : plus un`}>
          <Plus size={22} />
        </button>
      </div>
    </div>
  )
}

/**
 * Garde commune : rend l'enfant seulement quand la fiche Équipe est lue ;
 * sinon chargement, erreur, ou « compte pas relié ».
 */
export function GardeFiche({ fiche, children }: { fiche: EtatFiche; children: (f: MaFiche) => ReactNode }) {
  if (!fiche.chargee) {
    return <div className="flex flex-col gap-3">{[0, 1].map(i => <Skeleton key={i} className="h-32" />)}</div>
  }
  if (fiche.erreur) return <MessageErreur>Impossible de lire ta fiche : {fiche.erreur}</MessageErreur>
  if (!fiche.data) {
    return (
      <EmptyState icon={<User size={28} />} title="Compte pas encore relié"
        description="Ton compte n'est pas encore relié à ta fiche Équipe : préviens le bureau." />
    )
  }
  return <>{children(fiche.data)}</>
}

/** Remonte en haut de l'écran : le défilement vit dans le <main> du Shell, pas la fenêtre. */
export function remonterEnHaut() {
  const main = document.querySelector('main')
  if (main) main.scrollTo({ top: 0, behavior: 'smooth' })
  window.scrollTo({ top: 0, behavior: 'smooth' })
}
