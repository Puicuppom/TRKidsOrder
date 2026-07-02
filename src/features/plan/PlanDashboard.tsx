import { Fragment, useMemo, useRef, useState } from 'react'
import {
  computeAllTimelines,
  getJobStatusForDept,
  getActualTimesForDept,
  getEffectiveQty,
  getLatestActualEndSecForDept,
  secToHHMM,
  fmtDured,
} from './planTimeline'
import {
  editCut,
  editManualPlanStart,
  editActual,
  setLine,
  reorderJobs,
} from './planEdits'
import type { PlanSettings, PlanJob } from './planTypes'

interface Props {
  settings: PlanSettings
  jobs: PlanJob[]
  date: string
  unlocked: boolean
  onChanged: () => void
}

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

// ช่องเวลาที่ดับเบิลคลิกแก้ได้ (คืน newVal ผ่าน onSave)
function EditableTime({
  value,
  editable,
  onSave,
  className = '',
  title,
}: {
  value: string
  editable: boolean
  onSave: (v: string) => void
  className?: string
  title?: string
}) {
  const [editing, setEditing] = useState(false)
  const [v, setV] = useState('')
  if (editing) {
    const commit = () => {
      let nv = v.trim()
      if (nv !== '' && /^\d{4}$/.test(nv)) nv = nv.slice(0, 2) + ':' + nv.slice(2)
      if (nv !== '' && !TIME_RE.test(nv)) {
        alert('รูปแบบเวลาผิด (เช่น 09:30)')
        setEditing(false)
        return
      }
      if (nv !== (value === '-' ? '' : value)) onSave(nv)
      setEditing(false)
    }
    return (
      <input
        autoFocus
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') setEditing(false)
        }}
        className="w-14 rounded border border-violet-500 px-1 py-0.5 text-center text-xs outline-none"
      />
    )
  }
  return (
    <div
      title={title}
      className={className + (editable ? ' cursor-pointer' : '')}
      onDoubleClick={() => {
        if (!editable) return
        setV(value === '-' ? '' : value)
        setEditing(true)
      }}
    >
      {value && value !== '-' ? value : '  :  '}
    </div>
  )
}

