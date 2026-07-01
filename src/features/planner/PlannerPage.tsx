import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useProducts } from '../../hooks/useMetadata'
import { exportPickingCsv, exportDailySummaryCsv } from './plannerExports'
import type { PlanJob } from '../../types/db'

interface PlannerData {
  jobs: PlanJob[]
  statusByWo: Record<string, string>
}

function usePlanner() {
  return useQuery({
    queryKey: ['planner'],
    queryFn: async (): Promise<PlannerData> => {
      const { data: jobs, error } = await supabase
        .from('plan_jobs')
        .select('*')
        .order('order_index', { ascending: false })
      if (error) throw error
      const list = (jobs as PlanJob[]) ?? []
      const names = list.map((j) => j.name).filter(Boolean)
      const statusByWo: Record<string, string> = {}
      if (names.length > 0) {
        const { data: wos } = await supabase
          .from('work_orders')
          .select('work_order_name, status')
          .in('work_order_name', names)
        ;(wos ?? []).forEach((w) => (statusByWo[w.work_order_name] = w.status))
      }
      return { jobs: list, statusByWo }
    },
  })
}

const todayStr = () => new Date().toISOString().slice(0, 10)

export default function PlannerPage() {
  const { data, isLoading } = usePlanner()
  const { data: products = [] } = useProducts()
  const qc = useQueryClient()
  const [date, setDate] = useState(todayStr())
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)

  const jobs = data?.jobs ?? []
  const statusByWo = data?.statusByWo ?? {}

  // realtime: เปลี่ยนแปลง plan_jobs / work_orders → โหลดใหม่
  useEffect(() => {
    const ch = supabase
      .channel('planner-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'plan_jobs' }, () =>
        qc.invalidateQueries({ queryKey: ['planner'] }),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_orders' }, () =>
        qc.invalidateQueries({ queryKey: ['planner'] }),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [qc])

  const dates = useMemo(() => {
    const set = new Set(jobs.map((j) => j.date))
    set.add(todayStr())
    return [...set].sort((a, b) => b.localeCompare(a))
  }, [jobs])

  const filtered = useMemo(
    () =>
      jobs.filter(
        (j) =>
          (!date || j.date === date) &&
          (!search || j.name.toLowerCase().includes(search.toLowerCase())),
      ),
    [jobs, date, search],
  )

  const totalByDept = useMemo(() => {
    const t: Record<string, number> = {}
    filtered.forEach((j) => {
      if (j.qty)
        Object.entries(j.qty).forEach(([d, c]) => (t[d] = (t[d] || 0) + c))
    })
    return t
  }, [filtered])

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    try {
      await fn()
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  function statusColor(s: string) {
    if (s === 'จัดส่งแล้ว') return 'bg-green-600'
    if (s === 'ยกเลิก') return 'bg-red-600'
    return 'bg-blue-600'
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-bold text-slate-800">วางแผนผลิต</h1>
        <select
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
        >
          <option value="">-- ทุกวัน --</option>
          {dates.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <input
          placeholder="ค้นหาชื่อใบงาน"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-56 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
        />
        <button
          onClick={() => {
            setDate('')
            setSearch('')
          }}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100"
        >
          ล้างตัวกรอง
        </button>
        {date && (
          <button
            disabled={busy}
            onClick={() => run(() => exportDailySummaryCsv(date, jobs, products))}
            className="ml-auto rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
          >
            📥 สรุปเบิกรายวัน (CSV)
          </button>
        )}
      </div>

      {/* สรุปยอดแต่ละแผนก */}
      {Object.keys(totalByDept).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(totalByDept).map(([dept, count]) => (
            <div
              key={dept}
              className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-bold text-white"
            >
              {dept}: <span className="text-amber-400">{count.toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-600">
            <tr>
              <th className="p-3">ชื่อใบงาน</th>
              <th className="p-3 text-center">เวลาตัด</th>
              <th className="p-3 text-center">สถานะ</th>
              <th className="p-3">จำนวนงาน</th>
              <th className="p-3 text-center">ดาวน์โหลด</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-slate-400">
                  กำลังโหลด...
                </td>
              </tr>
            )}
            {!isLoading && filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="p-10 text-center italic text-slate-400">
                  -- ไม่พบข้อมูลใบงาน --
                </td>
              </tr>
            )}
            {filtered.map((j) => {
              const status = statusByWo[j.name] ?? 'กำลังผลิต'
              return (
                <tr key={j.id} className="border-t border-slate-100">
                  <td className="p-3">
                    <div className="font-bold text-slate-800">{j.name}</div>
                    <div className="text-xs text-slate-400">วันที่แผนงาน: {j.date}</div>
                  </td>
                  <td className="p-3 text-center text-base font-black text-red-600">
                    {(j.cut || '').substring(0, 5)}
                  </td>
                  <td className="p-3 text-center">
                    <span
                      className={`inline-block min-w-28 rounded-full px-3 py-1 text-xs font-bold text-white ${statusColor(status)}`}
                    >
                      {status}
                    </span>
                  </td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1">
                      {j.qty &&
                        Object.entries(j.qty)
                          .filter(([, c]) => c > 0)
                          .map(([d, c]) => (
                            <span
                              key={d}
                              className="rounded border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-700"
                            >
                              {d}: <span className="text-red-600">{c}</span>
                            </span>
                          ))}
                    </div>
                  </td>
                  <td className="p-3 text-center">
                    <button
                      disabled={busy}
                      onClick={() => run(() => exportPickingCsv(j.name, products))}
                      className="rounded bg-sky-600 px-2 py-1 text-xs text-white hover:bg-sky-700"
                    >
                      📦 CSV เบิก
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
