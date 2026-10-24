/** Initiales d'un nom (2 lettres au plus) pour une pastille ; « ? » si le nom est vide. */
export const initiales = (nom: string): string =>
  nom.split(/\s+/).filter(Boolean).slice(0, 2).map(m => m[0]?.toUpperCase() ?? '').join('') || '?'