export default function PlanDashboard({ settings, jobs, date, unlocked, onChanged }: Props) {
  const [hideCompleted, setHideCompleted] = useState(false)
  const dragId = useRef<string | null>(null)

  const timelines = useMemo(
    () => computeAllTimelines(settings, jobs, date),
    [settings, jobs, date],
  )
  const dayJobs = useMemo(
    () => jobs.filter((j) => j.date === date).sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)),
    [jobs, date],
  )

  const kpi = useMemo(() => {
    return settings.departments
      .map((d) => {
        const tl = timelines[d]
        if (!tl || tl.length === 0) return null
        const lines = [...new Set(tl.map((x) => x.line))].sort((a, b) => a - b)
        const parts = lines.map((li) => {
          const lineJobs = tl.filter((x) => x.line === li)
          const lastRes = lineJobs[lineJobs.length - 1]
          const lastJb = jobs.find((j) => j.id === lastRes.id)!
          const lastStatus = getJobStatusForDept(settings, lastJb, d)
          const lastActEnd = getLatestActualEndSecForDept(lastJb, d)
          const displayEnd = lastStatus.key === 'done' && lastActEnd > 0 ? lastActEnd : lastRes.end
          const total = lineJobs.reduce((sum, item) => {
            const jb = jobs.find((j) => j.id === item.id)!
            if (getJobStatusForDept(settings, jb, d).key === 'done') {
              const tracks = jb.tracks?.[d] || {}
              const procs = (settings.processes[d] || []).map((p) => p.name)
              let fs = Infinity
              let le = -Infinity
              procs.forEach((pn) => {
                if (tracks[pn]?.start) fs = Math.min(fs, new Date(tracks[pn].start!).getTime())
                if (tracks[pn]?.end) le = Math.max(le, new Date(tracks[pn].end!).getTime())
              })
              if (fs !== Infinity && le !== -Infinity) return sum + Math.max(0, (le - fs) / 1000)
            }
            return sum + item.dur
          }, 0)
          return `L${li + 1}: ${secToHHMM(displayEnd)} (${fmtDured(total)})`
        })
        return { dept: d, text: parts.join(' | ') }
      })
      .filter(Boolean) as { dept: string; text: string }[]
  }, [settings, jobs, timelines])

  async function run(fn: () => Promise<void>) {
    await fn()
    onChanged()
  }

  function onDrop(targetId: string) {
    const from = dragId.current
    dragId.current = null
    if (!from || from === targetId) return
    const ids = dayJobs.map((j) => j.id)
    const fromIdx = ids.indexOf(from)
    const toIdx = ids.indexOf(targetId)
    if (fromIdx < 0 || toIdx < 0) return
    ids.splice(toIdx, 0, ids.splice(fromIdx, 1)[0])
    run(() => reorderJobs(ids))
  }

  const cellBg = (key: string) =>
    key === 'done' ? 'bg-green-50' : key === 'progress' ? 'bg-amber-50' : 'bg-white'

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input type="checkbox" checked={hideCompleted} onChange={(e) => setHideCompleted(e.target.checked)} />
        ซ่อนใบงานที่เสร็จทุกแผนกแล้ว
      </label>

      {/* KPI bar */}
      <div className="flex flex-wrap gap-2">
        {kpi.map((k) => (
          <span key={k.dept} className="rounded-lg bg-slate-100 px-3 py-1 text-xs text-slate-700">
            <b>{k.dept}</b> • {k.text}
          </span>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="border-collapse text-xs">
          <thead>
            <tr className="bg-slate-100">
              <th className="border border-slate-200 p-1" rowSpan={2}></th>
              <th className="border border-slate-200 p-1 text-left" rowSpan={2}>ใบงาน</th>
              <th className="border border-slate-200 p-1" rowSpan={2}>เวลาตัด</th>
              {settings.departments.map((d) => (
                <th key={d} className="border border-slate-200 p-1 text-center" colSpan={3}>
                  {d}
                </th>
              ))}
            </tr>
            <tr className="bg-slate-100">
              {settings.departments.map((d) => (
                <Fragment key={d}>
                  <th className="border border-slate-200 p-1">สถานะ</th>
                  <th className="border border-slate-200 p-1">เริ่ม</th>
                  <th className="border border-slate-200 p-1">เสร็จ</th>
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {dayJobs.map((j) => {
              const overallDone = settings.departments
                .filter((d) => getEffectiveQty(j, d) > 0)
                .every((d) => getJobStatusForDept(settings, j, d).key === 'done')
              if (hideCompleted && overallDone) return null
              return (
                <tr
                  key={j.id}
                  draggable={unlocked}
                  onDragStart={() => (dragId.current = j.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => onDrop(j.id)}
                  className="hover:bg-slate-50"
                >
                  <td className="border border-slate-200 p-1 text-center text-slate-400">
                    {unlocked ? '☰' : ''}
                  </td>
                  <td className="border border-slate-200 p-1 text-left font-semibold">{j.name}</td>
                  <td className="border border-slate-200 p-1 text-center">
                    <EditableTime
                      value={j.cut?.substring(0, 5) || '-'}
                      editable={unlocked}
                      onSave={(v) => run(() => editCut(j, v))}
                    />
                  </td>
                  {settings.departments.map((d) => {
                    if (getEffectiveQty(j, d) <= 0) {
                      return (
                        <Fragment key={d}>
                          <td className="border border-slate-200 bg-green-50 p-1 text-center">-</td>
                          <td className="border border-slate-200 bg-green-50 p-1 text-center">-</td>
                          <td className="border border-slate-200 bg-green-50 p-1 text-center">-</td>
                        </Fragment>
                      )
                    }
                    const status = getJobStatusForDept(settings, j, d)
                    const me = timelines[d]?.find((x) => x.id === j.id)
                    const act = getActualTimesForDept(settings, j, d)
                    const totalLines = Math.max(1, settings.linesPerDept?.[d] || 1)
                    const curLine = j.line_assignments?.[d] ?? 0
                    const bg = cellBg(status.key)
                    return (
                      <Fragment key={d}>
                        <td className={`border border-slate-200 p-1 text-center ${bg}`}>
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="whitespace-nowrap text-[11px] font-semibold">{status.text}</span>
                            <select
                              value={curLine}
                              disabled={!unlocked}
                              onChange={(e) => run(() => setLine(j, d, Number(e.target.value)))}
                              className="h-5 rounded border border-slate-300 text-[11px]"
                            >
                              {Array.from({ length: totalLines }, (_, i) => (
                                <option key={i} value={i}>L{i + 1}</option>
                              ))}
                            </select>
                          </div>
                        </td>
                        <td className={`border border-slate-200 p-1 text-center ${bg}`}>
                          <EditableTime
                            value={me ? secToHHMM(me.start) : '-'}
                            editable={unlocked}
                            title="แก้แผนเริ่ม (ตั้งเวลาเริ่มเอง)"
                            className="text-slate-500"
                            onSave={(v) => run(() => editManualPlanStart(j, d, v))}
                          />
                          <EditableTime
                            value={act.actualStart}
                            editable={unlocked}
                            title="แก้เริ่มจริง"
                            className="font-semibold text-blue-600"
                            onSave={(v) => run(() => editActual(settings, jobs, j, d, 'start', v))}
                          />
                        </td>
                        <td className={`border border-slate-200 p-1 text-center ${bg}`}>
                          <div className="text-slate-500">{me ? secToHHMM(me.end) : '-'}</div>
                          <EditableTime
                            value={act.actualEnd}
                            editable={unlocked}
                            title="แก้เสร็จจริง"
                            className="font-semibold text-blue-600"
                            onSave={(v) => run(() => editActual(settings, jobs, j, d, 'end', v))}
                          />
                        </td>
                      </Fragment>
                    )
                  })}
                </tr>
              )
            })}
            {dayJobs.length === 0 && (
              <tr>
                <td colSpan={3 + settings.departments.length * 3} className="p-8 text-center text-slate-400">
                  ไม่มีใบงานในวันที่เลือก
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {unlocked && (
        <p className="text-xs text-slate-400">
          ลากแถว (☰) เพื่อจัดคิว · ดับเบิลคลิกช่องเวลาสีน้ำเงินเพื่อแก้เวลาจริง · แก้เวลาตัดที่คอลัมน์เวลาตัด
        </p>
      )}
    </div>
  )
}
