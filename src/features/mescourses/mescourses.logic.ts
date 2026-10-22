// Libellés courts de l'espace salarié « Mes courses » — aucune dépendance DB ni DOM.

/** « 2026-10-12 » → « lun. 12 oct. » : tient dans l'en-tête à 390 px. */
export function libelleDateCourte(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(d)
}

const LIBELLE_CATEGORIE: Record<string, string> = {
  POD: 'Preuve de livraison',
  Chargement: 'Photo au chargement',
  Client: 'Document client',
  Administratif: 'Document administratif',
  Comptable: 'Document comptable',
  RH: 'Document RH',
  'Véhicule': 'Document véhicule',
  Autre: 'Document',
}

export function libelleCategorieDocument(categorie: string | null | undefined): string {
  return (categorie && LIBELLE_CATEGORIE[categorie]) || 'Document'
}
