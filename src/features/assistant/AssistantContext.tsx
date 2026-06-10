import { createContext, useContext, useState } from 'react'
import type { ReactNode, Dispatch, SetStateAction } from 'react'
import { GREETING } from './assistant.logic'

export interface AssistantMessage {
  role: 'user' | 'assistant'
  text: string
}

interface AssistantCtx {
  open: boolean
  setOpen: (v: boolean) => void
  messages: AssistantMessage[]
  setMessages: Dispatch<SetStateAction<AssistantMessage[]>>
  sending: boolean
  setSending: (v: boolean) => void
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

  return (
    <Ctx.Provider value={{ open, setOpen, messages, setMessages, sending, setSending }}>
      {children}
    </Ctx.Provider>
  )
}

export function useAssistant(): AssistantCtx {
  const c = useContext(Ctx)
  if (!c) throw new Error('useAssistant doit être utilisé dans <AssistantProvider>')
  return c
}
