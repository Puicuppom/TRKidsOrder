import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/useAuth'
import { usePlanSettings, usePlanJobs } from './usePlan'
import PlanDashboard from './PlanDashboard'
import PlanDepartments from './PlanDepartments'
import PlanSettingsView from './PlanSettings'

const LOCK_PASS = 'TRkids@999'
const today = () => new Date().toISOString().slice(0, 10)

type View = 'dash' | 'dept' | 'set'

export default function PlanPage() {
  const qc = useQueryClient()
  const { user } = useAuth()
  const isSuper = user?.role === 'superadmin'
  const [date, setDate] = useState(today())
  const [view, setView] = useState<View>('dash')
  const [unlocked, setUnlocked] = useState(isSuper)

  // superadmin ปลดล็อกอัตโนมัติ
  useEffect(() => {
    if (isSuper) setUnlocked(true)
  }, [isSuper])

  const { data: settings } = usePlanSettings()
  const { data: jobs = [], isLoading } = usePlanJobs(date)

  const refreshJobs = () => qc.invalidateQueries({ queryKey: ['plan', 'jobs'] })
  const refreshSettings = () => qc.invalidateQueries({ queryKey: ['plan', 'settings'] })

  function toggleLock() {
    if (unlocked) return setUnlocked(false)
    const p = prompt('ใส่รหัสปลดล็อกเพื่อแก้ไข:')
    if (p === LOCK_PASS) setUnlocked(true)
    else if (p !== null) alert('รหัสไม่ถูกต้อง')
  }

  const tabs: { key: View; label: string }[] = [
    { key: 'dash', label: '📊 Dashboard' },
    { key: 'dept', label: '🏭 หน้าแผนก' },
    { key: 'set', label: '⚙️ ตั้งค่า' },
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-bold text-slate-800">แผนผลิต (Production Planner)</h1>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
        />
        {isSuper ? (
          <span className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white">
            🔓 superadmin (แก้ไขได้)
          </span>
        ) : (
          <button
            onClick={toggleLock}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              unlocked ? 'bg-green-600 text-white' : 'bg-slate-200 text-slate-700'
            }`}
          >
            {unlocked ? '🔓 ปลดล็อกแล้ว' : '🔒 ล็อกอยู่ (กดปลดล็อก)'}
          </button>
        )}
        {isLoading && <span className="text-sm text-slate-400">กำลังโหลด...</span>}
      </div>

      <div className="flex flex-wrap gap-1 border-b border-slate-200">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setView(t.key)}
            className={`rounded-t-lg px-4 py-2 text-sm ${
              view === t.key
                ? 'border-b-2 border-violet-600 font-semibold text-violet-700'
                : 'text-slate-500 hover:bg-slate-100'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {view === 'dash' && settings && (
        <PlanDashboard settings={settings} jobs={jobs} date={date} unlocked={unlocked} onChanged={refreshJobs} />
      )}
      {view === 'dept' && settings && (
        <PlanDepartments settings={settings} jobs={jobs} date={date} onChanged={refreshJobs} />
      )}
      {view === 'set' && settings && (
        <PlanSettingsView settings={settings} unlocked={unlocked} onChanged={refreshSettings} />
      )}
    </div>
  )
}
