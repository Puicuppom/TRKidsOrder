import { useEffect, useState } from 'react'
import { savePlanSettings } from './planApi'
import type { PlanSettings } from './planTypes'

interface Props {
  settings: PlanSettings
  unlocked: boolean
  onChanged: () => void
}

export default function PlanSettingsView({ settings, unlocked, onChanged }: Props) {
  const [s, setS] = useState<PlanSettings>(settings)
  const [dept, setDept] = useState(settings.departments[0] ?? '')

  useEffect(() => setS(settings), [settings])

  async function commit(next: PlanSettings) {
    setS(next)
    await savePlanSettings(next)
    onChanged()
  }
  function mutate(fn: (n: PlanSettings) => void) {
    const next: PlanSettings = JSON.parse(JSON.stringify(s))
    fn(next)
    void commit(next)
  }

  const inp = 'rounded-lg border border-slate-300 px-2 py-1 text-sm disabled:bg-slate-100'
  const dis = !unlocked

  // ===== แผนก =====
  function renameDept(oldName: string, newName: string) {
    const nv = newName.trim()
    if (!nv || nv === oldName) return
    mutate((n) => {
      n.departments = n.departments.map((d) => (d === oldName ? nv : d))
      ;(['processes', 'prepPerJob', 'deptBreaks', 'linesPerDept'] as const).forEach((k) => {
        const rec = n[k] as Record<string, unknown>
        if (rec[oldName] != null) {
          rec[nv] = rec[oldName]
          delete rec[oldName]
        }
      })
    })
  }
  function moveDept(i: number, dir: -1 | 1) {
    mutate((n) => {
      const j = i + dir
      if (j < 0 || j >= n.departments.length) return
      ;[n.departments[i], n.departments[j]] = [n.departments[j], n.departments[i]]
    })
  }
  function deleteDept(d: string) {
    if (!confirm(`ลบแผนก ${d}?`)) return
    mutate((n) => {
      n.departments = n.departments.filter((x) => x !== d)
    })
  }
  function addDept() {
    const name = prompt('ชื่อแผนกใหม่')?.trim()
    if (!name) return
    mutate((n) => {
      n.departments.push(name)
      n.processes[name] ||= []
      n.prepPerJob[name] ??= 10
      n.deptBreaks[name] ||= []
      n.linesPerDept[name] ??= 1
    })
  }

  // ===== กระบวนการของแผนกที่เลือก =====
  const procs = s.processes[dept] || []
  const breaks = s.deptBreaks[dept] || []

  return (
    <div className="space-y-5">
      {!unlocked && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-sm text-amber-700">
          🔒 ปลดล็อกก่อนเพื่อแก้ไขการตั้งค่า
        </p>
      )}

      {/* เวลาทำการ */}
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="mb-2 font-bold text-slate-700">เวลาทำการ</h3>
        <div className="flex flex-wrap gap-3">
          <label className="flex flex-col gap-1 text-sm text-slate-600">
            เริ่มวัน
            <input type="time" disabled={dis} value={s.dayStart} onChange={(e) => mutate((n) => (n.dayStart = e.target.value))} className={inp} />
          </label>
          <label className="flex flex-col gap-1 text-sm text-slate-600">
            จบวัน
            <input type="time" disabled={dis} value={s.dayEnd} onChange={(e) => mutate((n) => (n.dayEnd = e.target.value))} className={inp} />
          </label>
        </div>
      </section>

      {/* แผนก */}
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-bold text-slate-700">แผนก</h3>
          <button disabled={dis} onClick={addDept} className="rounded-lg bg-violet-600 px-3 py-1 text-sm text-white disabled:opacity-50">
            + เพิ่มแผนก
          </button>
        </div>
        <div className="space-y-1">
          {s.departments.map((d, i) => (
            <div key={d} className="flex items-center gap-1">
              <input
                disabled={dis}
                defaultValue={d}
                onBlur={(e) => renameDept(d, e.target.value)}
                className={inp + ' flex-1'}
              />
              <button disabled={dis} onClick={() => moveDept(i, -1)} className="rounded bg-slate-200 px-2 py-1 text-xs">↑</button>
              <button disabled={dis} onClick={() => moveDept(i, 1)} className="rounded bg-slate-200 px-2 py-1 text-xs">↓</button>
              <button disabled={dis} onClick={() => deleteDept(d)} className="rounded bg-red-600 px-2 py-1 text-xs text-white">ลบ</button>
            </div>
          ))}
        </div>
      </section>

      {/* กระบวนการ / prep / ไลน์ / พัก ของแผนกที่เลือก */}
      <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-2">
          <h3 className="font-bold text-slate-700">กระบวนการของแผนก:</h3>
          <select value={dept} onChange={(e) => setDept(e.target.value)} className={inp}>
            {s.departments.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>

        {/* processes */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-600">ขั้นตอน</span>
            <button
              disabled={dis}
              onClick={() => {
                const name = prompt('ชื่อขั้นตอนใหม่')?.trim()
                if (!name) return
                mutate((n) => {
                  n.processes[dept] ||= []
                  n.processes[dept].push({ name, type: 'per_piece', value: 0 })
                })
              }}
              className="rounded-lg bg-slate-200 px-3 py-1 text-sm disabled:opacity-50"
            >
              + เพิ่มขั้นตอน
            </button>
          </div>
          {procs.map((p, i) => (
            <div key={i} className="grid grid-cols-[1fr_110px_130px_auto] items-center gap-2">
              <input
                disabled={dis}
                defaultValue={p.name}
                onBlur={(e) => mutate((n) => (n.processes[dept][i].name = e.target.value.trim()))}
                className={inp}
                placeholder="ชื่อขั้นตอน"
              />
              <select
                disabled={dis}
                value={p.type}
                onChange={(e) =>
                  mutate((n) => {
                    n.processes[dept][i].type = e.target.value as 'per_piece' | 'fixed'
                    n.processes[dept][i].value = 0
                  })
                }
                className={inp}
              >
                <option value="per_piece">ต่อชิ้น</option>
                <option value="fixed">คงที่</option>
              </select>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={0}
                  disabled={dis}
                  value={p.type === 'fixed' ? p.value / 60 : p.value}
                  onChange={(e) =>
                    mutate((n) => {
                      const v = parseFloat(e.target.value) || 0
                      n.processes[dept][i].value = p.type === 'fixed' ? v * 60 : Math.round(v)
                    })
                  }
                  className={inp + ' w-16'}
                />
                <span className="text-xs text-slate-400">{p.type === 'fixed' ? 'นาที' : 'วิ/ชิ้น'}</span>
              </div>
              <div className="flex gap-1">
                <button disabled={dis} onClick={() => mutate((n) => { if (i > 0) [n.processes[dept][i - 1], n.processes[dept][i]] = [n.processes[dept][i], n.processes[dept][i - 1]] })} className="rounded bg-slate-200 px-2 py-1 text-xs">↑</button>
                <button disabled={dis} onClick={() => mutate((n) => { const a = n.processes[dept]; if (i < a.length - 1) [a[i + 1], a[i]] = [a[i], a[i + 1]] })} className="rounded bg-slate-200 px-2 py-1 text-xs">↓</button>
                <button disabled={dis} onClick={() => { if (confirm(`ลบขั้นตอน ${p.name}?`)) mutate((n) => n.processes[dept].splice(i, 1)) }} className="rounded bg-red-600 px-2 py-1 text-xs text-white">ลบ</button>
              </div>
            </div>
          ))}
        </div>

        {/* prep + lines */}
        <div className="flex flex-wrap gap-4">
          <label className="flex flex-col gap-1 text-sm text-slate-600">
            เวลาเตรียมขั้นต่ำ (นาที/ใบงาน)
            <input type="number" min={0} disabled={dis} value={s.prepPerJob[dept] ?? 10} onChange={(e) => mutate((n) => (n.prepPerJob[dept] = parseFloat(e.target.value) || 10))} className={inp + ' w-24'} />
          </label>
          <label className="flex flex-col gap-1 text-sm text-slate-600">
            จำนวนไลน์
            <input type="number" min={1} disabled={dis} value={s.linesPerDept[dept] ?? 1} onChange={(e) => mutate((n) => (n.linesPerDept[dept] = parseInt(e.target.value) || 1))} className={inp + ' w-24'} />
          </label>
        </div>

        {/* breaks */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-600">เวลาพัก</span>
            <button
              disabled={dis}
              onClick={() => mutate((n) => { n.deptBreaks[dept] ||= []; n.deptBreaks[dept].push({ start: '12:00', end: '13:00' }) })}
              className="rounded-lg bg-slate-200 px-3 py-1 text-sm disabled:opacity-50"
            >
              + เพิ่มเวลาพัก
            </button>
          </div>
          {breaks.map((b, i) => (
            <div key={i} className="flex items-center gap-2">
              <input type="time" disabled={dis} value={b.start} onChange={(e) => mutate((n) => (n.deptBreaks[dept][i].start = e.target.value))} className={inp} />
              <span className="text-slate-400">–</span>
              <input type="time" disabled={dis} value={b.end} onChange={(e) => mutate((n) => (n.deptBreaks[dept][i].end = e.target.value))} className={inp} />
              <button disabled={dis} onClick={() => mutate((n) => n.deptBreaks[dept].splice(i, 1))} className="rounded bg-red-600 px-2 py-1 text-xs text-white">ลบ</button>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
