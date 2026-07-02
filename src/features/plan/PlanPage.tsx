import { useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import * as XLSX from 'xlsx'
import { useAuth } from '../auth/useAuth'
import { usePlanSettings, usePlanJobs } from './usePlan'
import { createJobObject, deleteJob } from './planApi'
import { supabase } from '../../lib/supabase'
import JobForm from './JobForm'
import PlanDashboard from './PlanDashboard'
import type { PlanJob } from './planTypes'

const LOCK_PASS = 'TRkids@999'
const today = () => new Date().toISOString().slice(0, 10)
const pad = (n: number) => String(Math.floor(n)).padStart(2, '0')

type View = 'dash' | 'dept' | 'jobs' | 'form' | 'set'

export default function PlanPage() {
  const qc = useQueryClient()
  const { user } = useAuth()
  const isSuper = user?.role === 'superadmin'
  const [date, setDate] = useState(today())
  const [view, setView] = useState<View>('dash')
  const [unlocked, setUnlocked] = useState(isSuper)

  // superadmin ปลดล็อกอัตโนมัติ (ไม่ต้องใส่รหัส)
  useEffect(() => {
    if (isSuper) setUnlocked(true)
  }, [isSuper])
  const [editing, setEditing] = useState<PlanJob | null>(null)
  const [search, setSearch] = useState('')
  const importRef = useRef<HTMLInputElement>(null)

  const { data: settings } = usePlanSettings()
  const { data: jobs = [], isLoading } = usePlanJobs(date)

  const refresh = () => qc.invalidateQueries({ queryKey: ['plan', 'jobs'] })

  function toggleLock() {
    if (unlocked) {
      setUnlocked(false)
      return
    }
    const p = prompt('ใส่รหัสปลดล็อกเพื่อแก้ไข:')
    if (p === LOCK_PASS) setUnlocked(true)
    else if (p !== null) alert('รหัสไม่ถูกต้อง')
  }

  const filteredJobs = useMemo(
    () =>
      jobs
        .filter((j) => !search || j.name.toLowerCase().includes(search.toLowerCase()))
        .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)),
    [jobs, search],
  )

  async function removeJob(j: PlanJob) {
    if (!confirm(`ลบใบงาน "${j.name}"?`)) return
    await deleteJob(j.id)
    refresh()
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !settings) return
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: true })
      const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], {
        header: 1,
        defval: '',
      })
      if (rows.length < 2) throw new Error('ไฟล์ไม่มีข้อมูล')
      const header = (rows[0] as unknown[]).map((h) => String(h || '').toLowerCase().trim())
      const dateIdx = header.findIndex((h) => h.includes('date') || h.includes('วันที่'))
      const nameIdx = header.findIndex((h) => h.includes('name') || h.includes('ชื่อ'))
      const cutIdx = header.findIndex((h) => h.includes('cut') || h.includes('เวลาตัด'))
      if (dateIdx === -1 || nameIdx === -1) throw new Error('หาหัวตาราง "date"/"name" ไม่เจอ')

      let maxIdx = jobs.length > 0 ? Math.max(...jobs.map((j) => j.order_index ?? 0)) : -1
      const toInsert: PlanJob[] = []
      let skipped = 0
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i] as unknown[]
        const nameVal = String(row[nameIdx] || '').trim()
        const dateVal = row[dateIdx]
        if (!nameVal || !dateVal) continue
        let dateStr = ''
        const d = new Date(dateVal as string)
        dateStr = d instanceof Date && !isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : String(dateVal)
        if (jobs.some((j) => j.name === nameVal && j.date === dateStr)) {
          skipped++
          continue
        }
        const q: Record<string, number> = {}
        settings.departments.forEach((dept) => {
          const di = header.findIndex((h) => h === dept.toLowerCase().trim())
          q[dept] = di !== -1 ? Number(row[di]) || 0 : 0
        })
        let cutVal = cutIdx !== -1 ? row[cutIdx] : null
        if (cutVal instanceof Date && !isNaN(cutVal.getTime()))
          cutVal = `${pad(cutVal.getHours())}:${pad(cutVal.getMinutes())}`
        else cutVal = String(cutVal || '').trim() || null
        const job = createJobObject(settings, { date: dateStr, name: nameVal, cut: cutVal as string | null, qty: q })
        job.order_index = ++maxIdx
        toInsert.push(job)
      }
      if (toInsert.length === 0) return alert(`ไม่พบใบงานใหม่ (ซ้ำทั้งหมด ${skipped})`)
      const { error } = await supabase.from('plan_jobs').insert(toInsert)
      if (error) throw error
      refresh()
      alert(`✅ นำเข้าสำเร็จ ${toInsert.length} รายการ (ซ้ำ ${skipped})`)
    } catch (err) {
      alert('Error: ' + (err as Error).message)
    }
  }

  const tabs: { key: View; label: string }[] = [
    { key: 'dash', label: '📊 Dashboard' },
    { key: 'dept', label: '🏭 หน้าแผนก' },
    { key: 'jobs', label: '📋 ใบงานทั้งหมด' },
    { key: 'form', label: '➕ สร้างใบงาน' },
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
            onClick={() => {
              if (t.key !== 'form') setEditing(null)
              setView(t.key)
            }}
            className={`rounded-t-lg px-4 py-2 text-sm ${
              view === t.key
                ? 'border-b-2 border-violet-600 font-semibold text-violet-700'
                : 'text-slate-500 hover:bg-slate-100'
            }`}
          >
            {t.key === 'form' && editing ? '✏️ แก้ไขใบงาน' : t.label}
          </button>
        ))}
      </div>

      {view === 'jobs' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              placeholder="ค้นหาชื่อใบงาน"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-56 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            />
            <span className="text-sm text-slate-500">{filteredJobs.length} ใบงาน</span>
            {unlocked && (
              <button
                onClick={() => importRef.current?.click()}
                className="ml-auto rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
              >
                📤 นำเข้าใบงาน (XLSX)
              </button>
            )}
            <input ref={importRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImport} />
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-600">
                <tr>
                  <th className="p-2 text-left">ชื่อใบงาน</th>
                  <th className="p-2">วันที่</th>
                  <th className="p-2">เวลาตัด</th>
                  <th className="p-2 text-left">จำนวนงาน</th>
                  {unlocked && <th className="p-2">จัดการ</th>}
                </tr>
              </thead>
              <tbody>
                {filteredJobs.map((j) => (
                  <tr key={j.id} className="border-t border-slate-100">
                    <td className="p-2 font-medium text-slate-700">{j.name}</td>
                    <td className="p-2 text-center">{j.date}</td>
                    <td className="p-2 text-center">{j.cut?.substring(0, 5) || '-'}</td>
                    <td className="p-2">
                      <div className="flex flex-wrap gap-1">
                        {settings?.departments.map((d) =>
                          (j.qty?.[d] || 0) > 0 ? (
                            <span key={d} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">
                              {d}: {j.qty[d]}
                            </span>
                          ) : null,
                        )}
                      </div>
                    </td>
                    {unlocked && (
                      <td className="p-2 text-center">
                        <button
                          onClick={() => {
                            setEditing(j)
                            setView('form')
                          }}
                          className="mr-1 rounded bg-blue-600 px-2 py-1 text-xs text-white"
                        >
                          แก้ไข
                        </button>
                        <button
                          onClick={() => removeJob(j)}
                          className="rounded bg-red-600 px-2 py-1 text-xs text-white"
                        >
                          ลบ
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
                {filteredJobs.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-400">
                      ไม่มีใบงานในวันที่เลือก
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {view === 'form' &&
        (settings ? (
          !unlocked ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-700">
              🔒 กดปลดล็อกด้านบนก่อนเพื่อสร้าง/แก้ไขใบงาน
            </p>
          ) : (
            <JobForm
              settings={settings}
              jobs={jobs}
              editing={editing}
              defaultDate={date}
              onSaved={() => {
                refresh()
                setEditing(null)
                setView('jobs')
              }}
              onCancel={() => {
                setEditing(null)
                setView('jobs')
              }}
            />
          )
        ) : null)}

      {view === 'dash' &&
        (settings ? (
          <PlanDashboard
            settings={settings}
            jobs={jobs}
            date={date}
            unlocked={unlocked}
            onChanged={refresh}
          />
        ) : null)}

      {(view === 'dept' || view === 'set') && (
        <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-400">
          {view === 'dept' && 'หน้าแผนก (จับเวลาเริ่ม-จบงาน)'}
          {view === 'set' && 'ตั้งค่า (แผนก/กระบวนการ/ไลน์/เวลาพัก)'}
          {' — กำลังย้ายในเฟสถัดไป'}
        </p>
      )}
    </div>
  )
}
