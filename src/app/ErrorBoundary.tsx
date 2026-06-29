import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div
        className="min-h-screen flex items-center justify-center p-6"
        style={{ background: 'var(--bg)' }}
      >
        <div className="glass rounded-2xl p-10 flex flex-col items-center gap-6 max-w-sm w-full text-center">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center text-2xl"
            style={{ background: 'var(--brand-soft)', color: 'var(--brand)' }}
          >
            ✕
          </div>
          <div>
            <p
              className="font-display font-semibold text-lg mb-1"
              style={{ color: 'var(--text)' }}
            >
              MCA Logistics
            </p>
            <p style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-sm)' }}>
              Une erreur est survenue. L'équipe technique a été notifiée.
            </p>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="px-5 py-2 rounded-lg font-medium transition-colors"
            style={{
              background: 'var(--brand)',
              color: '#fff',
            }}
            onMouseOver={e => (e.currentTarget.style.background = 'var(--brand-hover)')}
            onMouseOut={e => (e.currentTarget.style.background = 'var(--brand)')}
          >
            Recharger la page
          </button>
        </div>
      </div>
    )
  }
}
