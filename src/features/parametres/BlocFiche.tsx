import type { ReactNode } from 'react'
import { Pencil } from 'lucide-react'
import { Bloc } from '../../shared/ui/FicheSaisie'
import { Button } from '../../shared/ui/Button'

// Une ligne de cellules (libellé au-dessus de la valeur), en autant de colonnes que de valeurs : les blocs restent bas, un par ligne.
const COLONNES: Record<number, string> = {
  0: 'grid-cols-1', 1: 'grid-cols-1', 2: 'grid-cols-2', 3: 'grid-cols-2 md:grid-cols-3',
  4: 'grid-cols-2 md:grid-cols-4', 5: 'grid-cols-2 md:grid-cols-3 xl:grid-cols-5',
}

export interface LigneLecture { libelle: string; valeur: ReactNode }

/**
 * Bloc de fiche en deux états : lecture (valeurs figées, rien à toucher par erreur) puis, au clic sur « Modifier »,
 * les champs. Les données légales de la société ne se changent pas par accident.
 */
export function BlocFiche({ titre, icone, lignes, enEdition, onModifier, peutModifier, children }: {
  titre: string
  icone?: ReactNode
  lignes: LigneLecture[]
  enEdition: boolean
  onModifier: () => void
  peutModifier: boolean
  /** Les champs, affichés seulement en édition. */
  children: ReactNode
}) {
  return (
    <Bloc titre={titre} icone={icone}
      droite={peutModifier && !enEdition ? <Button variant="ghost" size="compact" onClick={onModifier}><Pencil size={13} /> Modifier</Button> : undefined}>
      {enEdition ? children : (
        <dl className={`grid gap-x-6 gap-y-3 ${COLONNES[Math.min(lignes.length, 5)]}`}>
          {lignes.map(l => (
            <div key={l.libelle} className="min-w-0">
              <dt className="text-xs text-[var(--text-muted)]">{l.libelle}</dt>
              <dd className="text-sm text-[var(--text)] min-w-0 break-words">{l.valeur || <span className="text-[var(--text-disabled)]">Non renseigné</span>}</dd>
            </div>
          ))}
        </dl>
      )}
    </Bloc>
  )
}
