import { useState, useRef, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { Sparkles, X, Send } from 'lucide-react'
import { useAssistant } from './AssistantContext'
import { askAssistant } from './assistant.queries'
import { tabLabelForPath } from './assistant.knowledge'

/**
 * Assistant flottant global (monté dans le Shell, présent sur toutes les pages).
 * ÉTAPE 3a : chat d'aide à l'usage connecté à l'IA (Edge Function `assistant-chat`,
 * Mistral). L'état de conversation vit dans <AssistantProvider> (au-dessus du
 * routeur) et SURVIT aux changements d'onglet.
 */
export function AssistantWidget() {
  const { open, setOpen, messages, setMessages, sending, setSending } = useAssistant()
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const location = useLocation()
  const currentTab = tabLabelForPath(location.pathname)

  // Auto-scroll vers le dernier message (et pendant l'indicateur de saisie).
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, open, sending])

  // Focus du champ à l'ouverture.
  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  // Fermeture sur Échap.
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [open, setOpen])

  const send = async () => {
    const text = input.trim()
    if (!text || sending) return

    const history = [...messages, { role: 'user' as const, text }]
    setMessages(history)
    setInput('')
    setSending(true)
    try {
      const reply = await askAssistant(
        history.map(m => ({ role: m.role, content: m.text })),
        currentTab,
      )
      setMessages(prev => [...prev, { role: 'assistant', text: reply || '(réponse vide)' }])
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', text: `⚠️ ${(e as Error).message}` }])
    } finally {
      setSending(false)
    }
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  return (
    <>
      {/* Bulle flottante — discrète au repos, nette au survol/focus */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Ouvrir l'assistant MCA"
          className="fixed z-[50] bottom-4 right-4 w-14 h-14 rounded-full
            bg-[var(--brand)] text-white flex items-center justify-center
            shadow-lg opacity-35 hover:opacity-100 focus:opacity-100
            hover:shadow-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]
            transition-all duration-200"
        >
          <Sparkles size={22} />
        </button>
      )}

      {/* Panneau de chat — plein écran sur mobile, ancré à droite sur desktop */}
      {open && (
        <div
          role="dialog"
          aria-label="Assistant MCA"
          className="fixed z-[55] inset-0 sm:inset-auto sm:bottom-4 sm:right-4
            sm:w-[400px] sm:h-[600px] sm:max-h-[calc(100vh-2rem)]
            bg-[var(--bg-elevated)] border border-[var(--border)] sm:rounded-[var(--r-lg)]
            shadow-2xl flex flex-col overflow-hidden
            animate-in fade-in slide-in-from-bottom-4 duration-200"
        >
          {/* En-tête */}
          <header className="flex items-center gap-2 px-4 h-[var(--topbar-h)] shrink-0
            border-b border-[var(--border)] bg-[var(--bg-elevated)]">
            <Sparkles size={16} className="text-[var(--brand)]" />
            <span className="font-display font-semibold text-[var(--text)]">Assistant MCA</span>
            {currentTab && (
              <span className="text-[var(--fs-xs)] text-[var(--text-disabled)] truncate">· {currentTab}</span>
            )}
            <button
              onClick={() => setOpen(false)}
              aria-label="Fermer l'assistant"
              className="ml-auto p-2 -mr-1.5 rounded-[var(--r-md)] text-[var(--text-muted)]
                hover:text-[var(--text)] hover:bg-[var(--bg-card-hover)] transition-colors"
            >
              <X size={18} />
            </button>
          </header>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
            {messages.map((m, i) => (
              <Bubble key={i} role={m.role} text={m.text} />
            ))}
            {sending && <TypingBubble />}
          </div>

          {/* Saisie */}
          <div className="shrink-0 border-t border-[var(--border)] p-3 flex items-end gap-2">
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              disabled={sending}
              placeholder={sending ? 'Réponse en cours…' : "Pose une question d'usage…"}
              className="flex-1 min-h-[44px] px-3 rounded-[var(--r-md)] bg-[var(--bg)]
                border border-[var(--border)] text-[var(--text)] text-[var(--fs-body)]
                focus:outline-none focus:border-[var(--brand)] transition-colors
                disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <button
              onClick={send}
              disabled={!input.trim() || sending}
              aria-label="Envoyer"
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-[var(--r-md)]
                bg-[var(--brand)] text-white hover:bg-[var(--brand-hover)]
                disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Send size={18} />
            </button>
          </div>
        </div>
      )}
    </>
  )
}

function Bubble({ role, text }: { role: 'user' | 'assistant'; text: string }) {
  const isUser = role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] px-3.5 py-2 rounded-[var(--r-lg)] text-[var(--fs-sm)] whitespace-pre-wrap leading-relaxed
          ${isUser
            ? 'bg-[var(--brand)] text-white rounded-br-sm'
            : 'bg-[var(--bg-card)] text-[var(--text)] border border-[var(--border)] rounded-bl-sm'}`}
      >
        {renderMarkdownBold(text)}
      </div>
    </div>
  )
}

/** Indicateur « l'assistant rédige » pendant l'appel IA. */
function TypingBubble() {
  return (
    <div className="flex justify-start">
      <div className="px-3.5 py-2.5 rounded-[var(--r-lg)] rounded-bl-sm bg-[var(--bg-card)] border border-[var(--border)]">
        <span className="flex items-center gap-1">
          {[0, 150, 300].map(d => (
            <span
              key={d}
              className="w-1.5 h-1.5 rounded-full bg-[var(--text-muted)] animate-bounce"
              style={{ animationDelay: `${d}ms` }}
            />
          ))}
        </span>
      </div>
    </div>
  )
}

/** Rendu minimal du gras `**…**` (pas de lib markdown). */
function renderMarkdownBold(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((p, i) =>
    p.startsWith('**') && p.endsWith('**')
      ? <strong key={i} className="font-semibold">{p.slice(2, -2)}</strong>
      : <span key={i}>{p}</span>,
  )
}
