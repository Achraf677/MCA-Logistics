import { Check, Minus, Plus } from 'lucide-react'

/** Au-delà, des cases deviennent illisibles : un compteur + / − prend le relais. */
const MAX_CASES = 10

/**
 * Choix du nombre de colis remis : une grosse case par colis (appui = coché / décoché), toutes
 * cochées au départ. Plus de 10 colis : compteur.
 */
export function SelecteurColis({ total, valeur, onChange }: { total: number; valeur: number; onChange: (n: number) => void }) {
  if (total > MAX_CASES) {
    return (
      <div className="flex items-center gap-2">
        <button type="button" aria-label="Un colis de moins" disabled={valeur <= 0} onClick={() => onChange(Math.max(0, valeur - 1))}
          className="size-14 shrink-0 inline-flex items-center justify-center rounded-[var(--r-lg)] border border-[var(--border)] text-[var(--text)]">
          <Minus size={22} />
        </button>
        <p className="flex-1 text-center text-2xl font-bold tabular-nums text-[var(--text)]">{valeur} / {total}</p>
        <button type="button" aria-label="Un colis de plus" disabled={valeur >= total} onClick={() => onChange(Math.min(total, valeur + 1))}
          className="size-14 shrink-0 inline-flex items-center justify-center rounded-[var(--r-lg)] border border-[var(--border)] text-[var(--text)]">
          <Plus size={22} />
        </button>
      </div>
    )
  }
  return (
    <div className="grid grid-cols-5 gap-2" role="group" aria-label="Colis remis">
      {Array.from({ length: total }, (_, i) => {
        const coche = i < valeur
        return (
          <button key={i} type="button" aria-pressed={coche} aria-label={`Colis ${i + 1}`}
            // Cocher le colis n° i = en remettre i ; décocher = en remettre i − 1 (les colis restent « dans l'ordre »).
            onClick={() => onChange(coche ? i : i + 1)}
            className={`min-h-16 inline-flex flex-col items-center justify-center rounded-[var(--r-lg)] border-2 text-lg font-bold active:scale-[0.97] ${
              coche ? 'border-[var(--success)] bg-[var(--success)] text-black' : 'border-[var(--border-strong)] text-[var(--text-muted)]'}`}>
            {coche ? <Check size={24} /> : <span className="size-6 rounded-md border-2 border-current" aria-hidden />}
            <span className="text-xs tabular-nums">{i + 1}</span>
          </button>
        )
      })}
    </div>
  )
}
