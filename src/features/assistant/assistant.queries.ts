import { supabase } from '../../app/providers'
import { SITE_KNOWLEDGE } from './assistant.knowledge'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

/** Tente de lire le corps JSON d'une erreur HTTP de Function (ex. 4xx/5xx). */
async function readFunctionErrorMessage(error: unknown): Promise<string | null> {
  const ctx = (error as { context?: unknown } | null)?.context
  if (ctx && typeof (ctx as Response).json === 'function') {
    try {
      const body = await (ctx as Response).json()
      return body?.data?.message ?? body?.message ?? body?.error ?? null
    } catch {
      // corps illisible : repli sur error.message
    }
  }
  return null
}

/**
 * Interroge l'assistant (Edge Function `assistant-chat`, IA Mistral).
 * Envoie l'historique complet, la base de connaissances du site et l'onglet courant.
 * Retourne le texte de réponse, ou lève une Error explicite.
 */
export async function askAssistant(messages: ChatMessage[], currentTab?: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('assistant-chat', {
    body: { messages, knowledge: SITE_KNOWLEDGE, currentTab },
  })

  if (error) {
    const msg = await readFunctionErrorMessage(error)
    throw new Error(msg ?? error.message)
  }

  const res = data as { ok?: boolean; data?: { reply?: string; message?: string }; error?: string; message?: string }
  if (!res?.ok) {
    throw new Error(res?.data?.message ?? res?.message ?? res?.error ?? 'Assistant indisponible')
  }
  return res.data?.reply ?? ''
}
