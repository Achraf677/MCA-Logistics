import type { ReactNode } from 'react'

/**
 * Etiquette + champ, empiles.
 *
 * Ce composant etait recopie a l'identique dans 13 fichiers. Il vit
 * desormais ici, en un seul exemplaire.
 *
 * L'etiquette n'est plus en MAJUSCULES : retour utilisateur « les formes
 * trop rigides, ca donne pas envie d'etre complete ». Une colonne de
 * capitales espacees se lit comme un formulaire administratif. En casse
 * normale, un peu plus contrastee, elle se lit comme une question posee.
 *
 * `htmlFor` est volontairement absent : les 13 appelants passent leur
 * champ en `children` sans lui donner d'identifiant. Le `<label>` reste
 * neanmoins utile — cliquer dessus donne le focus au champ qu'il
 * enveloppe. Le jour ou les champs auront un `id`, ce sera ici, et ici
 * seulement, qu'il faudra l'ajouter.
 */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[var(--fs-xs)] font-medium text-[var(--text-muted)] tracking-normal">
        {label}
      </span>
      {children}
    </label>
  )
}
