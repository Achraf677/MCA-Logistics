import { createContext, useContext, useState } from 'react'
import type { ReactNode, Dispatch, SetStateAction } from 'react'
import type { ExtractedDelivery } from '../copilote/copilote.types'

/** Message d'accueil affiché à l'ouverture du panneau. */
export const GREETING =
  'Bonjour 👋 Je suis l’assistant MCA. Pose-moi une question d’usage '
  + '(ex. « comment optimiser une tournée ») ou sur ton activité (ex. « quel est le CA du mois ? »).'

export interface AssistantMessage {
  role: 'user' | 'assistant'
  text: string
  /** Brouillon généré (mail/relance…) → affiche un bouton « Copier ». */
  draft?: boolean
}

/**
 * Action d'écriture en attente de confirmation (carte UI éphémère, générique).
 * `run()` exécute la vraie query d'écriture et renvoie le message à afficher.
 */
export interface PendingAction {
  title: string
  lines: { label: string; value: string }[]
  confirmLabel: string
  run: () => Promise<string>
}

interface AssistantCtx {
  open: boolean
  setOpen: (v: boolean) => void
  messages: AssistantMessage[]
  setMessages: Dispatch<SetStateAction<AssistantMessage[]>>
  sending: boolean
  setSending: (v: boolean) => void
  pendingAction: PendingAction | null
  setPendingAction: (a: PendingAction | null) => void
  /** Livraisons extraites d'une feuille de route, en attente d'import (6B-2). */
  extracted: ExtractedDelivery[] | null
  setExtracted: (d: ExtractedDelivery[] | null) => void
}

const Ctx = createContext<AssistantCtx | null>(null)

/**
 * État de conversation de l'assistant, monté AU-DESSUS du routeur (main.tsx).
 * Le Shell (et donc AssistantWidget) se remonte à chaque navigation ; en plaçant
 * l'état ici, la conversation SURVIT aux changements d'onglet.
 */
export function AssistantProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<AssistantMessage[]>([{ role: 'assistant', text: GREETING }])
  const [sending, setSending] = useState(false)
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)
  const [extracted, setExtracted] = useState<ExtractedDelivery[] | null>(null)

  return (
    <Ctx.Provider value={{
      open, setOpen, messages, setMessages, sending, setSending,
      pendingAction, setPendingAction, extracted, setExtracted,
    }}>
      {children}
    </Ctx.Provider>
  )
}

export function useAssistant(): AssistantCtx {
  const c = useContext(Ctx)
  if (!c) throw new Error('useAssistant doit être utilisé dans <AssistantProvider>')
  return c
}
