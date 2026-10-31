import { createContext, useContext } from 'react'
import type { ArretColis } from '../../shared/lib/tourneesColis'

/** Ouvre la fiche « Modifier l'adresse » d'un arrêt (posée par Ma tournée, lue par la liste et la fiche d'arrêt). */
export const ContexteAdresse = createContext<((a: ArretColis) => void) | null>(null)
export const useModifierAdresse = () => useContext(ContexteAdresse)

/** Ouvre la feuille « Collecte » d'un arrêt (transformer en collecte / éclater) ; null = non proposé (tournée verrouillée). */
export const ContexteCollecte = createContext<((a: ArretColis) => void) | null>(null)
export const useTransformerCollecte = () => useContext(ContexteCollecte)

