import { createContext, useContext, useState, useCallback } from 'react'
import type { ReactNode } from 'react'
import { CheckCircle, AlertCircle, X } from 'lucide-react'

type ToastType = 'success' | 'error'

interface Toast {
  id: number
  type: ToastType
  message: string
}

interface ToastCtx {
  toast: (message: string, type?: ToastType) => void
}

const ToastContext = createContext<ToastCtx>({ toast: () => {} })

let nextId = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const toast = useCallback((message: string, type: ToastType = 'success') => {
    const id = ++nextId
    setToasts(prev => [...prev, { id, type, message }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500)
  }, [])

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* Toast container */}
      <div
        className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none"
        aria-live="polite"
        aria-label="Notifications"
      >
        {toasts.map(t => (
          <div
            key={t.id}
            className={`flex items-center gap-2.5 px-4 py-2.5 rounded-[var(--r-lg)] border shadow-lg pointer-events-auto text-[var(--fs-sm)] font-medium
              ${t.type === 'success'
                ? 'bg-[var(--bg-card)] border-[var(--success)]/30 text-[var(--text)]'
                : 'bg-[var(--bg-card)] border-[var(--danger)]/30 text-[var(--text)]'}`}
          >
            {t.type === 'success'
              ? <CheckCircle size={14} className="text-[var(--success)] shrink-0" />
              : <AlertCircle size={14} className="text-[var(--danger)] shrink-0" />}
            {t.message}
            <button
              onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
              className="ml-1 text-[var(--text-disabled)] hover:text-[var(--text)] transition-colors"
              aria-label="Fermer"
            >
              <X size={12} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)
