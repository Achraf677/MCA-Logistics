import { useEffect, useRef, useState } from 'react'
import { AlertCircle, ArrowRight, Eye, EyeOff, Loader2, Lock, Mail, ShieldCheck, Timer } from 'lucide-react'
import { supabase } from './providers'
import {
  apresEchec, ecrireEtat, ECHECS_AVANT_PAUSE, emailPlausible, formaterDuree,
  lireEtat, messageErreur, secondesRestantes,
} from './login.logic'

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

interface ChampProps {
  id: string
  label: string
  type: string
  value: string
  onChange: (v: string) => void
  icone: React.ReactNode
  autoComplete: string
  invalide?: boolean
  droite?: React.ReactNode
  onKeyState?: (e: React.KeyboardEvent) => void
  inputRef?: React.Ref<HTMLInputElement>
}

function Champ({ id, label, type, value, onChange, icone, autoComplete, invalide, droite, onKeyState, inputRef }: ChampProps) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-[var(--text-muted)] mb-1.5">{label}</label>
      <div className={`group relative flex items-center rounded-xl border bg-[var(--bg-elevated)] transition-all
        focus-within:border-[var(--brand)] focus-within:ring-4 focus-within:ring-[var(--brand-soft)]
        ${invalide ? 'border-[var(--danger)]' : 'border-[var(--border)]'}`}>
        <span className="pl-3.5 text-[var(--text-disabled)] group-focus-within:text-[var(--brand)] transition-colors">{icone}</span>
        <input
          id={id} ref={inputRef} type={type} value={value} required
          autoComplete={autoComplete} spellCheck={false} autoCapitalize="none"
          onChange={e => onChange(e.target.value)}
          onKeyDown={onKeyState} onKeyUp={onKeyState}
          aria-invalid={invalide || undefined}
          className="min-w-0 flex-1 h-12 px-3 bg-transparent text-[var(--text)] text-base outline-none placeholder:text-[var(--text-disabled)]"
        />
        {droite}
      </div>
    </div>
  )
}

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [voirMdp, setVoirMdp] = useState(false)
  const [majActive, setMajActive] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [envoiLien, setEnvoiLien] = useState(false)
  const [lienEnvoye, setLienEnvoye] = useState(false)
  const [secousse, setSecousse] = useState(0)
  const [etat, setEtat] = useState(lireEtat)
  const [maintenant, setMaintenant] = useState(() => Date.now())
  const [piege, setPiege] = useState('') // champ invisible : un humain ne le remplit jamais
  const carte = useRef<HTMLDivElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)

  const restant = secondesRestantes(etat, maintenant)
  const enPause = restant > 0

  // Décompte de la pause navigateur.
  useEffect(() => {
    if (!enPause) return
    const t = setInterval(() => setMaintenant(Date.now()), 500)
    return () => clearInterval(t)
  }, [enPause])

  useEffect(() => { emailRef.current?.focus() }, [])

  const suivreSouris = (e: React.PointerEvent) => {
    const r = carte.current?.getBoundingClientRect()
    if (!r) return
    carte.current!.style.setProperty('--mx', `${e.clientX - r.left}px`)
    carte.current!.style.setProperty('--my', `${e.clientY - r.top}px`)
  }

  const etatTouches = (e: React.KeyboardEvent) => setMajActive(e.getModifierState('CapsLock'))

  const echec = (message: string) => {
    const nouveau = apresEchec(etat, Date.now())
    setEtat(nouveau); ecrireEtat(nouveau); setMaintenant(Date.now())
    setError(message); setSecousse(n => n + 1)
  }

  /**
   * Demande d'un lien de réinitialisation. Message de retour VOLONTAIREMENT
   * identique que l'adresse existe ou non (sinon on révèle qui a un compte).
   */
  const demanderLien = async () => {
    if (!emailPlausible(email)) { setError('Saisis ton e-mail au-dessus, puis reclique.'); setSecousse(n => n + 1); return }
    setEnvoiLien(true); setError(null)
    await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/callback`,
    })
    setEnvoiLien(false)
    setLienEnvoye(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (piege || enPause || loading) return
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) {
      echec(messageErreur(error))
      setPassword('')
    } else {
      ecrireEtat({ echecs: 0, jusqua: 0 })
    }
    setLoading(false)
  }

  const handleGoogle = async () => {
    setGoogleLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) { setError(messageErreur(error)); setGoogleLoading(false) }
    // En cas de succès le navigateur quitte la page.
  }

  const occupe = loading || googleLoading
  const echecsRestants = ECHECS_AVANT_PAUSE - etat.echecs

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <main className="relative flex min-h-screen items-center justify-center px-4 py-10 sm:px-8 overflow-clip">
        <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[34rem] h-[34rem] rounded-full bg-[var(--brand-soft)] blur-3xl" />

        <div
          ref={carte}
          onPointerMove={suivreSouris}
          className="relative w-full max-w-md rounded-3xl border border-[var(--border)] bg-[var(--bg-card)] p-7 sm:p-9 shadow-[var(--shadow-card)] overflow-clip page-enter"
        >
          <div className="login-glow pointer-events-none absolute inset-0" />

          <div className="relative">
            {/* Marque */}
            <div className="flex flex-col items-center text-center mb-7">
              <span className="inline-grid place-items-center w-20 h-20 rounded-2xl bg-white mb-3 shadow-[0_0.4rem_1.5rem_-0.5rem_rgba(0,0,0,.35)]">
                <img src="/logo-mca.png" alt="MCA Logistics" className="w-16 h-16 object-contain" />
              </span>
              <h1 className="font-display font-bold text-[var(--text)] text-3xl leading-tight">Bon retour</h1>
              <p className="text-[var(--text-muted)] text-sm mt-1.5">Connecte-toi pour accéder à ton espace MCA Logistics.</p>
            </div>

            <button
              type="button" onClick={handleGoogle} disabled={occupe || enPause}
              className="w-full flex items-center justify-center gap-2.5 h-12 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]
                text-[var(--text)] font-medium hover:border-[var(--border-strong)] hover:-translate-y-px active:translate-y-0
                transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {googleLoading ? <Loader2 size={18} className="animate-spin" /> : <GoogleIcon />}
              {googleLoading ? 'Redirection…' : 'Continuer avec Google'}
            </button>

            <div className="flex items-center gap-3 my-6">
              <div className="flex-1 h-px bg-[var(--border)]" />
              <span className="text-[var(--text-disabled)] text-xs uppercase tracking-wide">ou par e-mail</span>
              <div className="flex-1 h-px bg-[var(--border)]" />
            </div>

            <form onSubmit={handleSubmit} className="relative flex flex-col gap-4">
              {/* Piège à robots : caché aux humains et aux lecteurs d'écran */}
              <input
                type="text" name="site_web" tabIndex={-1} autoComplete="off" aria-hidden="true"
                value={piege} onChange={e => setPiege(e.target.value)}
                className="absolute left-0 top-0 w-0 h-0 opacity-0 pointer-events-none"
              />

              <Champ
                id="email" label="E-mail" type="email" value={email} onChange={setEmail}
                icone={<Mail size={18} />} autoComplete="username" inputRef={emailRef}
              />

              <Champ
                id="password" label="Mot de passe" type={voirMdp ? 'text' : 'password'}
                value={password} onChange={setPassword} icone={<Lock size={18} />}
                autoComplete="current-password" onKeyState={etatTouches}
                invalide={!!error}
                droite={
                  <button
                    type="button" onClick={() => setVoirMdp(v => !v)}
                    aria-label={voirMdp ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                    aria-pressed={voirMdp}
                    className="mr-1.5 grid place-items-center w-9 h-9 rounded-lg text-[var(--text-muted)]
                      hover:text-[var(--text)] hover:bg-[var(--bg-card-hover)] transition-colors"
                  >
                    {voirMdp ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                }
              />

              {majActive && (
                <p className="flex items-center gap-2 text-sm text-[var(--warning)] -mt-2">
                  <AlertCircle size={15} /> Verrouillage majuscules activé
                </p>
              )}

              {error && (
                <div key={secousse} role="alert" className="login-shake flex items-start gap-2.5 rounded-xl border border-[var(--danger)]/40
                  bg-[var(--danger)]/10 px-3.5 py-3 text-sm text-[var(--danger)]">
                  <AlertCircle size={17} className="mt-0.5 shrink-0" />
                  <div>
                    <p>{error}</p>
                    {!enPause && etat.echecs >= 3 && echecsRestants > 0 && (
                      <p className="mt-1 text-xs opacity-80">
                        Encore {echecsRestants} essai{echecsRestants > 1 ? 's' : ''} avant une pause de sécurité.
                      </p>
                    )}
                  </div>
                </div>
              )}

              {enPause && (
                <div role="status" className="flex items-center gap-2.5 rounded-xl border border-[var(--warning)]/40 bg-[var(--warning)]/10 px-3.5 py-3 text-sm text-[var(--warning)]">
                  <Timer size={17} className="shrink-0" />
                  Trop d'essais. Nouvelle tentative possible dans <strong className="tabular-nums">{formaterDuree(restant)}</strong>.
                </div>
              )}

              <button
                type="submit" disabled={occupe || enPause || !email || !password}
                className="group relative h-12 rounded-xl font-semibold text-white overflow-hidden
                  bg-[linear-gradient(120deg,var(--brand-deep),var(--brand))] shadow-[0_0.6rem_1.6rem_-0.6rem_var(--brand)]
                  hover:-translate-y-px hover:shadow-[0_0.9rem_2rem_-0.6rem_var(--brand)] active:translate-y-0
                  transition-all disabled:opacity-50 disabled:shadow-none disabled:translate-y-0 disabled:cursor-not-allowed"
              >
                <span className="flex items-center justify-center gap-2">
                  {loading
                    ? <><Loader2 size={18} className="animate-spin" /> Connexion…</>
                    : enPause
                      ? <><Timer size={18} /> Patiente {formaterDuree(restant)}</>
                      : <>Se connecter <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" /></>}
                </span>
              </button>

              <div className="text-center min-h-5">
                {lienEnvoye ? (
                  <p className="text-sm text-[var(--success)]">
                    Si un compte existe pour cette adresse, un lien vient d'être envoyé (valable 1 h).
                  </p>
                ) : (
                  <button type="button" onClick={demanderLien} disabled={envoiLien || occupe}
                    className="text-sm text-[var(--text-muted)] hover:text-[var(--brand)] transition-colors disabled:opacity-50">
                    {envoiLien ? 'Envoi…' : 'Mot de passe oublié ?'}
                  </button>
                )}
              </div>
            </form>

            <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-[var(--text-disabled)]">
              <ShieldCheck size={13} /> Connexion chiffrée · tentatives surveillées
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}
