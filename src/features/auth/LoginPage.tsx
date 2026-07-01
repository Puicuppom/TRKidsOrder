import { useState, type FormEvent } from 'react'
import { useAuth } from './useAuth'

export default function LoginPage() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    const { error } = await signIn(email, password)
    setBusy(false)
    if (error) setError('เข้าสู่ระบบไม่สำเร็จ: ' + error)
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-slate-100 p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-lg"
      >
        <h1 className="mb-6 text-center text-xl font-bold text-slate-800">
          ระบบจัดการออร์เดอร์
        </h1>

        <label className="mb-1 block text-sm text-slate-600">อีเมล</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="username"
          className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-violet-500"
        />

        <label className="mb-1 block text-sm text-slate-600">รหัสผ่าน</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-violet-500"
        />

        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-violet-600 py-2 font-semibold text-white transition hover:bg-violet-700 disabled:opacity-50"
        >
          {busy ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
        </button>
      </form>
    </div>
  )
}
