import { useState, useRef, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { Sparkles, X, Send, Check } from 'lucide-react'
import { useAssistant } from './AssistantContext'
import type { PendingAction } from './AssistantContext'
import { runAssistantTurn } from './assistant.queries'
import {
  prepareCreateLivraison, prepareChangerStatutLivraison,
  prepareCreateCharge, prepareCreateClient, prepareCreatePlein, prepareCreateIncident,
  prepareCreateFournisseur, prepareCreateVehicule,
} from './assistant.tools'
import type { PrepareResult } from './assistant.tools'

// Routage des 8 outils d'ÉCRITURE → leur préparateur. Doit couvrir TOUTES les
// actions de WRITE_TOOLS (assistant.queries.ts). Une action absente d'ici =
// « Action non prise en charge » côté UI.
const ACTION_PREPARERS: Record<string, (args: unknown) => Promise<PrepareResult>> = {
  create_livraison:         (a) => prepareCreateLivraison(a as never),
  changer_statut_livraison: (a) => prepareChangerStatutLivraison(a as never),
  create_charge:            (a) => prepareCreateCharge(a as never),
  create_client:            (a) => prepareCreateClient(a as never),
  create_plein:             (a) => prepareCreatePlein(a as never),
  create_incident:          (a) => prepareCreateIncident(a as never),
  create_fournisseur:       (a) => prepareCreateFournisseur(a as never),
  create_vehicule:          (a) => prepareCreateVehicule(a as never),
}
import { tabLabelForPath } from './assistant.knowledge'

/**
 * Assistant flottant global (monté dans le Shell, présent sur toutes les pages).
 * Chat d'aide à l'usage + outils de lecture connectés à l'IA (assistant-chat,
 * Mistral) + actions d'écriture avec confirmation (étape 5-1). L'état de
 * conversation vit dans <AssistantProvider> (au-dessus du routeur) et survit à la navigation.
 */
export function AssistantWidget() {
  const {
    open, setOpen, messages, setMessages, sending, setSending,
    pendingAction, setPendingAction,
  } = useAssistant()
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  // L'utilisateur est-il « collé » au bas du fil ? (sinon on ne force pas le scroll)
  const pinned = useRef(true)

  const location = useLocation()
  const currentTab = tabLabelForPath(location.pathname)

  const pushAssistant = (text: string) => setMessages(prev => [...prev, { role: 'assistant', text }])
  const blocked = sending || pendingAction !== null

  const onMessagesScroll = () => {
    const el = scrollRef.current
    if (!el) return
    pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }

  // Auto-scroll vers le bas à l'arrivée d'un message/carte, MAIS seulement si
  // l'utilisateur n'a pas remonté volontairement (pinned). Remontée libre conservée.
  useEffect(() => {
    if (open && pinned.current) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
    }
  }, [messages, sending, pendingAction, open])

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
    if (!text || blocked) return

    const history = [...messages, { role: 'user' as const, text }]
    setMessages(history)
    setInput('')
    setSending(true)
    try {
      // L'historique persistant reste en messages d'AFFICHAGE (user/assistant texte).
      const result = await runAssistantTurn(history, currentTab)
      if (result.kind === 'text') {
        pushAssistant(result.text || '(réponse vide)')
      } else {
        // Action d'écriture : on prépare et on demande confirmation (jamais exécutée auto).
        const preparer = ACTION_PREPARERS[result.tool]
        if (!preparer) {
          pushAssistant(`Action non prise en charge : ${result.tool}.`)
        } else {
          const prep = await preparer(result.args)
          if (!prep.ok) pushAssistant(prep.message)
          else setPendingAction(prep.action)
        }
      }
    } catch (e) {
      pushAssistant(`⚠️ ${(e as Error).message}`)
    } finally {
      setSending(false)
    }
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  // ── Confirmation / annulation d'une action d'écriture ────────────────────────
  const confirmAction = async () => {
    if (!pendingAction) return
    setSending(true)
    try {
      const msg = await pendingAction.run() // exécute la vraie query (création / transition)
      pushAssistant(msg)
    } catch (e) {
      pushAssistant(`❌ ${(e as Error).message}`)
    } finally {
      setPendingAction(null)
      setSending(false)
    }
  }

  const cancelAction = () => {
    pushAssistant('Action annulée.')
    setPendingAction(null)
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

          {/* Messages — flex-1 + min-h-0 INDISPENSABLE pour que l'enfant se compresse et défile.
              Sans min-h-0 dans un parent flex-col, le contenu déborde au lieu de scroller. */}
          <div
            ref={scrollRef}
            onScroll={onMessagesScroll}
            className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 flex flex-col gap-3"
          >
            {messages.map((m, i) => (
              <Bubble key={i} role={m.role} text={m.text} />
            ))}
            {sending && <TypingBubble />}
            {pendingAction && (
              <ActionCard
                action={pendingAction}
                busy={sending}
                onConfirm={confirmAction}
                onCancel={cancelAction}
              />
            )}
          </div>

          {/* Saisie */}
          <div className="shrink-0 border-t border-[var(--border)] p-3 flex items-end gap-2">
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              disabled={blocked}
              placeholder={
                pendingAction ? 'Confirme ou annule l’action ci-dessus…'
                : sending ? 'Réponse en cours…'
                : "Pose une question d'usage…"
              }
              className="flex-1 min-h-[44px] px-3 rounded-[var(--r-md)] bg-[var(--bg)]
                border border-[var(--border)] text-[var(--text)] text-[var(--fs-body)]
                focus:outline-none focus:border-[var(--brand)] transition-colors
                disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <button
              onClick={send}
              disabled={!input.trim() || blocked}
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
        className={`max-w-[85%] px-3.5 py-2 rounded-[var(--r-lg)] text-[var(--fs-sm)] whitespace-pre-wrap break-words leading-relaxed
          ${isUser
            ? 'bg-[var(--brand)] text-white rounded-br-sm'
            : 'bg-[var(--bg-card)] text-[var(--text)] border border-[var(--border)] rounded-bl-sm'}`}
      >
        {renderMarkdownBold(text)}
      </div>
    </div>
  )
}

