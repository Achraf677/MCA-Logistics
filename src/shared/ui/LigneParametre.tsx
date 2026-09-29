import { useState, type ReactNode } from 'react'
import { Eye, EyeOff, Pencil, Check, X, Trash2 } from 'lucide-react'

interface Props {
  libelle: string
  /** Pastilles à côté du libellé (famille, « Système »…). */
  extra?: ReactNode
  /** Nombre d'écritures qui utilisent l'élément — affiché, et bloque la suppression. */
  usages: number
  /** Libellé de l'unité d'usage, au singulier et au pluriel (ex. ['charge', 'charges']). */
  unite: [string, string]
  actif: boolean
  /** false = suppression impossible quoi qu'il arrive (ex. catégorie système). */
  supprimable?: boolean
  raisonNonSupprimable?: string
  busy?: boolean
  onRenommer: (libelle: string) => void | Promise<void>
  onBasculer: () => void | Promise<void>
  onSupprimer: () => void | Promise<void>
}

/**
 * Ligne d'une liste de Paramètres : RENOMMER, MASQUER (disparaît des listes
 * de choix, reste sur l'existant) et SUPPRIMER — seulement si aucune écriture
 * ne l'utilise. Même fonctionnement pour les produits Carburant & consommables
 * et les catégories de charges.
 */
export function LigneParametre({
  libelle, extra, usages, unite, actif, supprimable = true, raisonNonSupprimable,
  busy = false, onRenommer, onBasculer, onSupprimer,
}: Props) {
  const [edition, setEdition] = useState<string | null>(null)

  const btn = `inline-flex items-center justify-center w-7 h-7 rounded-[var(--r-sm)]
    text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] transition-colors
    disabled:opacity-30 disabled:cursor-not-allowed`

  const peutSupprimer = supprimable && usages === 0
  const titreSupprimer = !supprimable
    ? (raisonNonSupprimable ?? 'Suppression impossible')
    : usages > 0
      ? `Utilisé par ${usages} ${usages > 1 ? unite[1] : unite[0]} — masque-le plutôt`
      : 'Supprimer'

  if (edition !== null) {
    return (
      <li className="flex items-center gap-1 py-2">
        <form
          className="flex items-center gap-1 flex-1"
          onSubmit={async e => {
            e.preventDefault()
            if (!edition.trim()) return
            await onRenommer(edition.trim())
            setEdition(null)
          }}
        >
          <input
            autoFocus value={edition} maxLength={60}
            onChange={e => setEdition(e.target.value)}
            className="field flex-1 w-auto text-[var(--fs-sm)] !py-1"
          />
          <button type="submit" className={btn} disabled={busy} title="Enregistrer"><Check size={13} /></button>
          <button type="button" className={btn} onClick={() => setEdition(null)} title="Annuler"><X size={13} /></button>
        </form>
      </li>
    )
  }

  return (
    <li className={`flex items-center gap-2 py-2 ${actif ? '' : 'opacity-50'}`}>
      <span className="text-[var(--fs-sm)] text-[var(--text)]">{libelle}</span>
      {extra}
      {!actif && <span className="text-[var(--fs-xs)] text-[var(--text-disabled)]">masqué</span>}
      <span className="ml-auto text-[var(--fs-xs)] text-[var(--text-disabled)] tabular-nums">
        {usages > 0 ? `${usages} ${usages > 1 ? unite[1] : unite[0]}` : ''}
      </span>
      <button className={btn} disabled={busy} title="Renommer" onClick={() => setEdition(libelle)}>
        <Pencil size={13} />
      </button>
      <button className={btn} disabled={busy}
        title={actif ? 'Masquer des listes de choix (reste sur l’existant)' : 'Afficher à nouveau'}
        onClick={() => void onBasculer()}>
        {actif ? <Eye size={13} /> : <EyeOff size={13} />}
      </button>
      <button className={`${btn} !text-[var(--danger)]`} disabled={busy || !peutSupprimer} title={titreSupprimer}
        onClick={() => void onSupprimer()}>
        <Trash2 size={13} />
      </button>
    </li>
  )
}
