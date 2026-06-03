import { useState } from 'react'
import { supabase } from './providers'
import { Button } from '../shared/ui/Button'

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg)]">
      <div className="w-full max-w-sm p-8 bg-[var(--bg-card)] rounded-[var(--r-xl)] border border-[var(--border)]">
        <h1 className="font-display font-bold text-[var(--brand)] text-2xl mb-1">MCA Logistics</h1>
        <p className="text-[var(--text-muted)] text-[var(--fs-sm)] mb-6">Connexion à votre espace</p>

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
          <Button variant="primary" type="submit" disabled={loading} className="w-full justify-center mt-1">
            {loading ? 'Connexion…' : 'Se connecter'}
          </Button>
        </form>
      </div>
    </div>
  )
}
