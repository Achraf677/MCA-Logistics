import { initiales } from '../lib/initiales'

/** Pastille ronde aux initiales (client, fournisseur, déclarant…), aux couleurs de la marque. */
export function AvatarInitiales({ nom, taille = 'md', discret = false }: { nom: string; taille?: 'sm' | 'md' | 'lg'; discret?: boolean }) {
  const dim = taille === 'lg' ? 'h-11 w-11 text-sm' : taille === 'sm' ? 'h-6 w-6 text-[0.6875rem]' : 'h-9 w-9 text-xs'
  return (
    <span aria-hidden="true" className={`${dim} shrink-0 rounded-full font-semibold inline-flex items-center justify-center ${discret ? 'bg-[var(--text-muted)]/15 text-[var(--text-muted)]' : 'bg-[var(--brand)]/15 text-[var(--brand)]'}`}>
      {initiales(nom)}
    </span>
  )
}
