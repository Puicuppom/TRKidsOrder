import { useMemo, useState } from 'react'
import {
  computePlanTimeline,
  getEffectiveQty,
  secToHHMM,
} from './planTimeline'
import { startDeptWork, finishDeptWork, setLine } from './planEdits'
import type { PlanSettings, PlanJob } from './planTypes'

interface Props {
  settings: PlanSettings
  jobs: PlanJob[]
  date: string
  onChanged: () => void
}

export default function PlanDepartments({ settings, jobs, date, onChanged }: Props) {
  const [dept, setDept] = useState('')
  const [busy, setBusy] = useState(false)

  const timeline = useMemo(
    () => (dept ? computePlanTimeline(settings, jobs, dept, date) : []),
    [settings, jobs, dept, date],
  )
  const jobsOnDate = useMemo(
    () =>
      dept
        ? jobs
            .filter((j) => j.date === date && getEffectiveQty(j, dept) > 0)
            .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
        : [],
    [jobs, date, dept],
  )
  const lines = Math.max(1, settings.linesPerDept?.[dept] || 1)

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    try {
      await fn()
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-slate-600">เลือกแผนก:</span>
        <select
          value={dept}
          onChange={(e) => setDept(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
        >
          <option value="">-- เลือกแผนก --</option>
          {settings.departments.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>

      {!dept && (
        <p className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-slate-400">
          --- กรุณาเลือกแผนกเพื่อเริ่มงาน ---
        </p>
      )}

      {dept && (
        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${lines}, minmax(240px, 1fr))` }}>
          {Array.from({ length: lines }, (_, li) => (
            <div key={li} className="rounded-xl border border-slate-200 bg-slate-50 p-2">
              <h3 className="mb-2 text-center font-bold text-slate-700">Line {li + 1}</h3>
              <div className="space-y-2">
                {jobsOnDate
                  .filter((j) => (j.line_assignments?.[dept] ?? 0) === li)
                  .map((j) => {
                    const procs = (settings.processes[dept] || []).map((p) => p.name)
                    const tracks = j.tracks?.[dept] || {}
                    const anyStarted = procs.some((p) => tracks[p]?.start)
                    const allDone = procs.length > 0 && procs.every((p) => tracks[p]?.end)
                    const jtl = timeline.find((x) => x.id === j.id)
                    return (
                      <div key={j.id} className="rounded-xl border border-slate-200 bg-white p-3">
                        <div className="text-lg font-semibold text-slate-800">{j.name}</div>
                        <div className="mt-1 flex justify-between text-xs text-slate-500">
                          <span>
                            ตัด: <b>{j.cut?.substring(0, 5) || '-'}</b> · Qty:{' '}
                            <b className="text-blue-600">{getEffectiveQty(j, dept)}</b>
                          </span>
                          <span>แผน: {jtl ? secToHHMM(jtl.start) : '--:--'}</span>
                        </div>

                        <div className="mt-3">
                          {allDone ? (
                            <div className="rounded-xl border border-green-200 bg-green-100 py-3 text-center text-lg font-bold text-green-700">
                              ✓ เสร็จเรียบร้อย
                            </div>
                          ) : !anyStarted ? (
                            <button
                              disabled={busy}
                              onClick={() => run(() => startDeptWork(settings, jobs, j, dept))}
                              className="w-full rounded-xl bg-blue-600 py-3 text-lg font-bold text-white hover:bg-blue-700 disabled:opacity-50"
                            >
                              ▶ เริ่มงาน
                            </button>
                          ) : (
                            <button
                              disabled={busy}
                              onClick={() => run(() => finishDeptWork(settings, j, dept))}
                              className="w-full rounded-xl bg-green-600 py-3 text-lg font-bold text-white hover:bg-green-700 disabled:opacity-50"
                            >
                              ✔ จบงาน (เสร็จทุกขั้นตอน)
                            </button>
                          )}
                        </div>

                        <div className="mt-3 flex items-center gap-2 border-t border-dashed border-slate-200 pt-2 text-xs text-slate-500">
                          ย้ายไปไลน์:
                          <select
                            value={j.line_assignments?.[dept] ?? 0}
                            onChange={(e) => run(() => setLine(j, dept, Number(e.target.value)))}
                            className="flex-1 rounded border border-slate-300 px-1 py-1 text-xs"
                          >
                            {Array.from({ length: lines }, (_, i) => (
                              <option key={i} value={i}>
                                Line {i + 1}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )
                  })}
                {jobsOnDate.filter((j) => (j.line_assignments?.[dept] ?? 0) === li).length === 0 && (
                  <p className="py-4 text-center text-xs text-slate-400">ไม่มีงานในไลน์นี้</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
