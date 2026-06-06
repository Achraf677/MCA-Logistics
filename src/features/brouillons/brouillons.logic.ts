import { DRAFT_TYPE_LABELS } from './brouillons.types'
import type { DraftType } from './brouillons.types'

// Fonctions pures : libellés des types (sans DB ni DOM).

export function draftTypeLabel(type: DraftType): string {
  return DRAFT_TYPE_LABELS[type]
}

export const DRAFT_TYPES: DraftType[] = ['relance', 'email', 'annonce', 'libre']
