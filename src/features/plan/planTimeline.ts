import type {
  PlanSettings,
  PlanJob,
  TimelineEntry,
  PrecomputedTimelines,
} from './planTypes'

export function parseTimeToMin(t: string | null | undefined): number {
  if (!t || typeof t !== 'string') return 0
  const parts = t.split(':')
  if (parts.length < 2) return 0
  const [H, M] = parts.map(Number)
  if (Number.isNaN(H) || Number.isNaN(M)) return 0
  return H * 60 + M
}

const pad = (n: number) => String(Math.floor(n)).padStart(2, '0')
export const minToHHMM = (m: number) => {
  const total = Math.floor(m)
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`
}
export const secToHHMM = (s: number | null | undefined) => {
  if (s === null || s === undefined || isNaN(s) || !isFinite(s)) return '--:--'
  return minToHHMM(s / 60)
}
export const fmtDured = (secs: number) => {
  const total = Math.round(secs / 60)
  return `${Math.floor(total / 60)} ชม ${total % 60} นาที`
}

// เบิก = STAMP+LASER, QC = PACK, อื่นๆ = qty[dept]
export function getEffectiveQty(job: PlanJob, dept: string): number {
  if (dept === 'เบิก')
    return (Number(job.qty['STAMP']) || 0) + (Number(job.qty['LASER']) || 0)
  if (dept === 'QC') return Number(job.qty['PACK']) || 0
  return Number(job.qty[dept]) || 0
}

// เวลาผลิตมาตรฐาน (วินาที) ของแผนกสำหรับใบงาน
export function calcPlanFor(settings: PlanSettings, dept: string, job: PlanJob): number {
  const q = getEffectiveQty(job, dept)
  if (!q) return 0
  let total = 0
  ;(settings.processes[dept] || []).forEach((p) => {
    if (p.type === 'per_piece') total += (p.value || 0) * q
    else if (p.type === 'fixed') total += p.value || 0
  })
  const minSec = (settings.prepPerJob?.[dept] || 0) * 60
  return Math.max(minSec, total)
}

// offset ของแต่ละกระบวนการ (ยืดตาม prep ขั้นต่ำ)
export function calcProcPlanOffsets(settings: PlanSettings, dept: string, job: PlanJob) {
  const q = getEffectiveQty(job, dept)
  if (!q) return []
  const minSec = (settings.prepPerJob?.[dept] || 0) * 60
  const steps: { name: string; duration: number }[] = []
  let processTotal = 0
  ;(settings.processes[dept] || []).forEach((p) => {
    const duration = p.type === 'per_piece' ? (p.value || 0) * q : p.value || 0
    steps.push({ name: p.name, duration })
    processTotal += duration
  })
  const factor = processTotal > 0 && processTotal < minSec ? minSec / processTotal : 1
  const offs: { name: string; startOff: number; endOff: number }[] = []
  let cursor = 0
  steps.forEach((p) => {
    const adj = p.duration * factor
    offs.push({ name: p.name, startOff: cursor, endOff: cursor + adj })
    cursor += adj
  })
  return offs
}

const secOfDay = (iso: string) =>
  (new Date(iso).getTime() - new Date(iso).setHours(0, 0, 0, 0)) / 1000

export function getLatestActualEndSecForDept(job: PlanJob, dept: string): number {
  const tmap = job.tracks?.[dept] || {}
  let maxEnd = ''
  Object.values(tmap).forEach((t) => {
    if (t.end && t.end > maxEnd) maxEnd = t.end
  })
  return maxEnd ? secOfDay(maxEnd) : 0
}

export function getEarliestActualStartSecForDept(job: PlanJob, dept: string): number {
  const tmap = job.tracks?.[dept] || {}
  let earliest = ''
  Object.values(tmap).forEach((t) => {
    if (t.start && (earliest === '' || t.start < earliest)) earliest = t.start
  })
  return earliest ? secOfDay(earliest) : 0
}

function adjustForBreaks(
  startSec: number,
  durationSec: number,
  breaks: { start: number; end: number }[],
) {
  let currentStart = startSec
  let adjusted = true
  while (adjusted) {
    adjusted = false
    for (const b of breaks) {
      if (currentStart >= b.start && currentStart < b.end) {
        currentStart = b.end
        adjusted = true
      }
    }
  }
  let endSec = currentStart + durationSec
  for (const b of breaks) {
    if (currentStart < b.start && endSec > b.start) endSec += b.end - b.start
  }
  return { start: currentStart, end: endSec }
}

function findEntry(pre: PrecomputedTimelines, dept: string, jobId: string) {
  return pre[dept]?.find((x) => x.id === jobId)
}

function plannedEnd(pre: PrecomputedTimelines, dept: string, jobId: string): number {
  return findEntry(pre, dept, jobId)?.end ?? 0
}
function plannedStart(pre: PrecomputedTimelines, dept: string, jobId: string): number {
  return findEntry(pre, dept, jobId)?.start ?? 0
}
function effectiveFinishSec(
  dept: string,
  job: PlanJob,
  pre: PrecomputedTimelines,
): number {
  const actual = getLatestActualEndSecForDept(job, dept)
  if (actual > 0) return actual
  return plannedEnd(pre, dept, job.id)
}

// คำนวณ timeline ของแผนกหนึ่ง (ต้องส่ง precomputed ของแผนกที่คำนวณก่อนหน้า)
export function computePlanTimeline(
  settings: PlanSettings,
  jobs: PlanJob[],
  dept: string,
  date: string,
  pre: PrecomputedTimelines = {},
): TimelineEntry[] {
  const lines = Math.max(1, settings.linesPerDept?.[dept] || 1)
  const dayStartSec = parseTimeToMin(settings.dayStart) * 60
  const breaks = (settings.deptBreaks[dept] || [])
    .map((b) => ({ start: parseTimeToMin(b.start) * 60, end: parseTimeToMin(b.end) * 60 }))
    .sort((a, b) => a.start - b.start)

  const jobsOnDate = jobs
    .filter((j) => j.date === date && getEffectiveQty(j, dept) > 0)
    .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))

  const results: TimelineEntry[] = []
  const lineLastEnd = new Array(lines).fill(dayStartSec)

  jobsOnDate.forEach((j) => {
    const locked = j.locked_plans?.[dept]
    if (locked) {
      const li = j.line_assignments[dept] || 0
      results.push({ id: j.id, start: locked.start, end: locked.end, dur: locked.end - locked.start, line: li })
      lineLastEnd[li] = locked.end
      return
    }

    const li = j.line_assignments[dept] || 0
    let prevEnd = lineLastEnd[li]
    const prevOnLine = results.filter((r) => r.line === li)
    const jHasActual = Object.values(j.tracks?.[dept] || {}).some((t) => t.start || t.end)

    if (prevOnLine.length > 0) {
      const lastRes = prevOnLine[prevOnLine.length - 1]
      const lastJob = jobs.find((jb) => jb.id === lastRes.id)!
      const actualLastEnd = getLatestActualEndSecForDept(lastJob, dept)
      const flowDepts = ['QC', 'STAMP', 'LASER']
      if (flowDepts.includes(dept)) {
        prevEnd = actualLastEnd > 0 ? actualLastEnd : lastRes.end
      } else if (jHasActual) {
        prevEnd = lastRes.end
      } else {
        prevEnd = actualLastEnd > 0 ? actualLastEnd : lastRes.end
      }
    }

    const stdDuration = calcPlanFor(settings, dept, j)
    const cutSec = j.cut ? parseTimeToMin(j.cut) * 60 : -Infinity
    let base = Math.max(prevEnd, isNaN(cutSec) ? 0 : cutSec)
    let finalDur = stdDuration

    const delayDepts = ['เบิก', 'STK', 'CTT', 'TUBE']
    if (delayDepts.includes(dept) && cutSec !== -Infinity) {
      base = Math.max(base, cutSec + 300)
    }

    if (j.manual_plan_starts?.[dept]) {
      base = parseTimeToMin(j.manual_plan_starts[dept]) * 60
    } else {
      if (['STAMP', 'LASER'].includes(dept)) {
        const berk = effectiveFinishSec('เบิก', j, pre)
        if (berk > 0) base = Math.max(base, berk + 300)
      }
      if (dept === 'QC') {
        const preceding = ['STK', 'CTT', 'TUBE', 'STAMP', 'LASER']
        const finishTimes: number[] = []
        preceding.forEach((pd) => {
          if (getEffectiveQty(j, pd) > 0) {
            const f = effectiveFinishSec(pd, j, pre)
            if (f > 0) finishTimes.push(f)
          }
        })
        if (finishTimes.length > 0) {
          base = Math.max(base, Math.min(...finishTimes) + 300)
          const requiredEnd = Math.max(...finishTimes) + stdDuration
          finalDur = Math.max(stdDuration, requiredEnd - base)
        }
      }
      if (dept === 'PACK') {
        const qcActStart = getEarliestActualStartSecForDept(j, 'QC')
        const qcStartSec = qcActStart > 0 ? qcActStart : plannedStart(pre, 'QC', j.id)
        const qcFinishSec = effectiveFinishSec('QC', j, pre)
        if (qcStartSec > 0 && qcFinishSec > 0) {
          base = Math.max(base, qcStartSec + 300)
          finalDur = Math.max(stdDuration, qcFinishSec + 300 - base)
        }
      }
    }

    const { start, end } = adjustForBreaks(base, finalDur, breaks)
    results.push({ id: j.id, start, end, dur: finalDur, line: li })
    lineLastEnd[li] = end
  })
  return results
}

// คำนวณ timeline ทุกแผนกตามลำดับ dependency
export function computeAllTimelines(
  settings: PlanSettings,
  jobs: PlanJob[],
  date: string,
): PrecomputedTimelines {
  const order = ['เบิก', 'STK', 'CTT', 'TUBE', 'STAMP', 'LASER', 'QC', 'PACK']
  const ordered = [...new Set([...order, ...settings.departments])]
  const all: PrecomputedTimelines = {}
  ordered.forEach((d) => {
    if (settings.departments.includes(d)) {
      all[d] = computePlanTimeline(settings, jobs, d, date, all)
    }
  })
  return all
}

const fmtLocalHHMM = (iso: string) => {
  const d = new Date(iso)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function getJobStatusForDept(
  settings: PlanSettings,
  job: PlanJob,
  dept: string,
): { text: string; key: 'pending' | 'progress' | 'done' } {
  const procs = (settings.processes[dept] || []).map((p) => p.name)
  const tracks = job.tracks[dept] || {}
  if (procs.length === 0) return { text: 'รอดำเนินการ', key: 'pending' }
  const completed = procs.filter((p) => tracks[p]?.end).length
  if (completed === procs.length) return { text: 'เสร็จแล้ว', key: 'done' }
  if (Object.values(tracks).some((t) => t.start)) {
    const current =
      procs.find((p) => tracks[p]?.start && !tracks[p]?.end) ||
      procs.find((p) => !tracks[p]?.end)
    return { text: current || 'กำลังทำ', key: 'progress' }
  }
  return { text: 'รอดำเนินการ', key: 'pending' }
}

export function getActualTimesForDept(
  settings: PlanSettings,
  job: PlanJob,
  dept: string,
): { actualStart: string; actualEnd: string } {
  const tracks = job.tracks?.[dept] || {}
  const procs = (settings.processes[dept] || []).map((p) => p.name)
  if (procs.length === 0) return { actualStart: '-', actualEnd: '-' }
  let firstStart: Date | null = null
  let lastEnd: Date | null = null
  let allFinished = true
  for (const p of procs) {
    if (tracks[p]?.start) {
      const d = new Date(tracks[p].start!)
      if (!firstStart || d < firstStart) firstStart = d
    }
    if (tracks[p]?.end) {
      const d = new Date(tracks[p].end!)
      if (!lastEnd || d > lastEnd) lastEnd = d
    } else allFinished = false
  }
  return {
    actualStart: firstStart ? fmtLocalHHMM(firstStart.toISOString()) : '-',
    actualEnd: allFinished && lastEnd ? fmtLocalHHMM(lastEnd.toISOString()) : '-',
  }
}

export function getOverallJobStatus(
  settings: PlanSettings,
  job: PlanJob,
): 'pending' | 'progress' | 'done' {
  const relevant = settings.departments.filter((d) => getEffectiveQty(job, d) > 0)
  if (relevant.length === 0) return 'pending'
  const keys = relevant.map((d) => getJobStatusForDept(settings, job, d).key)
  if (keys.every((s) => s === 'done')) return 'done'
  if (keys.some((s) => s === 'progress')) return 'progress'
  return 'pending'
}

export function procStatus(track?: { start: string | null; end: string | null }) {
  if (!track?.start && !track?.end) return 'รอดำเนินการ'
  if (track?.start && !track?.end) return 'กำลังทำ'
  if (track?.end) return 'เสร็จแล้ว'
  return 'รอดำเนินการ'
}
