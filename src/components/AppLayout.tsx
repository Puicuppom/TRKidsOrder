import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../features/auth/useAuth'

const nav = [
  { to: '/', label: 'ออร์เดอร์', icon: '📝', end: true },
  { to: '/packing', label: 'แพ็ค/สแกน', icon: '📦' },
  { to: '/transport', label: 'ขนส่ง', icon: '🚚' },
  { to: '/planner', label: 'สรุปแผน', icon: '🗓️' },
  { to: '/plan', label: 'จัดคิวผลิต', icon: '🏭' },
  { to: '/products', label: 'สินค้า', icon: '🏷️' },
  { to: '/patterns', label: 'ลายการ์ตูน', icon: '🖼️' },
  { to: '/reports', label: 'รายงาน', icon: '📈' },
  { to: '/accounting', label: 'บัญชี', icon: '📊' },
]

export default function AppLayout() {
  const { user, signOut } = useAuth()

  return (
    <div className="min-h-svh bg-slate-50">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
        <div className="flex items-center gap-6">
          <span className="font-bold text-slate-800">ORDER APP</span>
          <nav className="flex gap-1">
            {nav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-1.5 text-sm transition ${
                    isActive
                      ? 'bg-violet-100 font-semibold text-violet-700'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`
                }
              >
                <span className="mr-1">{item.icon}</span>
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-slate-500">
            {user?.username ?? user?.email}
            {user?.role && (
              <span className="ml-2 rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                {user.role}
              </span>
            )}
          </span>
          <button
            onClick={signOut}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-slate-600 transition hover:bg-slate-100"
          >
            ออกจากระบบ
          </button>
        </div>
      </header>

      <main className="overflow-x-hidden p-6">
        <Outlet />
      </main>
    </div>
  )
}
