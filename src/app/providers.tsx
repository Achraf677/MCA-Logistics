import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient, User } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey)

// Capture du provider_refresh_token Google après une connexion Drive.
// Ce champ n'existe QUE dans l'événement qui suit l'échange OAuth (jamais dans getSession()).
// Listener au niveau module = en place avant la fin de l'échange (detectSessionInUrl).
if (typeof window !== 'undefined') {
  supabase.auth.onAuthStateChange((_event, session) => {
    const refresh = session?.provider_refresh_token
    // Aide au diagnostic (n'expose jamais le token, juste un booléen) :
    console.debug('[drive] auth event', _event, 'has_refresh', !!refresh,
      'flag', window.sessionStorage.getItem('mca_drive_connect'))
    if (refresh && window.sessionStorage.getItem('mca_drive_connect') === '1') {
      window.sessionStorage.removeItem('mca_drive_connect')
      supabase.functions
        .invoke('drive-connect', {
          body: { refresh_token: refresh, email: session?.user?.email ?? null },
        })
        .catch(() => { /* l'état réel reste visible via drive-status */ })
    }
  })
}

// ── Auth context ─────────────────────────────────────────
interface AuthCtx {
  user: User | null
  loading: boolean
}

const AuthContext = createContext<AuthCtx>({ user: null, loading: true })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null)
      setLoading(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  return <AuthContext.Provider value={{ user, loading }}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)

// ── Profile context ──────────────────────────────────────
export interface Profile {
  id: string
  company_id: string
  full_name: string
  role: 'president' | 'dg' | 'chauffeur' | 'comptable'
  email: string | null
  phone: string | null
  active: boolean
}

interface ProfileCtx {
  profile: Profile | null
  companyId: string | null
  loading: boolean
}

const ProfileContext = createContext<ProfileCtx>({ profile: null, companyId: null, loading: true })

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) { setProfile(null); setLoading(false); return }
    supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        setProfile(data ?? null)
        setLoading(false)
      })
  }, [user])

  return (
    <ProfileContext.Provider value={{ profile, companyId: profile?.company_id ?? null, loading }}>
      {children}
    </ProfileContext.Provider>
  )
}

export const useProfile = () => useContext(ProfileContext)
