import { useState, useRef, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { Sparkles, X, Send, Check, Paperclip } from 'lucide-react'
import { useAssistant } from './AssistantContext'
import type { PendingAction } from './AssistantContext'
import { runAssistantTurn } from './assistant.queries'
import {
  prepareCreateLivraison, prepareChangerStatutLivraison,
  prepareCreateCharge, prepareCreateClient, prepareModifierClient, prepareCreatePlein, prepareCreateIncident,
  prepareCreateFournisseur, prepareCreateVehicule, runGenererMail, runExtractDeliveries,
  prepareImportLivraisons, prepareModifierLivraison,
} from './assistant.tools'
import type { PrepareResult, GenererMailArgs } from './assistant.tools'

const MAX_FILE_BYTES = 10 * 1024 * 1024 // ~10 Mo

function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Lecture du fichier impossible'))
    reader.readAsDataURL(file)
  })
}

// Routage des 9 outils d'ÉCRITURE → leur préparateur. Doit couvrir TOUTES les
// actions de WRITE_TOOLS (assistant.queries.ts). Une action absente d'ici =
// « Action non prise en charge » côté UI.
const ACTION_PREPARERS: Record<string, (args: unknown) => Promise<PrepareResult>> = {
  create_livraison:         (a) => prepareCreateLivraison(a as never),
  changer_statut_livraison: (a) => prepareChangerStatutLivraison(a as never),
  create_charge:            (a) => prepareCreateCharge(a as never),
  create_client:            (a) => prepareCreateClient(a as never),
  modifier_client:          (a) => prepareModifierClient(a as never),
  modifier_livraison:       (a) => prepareModifierLivraison(a as never),
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
    pendingAction, setPendingAction, extracted, setExtracted,
  } = useAssistant()
  const [input, setInput] = useState('')
  const [statusLabel, setStatusLabel] = useState<string | null>(null)
  const [chooseStatut, setChooseStatut] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
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
      } else if (result.kind === 'draft') {
        // Rédaction : aucune écriture, pas de carte — on affiche le brouillon (avec « Copier »).
        const r = await runGenererMail(result.args as GenererMailArgs)
        if (r.ok) setMessages(prev => [...prev, { role: 'assistant', text: r.text, draft: true }])
        else pushAssistant(r.message)
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

  // ── Joindre une feuille de route → OCR/extraction → affichage ────────────────
  const onPickFile = () => fileInputRef.current?.click()

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // permet de re-sélectionner le même fichier
    if (!file || blocked) return
    if (file.size > MAX_FILE_BYTES) {
      pushAssistant('❌ Fichier trop volumineux (max ~10 Mo). Réessaie avec une version plus légère.')
      return
    }

    let base64: string
    try {
      const dataUrl = await readDataUrl(file)
      const comma = dataUrl.indexOf(',')
      base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl
    } catch {
      pushAssistant('❌ Lecture du fichier impossible.')
      return
    }
    const mimeType = file.type || 'application/octet-stream'

    setMessages(prev => [...prev, { role: 'user', text: `📎 Feuille de route : ${file.name}` }])
    setSending(true)
    setStatusLabel('Lecture de la feuille de route…')
    try {
      const r = await runExtractDeliveries(base64, mimeType)
      if (r.ok) { pushAssistant(r.text); setExtracted(r.deliveries) } // stockées pour l'import (6B-2)
      else pushAssistant(r.message)
    } catch (err) {
      pushAssistant(`⚠️ ${(err as Error).message}`)
    } finally {
      setSending(false)
      setStatusLabel(null)
    }
  }

  // ── Import en lot des livraisons extraites : choix du statut → carte ─────────
  const pickStatut = async (statut: 'planifiee' | 'livree') => {
    if (!extracted) return
    setChooseStatut(false)
    setSending(true)
    setStatusLabel('Préparation de l’import…')
    try {
      const prep = await prepareImportLivraisons(extracted, statut)
      if (!prep.ok) pushAssistant(prep.message)
      else setPendingAction(prep.action)
    } catch (e) {
      pushAssistant(`⚠️ ${(e as Error).message}`)
    } finally {
      setExtracted(null)
      setSending(false)
      setStatusLabel(null)
    }
  }

  const cancelImport = () => { setChooseStatut(false); setExtracted(null) }

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
              <Bubble key={i} role={m.role} text={m.text} draft={m.draft} />
            ))}
            {sending && <TypingBubble label={statusLabel ?? undefined} />}
          </div>

          {/* Carte de confirmation — HORS du flux scrollable (shrink-0) pour ne JAMAIS
              bloquer le scroll des messages au-dessus. Hauteur bornée + scroll interne. */}
          {pendingAction && (
            <div className="shrink-0 max-h-[40%] overflow-y-auto border-t border-[var(--border)] p-3">
              <ActionCard
                action={pendingAction}
                busy={sending}
                onConfirm={confirmAction}
                onCancel={cancelAction}
              />
            </div>
          )}

          {/* Import OCR : bouton « Créer ces N livraisons » puis choix du statut (hors scroll) */}
          {!pendingAction && extracted && extracted.length > 0 && (
            <div className="shrink-0 border-t border-[var(--border)] p-3">
              {!chooseStatut ? (
                <button
                  onClick={() => setChooseStatut(true)}
                  disabled={sending}
                  className="w-full min-h-[44px] rounded-[var(--r-md)] bg-[var(--brand)] text-white font-medium
                    hover:bg-[var(--brand-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Créer ces {extracted.length} livraison{extracted.length > 1 ? 's' : ''}
                </button>
              ) : (
                <div className="flex flex-col gap-2">
                  <span className="text-[var(--fs-sm)] text-[var(--text-muted)]">Statut des livraisons à créer ?</span>
                  <div className="flex gap-2">
                    <button onClick={() => pickStatut('planifiee')} disabled={sending}
                      className="flex-1 min-h-[44px] rounded-[var(--r-md)] bg-[var(--brand)] text-white font-medium
                        hover:bg-[var(--brand-hover)] disabled:opacity-50 transition-colors">
                      Planifiée
                    </button>
                    <button onClick={() => pickStatut('livree')} disabled={sending}
                      className="flex-1 min-h-[44px] rounded-[var(--r-md)] bg-[var(--brand)] text-white font-medium
                        hover:bg-[var(--brand-hover)] disabled:opacity-50 transition-colors">
                      Livrée
                    </button>
                    <button onClick={cancelImport} disabled={sending}
                      className="min-h-[44px] px-4 rounded-[var(--r-md)] border border-[var(--border-soft)]
                        text-[var(--text)] hover:bg-[var(--bg-card-hover)] disabled:opacity-50 transition-colors">
                      Annuler
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Saisie */}
          <div className="shrink-0 border-t border-[var(--border)] p-3 flex items-end gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={handleFile}
            />
            <button
              onClick={onPickFile}
              disabled={blocked}
              aria-label="Joindre une feuille de route"
              title="Joindre une feuille de route (image ou PDF)"
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-[var(--r-md)]
                text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg-card-hover)]
                disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Paperclip size={18} />
            </button>
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

function Bubble({ role, text, draft }: { role: 'user' | 'assistant'; text: string; draft?: boolean }) {
  const isUser = role === 'user'
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard indisponible : on ignore silencieusement */
    }
  }

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] px-3.5 py-2 rounded-[var(--r-lg)] text-[var(--fs-sm)] whitespace-pre-wrap break-words leading-relaxed
          ${isUser
            ? 'bg-[var(--brand)] text-white rounded-br-sm'
            : 'bg-[var(--bg-card)] text-[var(--text)] border border-[var(--border)] rounded-bl-sm'}`}
      >
        {renderMarkdownBold(text)}
        {draft && (
          <div className="mt-2 pt-2 border-t border-[var(--border)]">
            <button
              onClick={copy}
              className="inline-flex items-center gap-1.5 text-[var(--fs-xs)] text-[var(--text-muted)]
                hover:text-[var(--text)] transition-colors"
            >
              <Check size={13} className={copied ? 'opacity-100' : 'opacity-0 -mr-4'} />
              {copied ? 'Copié' : 'Copier'}
            </button>
          </div>
        )}
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

/** Indicateur d'attente (IA qui rédige / OCR en cours), avec libellé optionnel. */
function TypingBubble({ label }: { label?: string }) {
  return (
    <div className="flex justify-start">
      <div className="px-3.5 py-2.5 rounded-[var(--r-lg)] rounded-bl-sm bg-[var(--bg-card)] border border-[var(--border)] flex items-center gap-2">
        <span className="flex items-center gap-1">
          {[0, 150, 300].map(d => (
            <span
              key={d}
              className="w-1.5 h-1.5 rounded-full bg-[var(--text-muted)] animate-bounce"
              style={{ animationDelay: `${d}ms` }}
            />
          ))}
        </span>
        {label && <span className="text-[var(--fs-xs)] text-[var(--text-muted)]">{label}</span>}
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
