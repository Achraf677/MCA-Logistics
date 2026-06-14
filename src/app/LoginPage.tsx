import { useState } from 'react'
import { supabase } from './providers'
import { Button } from '../shared/ui/Button'

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  )
}

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    setLoading(false)
  }

  const handleGoogle = async () => {
    setGoogleLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) { setError(error.message); setGoogleLoading(false) }
    // On success the browser navigates away; no need to reset state
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg)]">
      <div className="w-full max-w-sm p-8 bg-[var(--bg-card)] rounded-[var(--r-xl)] border border-[var(--border)]">
        <h1 className="font-display font-bold text-[var(--brand)] text-2xl mb-1">MCA Logistics</h1>
        <p className="text-[var(--text-muted)] text-[var(--fs-sm)] mb-6">Connexion à votre espace</p>

        {/* Google OAuth */}
        <button
          type="button"
          onClick={handleGoogle}
          disabled={googleLoading || loading}
          className="w-full flex items-center justify-center gap-2 h-10 px-4 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text)] text-[var(--fs-body)] font-medium hover:bg-[var(--bg-card)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <GoogleIcon />
          {googleLoading ? 'Redirection…' : 'Se connecter avec Google'}
        </button>

        {/* Séparateur */}
        <div className="flex items-center gap-3 my-5">
          <div className="flex-1 h-px bg-[var(--border)]" />
          <span className="text-[var(--text-muted)] text-[var(--fs-sm)]">ou</span>
          <div className="flex-1 h-px bg-[var(--border)]" />
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-[var(--fs-sm)] text-[var(--text-muted)]" htmlFor="email">E-mail</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="h-9 px-3 rounded-[var(--r-md)] bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] text-[var(--fs-body)] focus:outline-none focus:border-[var(--brand)] transition-colors"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[var(--fs-sm)] text-[var(--text-muted)]" htmlFor="password">Mot de passe</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className="h-9 px-3 rounded-[var(--r-md)] bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] text-[var(--fs-body)] focus:outline-none focus:border-[var(--brand)] transition-colors"
            />
          </div>
          {error && <p className="text-[var(--danger)] text-[var(--fs-sm)]">{error}</p>}
          <Button variant="primary" type="submit" disabled={loading || googleLoading} className="w-full justify-center mt-1">
            {loading ? 'Connexion…' : 'Se connecter'}
          </Button>
        </form>
      </div>
    </div>
  )
}
