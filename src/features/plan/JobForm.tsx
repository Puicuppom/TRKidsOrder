import { useState } from 'react'
import { getEffectiveQty } from './planTimeline'
import { createJobObject, insertJob, updateJobField } from './planApi'
import type { PlanSettings, PlanJob } from './planTypes'

interface Props {
  settings: PlanSettings
  jobs: PlanJob[]
  editing: PlanJob | null
  defaultDate: string
  onSaved: () => void
  onCancel: () => void
}

export default function JobForm({
  settings,
  jobs,
  editing,
  defaultDate,
  onSaved,
  onCancel,
}: Props) {
  const [date, setDate] = useState(editing?.date ?? defaultDate)
  const [name, setName] = useState(editing?.name ?? '')
  const [cut, setCut] = useState(editing?.cut ?? '')
  const [qty, setQty] = useState<Record<string, number>>(() => {
    const q: Record<string, number> = {}
    settings.departments.forEach((d) => (q[d] = editing?.qty?.[d] ?? 0))
    return q
  })
  const [busy, setBusy] = useState(false)

  async function save() {
    if (!date || !name.trim()) return alert('กรอก วันที่ และ ชื่อใบงาน')
    const dup = jobs.some(
      (j) => j.name === name.trim() && j.date === date && j.id !== editing?.id,
    )
    if (dup) return alert(`ตรวจพบบิลซ้ำ: "${name}" วันที่ ${date} มีอยู่แล้ว`)

    setBusy(true)
    try {
      if (editing) {
        const updated: PlanJob = JSON.parse(JSON.stringify(editing))
        updated.date = date
        updated.name = name.trim()
        updated.cut = cut || null
        settings.departments.forEach((d) => {
          updated.qty[d] = Number(qty[d] || 0)
          if (getEffectiveQty(updated, d) > 0) {
            updated.tracks[d] = updated.tracks[d] || { เตรียมไฟล์: { start: null, end: null } }
            ;(settings.processes[d] || []).forEach((p) => {
              if (!updated.tracks[d][p.name]) updated.tracks[d][p.name] = { start: null, end: null }
            })
            if (updated.line_assignments[d] == null) updated.line_assignments[d] = 0
          } else {
            delete updated.tracks[d]
            delete updated.line_assignments[d]
          }
        })
        const { id, ...fields } = updated
        void id
        await updateJobField(editing.id, fields)
      } else {
        const maxIdx = jobs.length > 0 ? Math.max(...jobs.map((j) => j.order_index ?? 0)) : -1
        const job = createJobObject(settings, { date, name, cut: cut || null, qty })
        job.order_index = maxIdx + 1
        await insertJob(job)
      }
      onSaved()
    } catch (e) {
      alert('เกิดข้อผิดพลาด: ' + (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const inp = 'rounded-lg border border-slate-300 px-3 py-2 text-sm'

  return (
    <div className="max-w-3xl space-y-4 rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="text-lg font-bold text-slate-800">
        {editing ? `แก้ไขใบงาน: ${editing.name}` : 'สร้างใบงานใหม่'}
      </h2>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm text-slate-600">
          วันที่
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inp} />
        </label>
        <label className="flex flex-col gap-1 text-sm text-slate-600">
          ชื่อใบงาน
          <input value={name} onChange={(e) => setName(e.target.value)} className={inp} />
        </label>
        <label className="flex flex-col gap-1 text-sm text-slate-600">
          เวลาตัด (HH:MM)
          <input type="time" lang="th-TH" value={cut} onChange={(e) => setCut(e.target.value)} className={inp} />
        </label>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-700">จำนวนงานต่อแผนก (ชิ้น)</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {settings.departments.map((d) => (
            <label key={d} className="flex flex-col gap-1 text-sm text-slate-600">
              {d}
              <input
                type="number"
                min={0}
                value={qty[d] ?? 0}
                onChange={(e) => setQty((q) => ({ ...q, [d]: Number(e.target.value) || 0 }))}
                className={inp}
              />
            </label>
          ))}
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">
          ยกเลิก
        </button>
        <button
          onClick={save}
          disabled={busy}
          className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
        >
          {busy ? 'กำลังบันทึก...' : editing ? 'บันทึกการแก้ไข' : 'เพิ่มใบงาน'}
        </button>
      </div>
    </div>
  )
}
