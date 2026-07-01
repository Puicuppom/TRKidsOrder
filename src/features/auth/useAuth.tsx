import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'

export interface AppUser {
  id: string
  email: string | undefined
  username: string | null
  role: string | null
}

interface AuthState {
  session: Session | null
  user: AppUser | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | undefined>(undefined)

async function loadProfile(session: Session): Promise<AppUser> {
  // ดึงเฉพาะคอลัมน์ที่ใช้ (ไม่ใช่ select('*')) เพื่อประหยัด egress
  const { data } = await supabase
    .from('users')
    .select('username, role')
    .eq('id', session.user.id)
    .single()

  return {
    id: session.user.id,
    email: session.user.email,
    username: data?.username ?? null,
    role: data?.role ?? null,
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<AppUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    // เช็ค session ที่มีอยู่ตอนเปิดแอป
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!active) return
      if (session) setUser(await loadProfile(session))
      setSession(session)
      setLoading(false)
    })

    // ฟังการเปลี่ยนแปลง login/logout
    const { data: sub } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (!active) return
        setSession(session)
        setUser(session ? await loadProfile(session) : null)
      },
    )

    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const signIn: AuthState['signIn'] = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error ? error.message : null }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ session, user, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth ต้องอยู่ภายใน <AuthProvider>')
  return ctx
}
