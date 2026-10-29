import type { ReactNode } from 'react'
import { Pencil } from 'lucide-react'
import { Bloc } from '../../shared/ui/FicheSaisie'
import { Button } from '../../shared/ui/Button'

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
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2.5 text-sm">
          {lignes.map(l => (
            <div key={l.libelle} className="contents">
              <dt className="text-[var(--text-muted)]">{l.libelle}</dt>
              <dd className="text-[var(--text)] min-w-0 break-words">{l.valeur || <span className="text-[var(--text-disabled)]">Non renseigné</span>}</dd>
            </div>
          ))}
        </dl>
      )}
    </Bloc>
  )
}
