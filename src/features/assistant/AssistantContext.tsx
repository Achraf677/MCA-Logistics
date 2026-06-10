import { createContext, useContext, useState } from 'react'
import type { ReactNode, Dispatch, SetStateAction } from 'react'

/** Message d'accueil affiché à l'ouverture du panneau. */
export const GREETING =
  'Bonjour 👋 Je suis l’assistant MCA. Pose-moi une question d’usage '
  + '(ex. « comment optimiser une tournée ») ou sur ton activité (ex. « quel est le CA du mois ? »).'

export interface AssistantMessage {
  role: 'user' | 'assistant'
  text: string
}

/** Action d'écriture en attente de confirmation (carte UI éphémère). */
export interface PendingAction {
  recap: {
    client: string
    date: string
    montant_ht_eur: number | null
    type: string | null
    adresse: string | null
    ville: string | null
  }
  payload: unknown
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

  return (
    <Ctx.Provider value={{ open, setOpen, messages, setMessages, sending, setSending, pendingAction, setPendingAction }}>
      {children}
    </Ctx.Provider>
  )
}

export function useAssistant(): AssistantCtx {
  const c = useContext(Ctx)
  if (!c) throw new Error('useAssistant doit être utilisé dans <AssistantProvider>')
  return c
}
