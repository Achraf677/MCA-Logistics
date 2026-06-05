export type DraftType = 'relance' | 'email' | 'annonce' | 'libre'

export const DRAFT_TYPE_LABELS: Record<DraftType, string> = {
  relance: 'Relance impayé',
  email:   'Email client',
  annonce: 'Annonce recrutement',
  libre:   'Libre',
}