/** Carte de confirmation générique (exécution UNIQUEMENT au clic Confirmer). */
function ActionCard({
  action, busy, onConfirm, onCancel,
}: {
  action: PendingAction
  busy: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="rounded-[var(--r-lg)] border border-[var(--brand)]/40 bg-[var(--bg-card)] overflow-hidden">
      <div className="px-3.5 py-2 border-b border-[var(--border)] bg-[var(--brand-soft)]">
        <span className="font-display font-semibold text-[var(--text)] text-[var(--fs-sm)]">{action.title}</span>
      </div>
      <dl className="px-3.5 py-2.5 flex flex-col gap-1">
        {action.lines.map(({ label, value }) => (
          <div key={label} className="flex justify-between gap-3 text-[var(--fs-sm)]">
            <dt className="text-[var(--text-muted)] shrink-0">{label}</dt>
            <dd className="text-[var(--text)] text-right truncate">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="flex items-center gap-2 px-3.5 pb-3 pt-1">
        <button
          onClick={onConfirm}
          disabled={busy}
          className="inline-flex items-center justify-center gap-1.5 min-h-[40px] flex-1 rounded-[var(--r-md)]
            bg-[var(--success)] text-white font-medium hover:opacity-90 transition-opacity
            disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Check size={15} /> {busy ? 'En cours…' : action.confirmLabel}
        </button>
        <button
          onClick={onCancel}
          disabled={busy}
          className="min-h-[40px] px-4 rounded-[var(--r-md)] border border-[var(--border-soft)]
            text-[var(--text)] hover:bg-[var(--bg-card-hover)] transition-colors
            disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Annuler
        </button>
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
