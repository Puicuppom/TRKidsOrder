import type { ReactNode } from 'react'
import { useAuth } from './useAuth'
import LoginPage from './LoginPage'

export default function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center text-slate-500">
        กำลังโหลด...
      </div>
    )
  }

  if (!session) return <LoginPage />

  return <>{children}</>
}
