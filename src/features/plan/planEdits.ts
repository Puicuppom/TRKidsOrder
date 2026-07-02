import { updateJobField, saveJobOrder } from './planApi'
import { computeAllTimelines } from './planTimeline'
import type { PlanSettings, PlanJob } from './planTypes'

// คำนวณ locked_plan ของแผนก ณ ขณะกดเริ่ม/ใส่เวลาเริ่ม manual
function computeLockedPlan(
  settings: PlanSettings,
  jobs: PlanJob[],
  job: PlanJob,
  dept: string,
): { start: number; end: number } | null {
  const all = computeAllTimelines(settings, jobs, job.date)
  const me = all[dept]?.find((p) => p.id === job.id)
  if (me && Number.isFinite(me.start) && Number.isFinite(me.end)) {
    return { start: me.start, end: me.end }
  }
  return null
}

export async function editCut(job: PlanJob, newVal: string) {
  await updateJobField(job.id, { cut: newVal || null })
}

export async function editManualPlanStart(job: PlanJob, dept: string, newVal: string) {
  const manual = { ...(job.manual_plan_starts || {}) }
  if (newVal === '') delete manual[dept]
  else manual[dept] = newVal
  await updateJobField(job.id, { manual_plan_starts: manual })
}

export async function setLine(job: PlanJob, dept: string, line: number) {
  const la = { ...(job.line_assignments || {}) }
  la[dept] = line
  await updateJobField(job.id, { line_assignments: la })
}

// แก้เวลาจริง (start/end) ของแผนก — logic ตรงกับ inlineEditTime เดิม
export async function editActual(
  settings: PlanSettings,
  jobs: PlanJob[],
  job: PlanJob,
  dept: string,
  subType: 'start' | 'end',
  newVal: string,
) {
  const procs = (settings.processes[dept] || []).map((p) => p.name)
  if (procs.length === 0) return
  const tracks: PlanJob['tracks'] = JSON.parse(JSON.stringify(job.tracks || {}))
  if (!tracks[dept]) tracks[dept] = {}
  const updates: Partial<PlanJob> = {}

  if (newVal === '') {
    if (subType === 'start') {
      procs.forEach((p) => {
        if (tracks[dept][p]) {
          tracks[dept][p].start = null
          tracks[dept][p].end = null
        }
      })
      if (job.locked_plans?.[dept]) {
        const lp = { ...job.locked_plans }
        delete lp[dept]
        updates.locked_plans = lp
      }
    } else {
      procs.forEach((p) => {
        if (tracks[dept][p]) tracks[dept][p].end = null
      })
    }
  } else {
    const [h, m] = newVal.split(':').map(Number)
    const d = new Date(job.date)
    d.setHours(h, m, 0, 0)
    const iso = d.toISOString()
    if (subType === 'start') {
      const first = procs[0]
      if (!tracks[dept][first]) tracks[dept][first] = { start: null, end: null }
      tracks[dept][first].start = iso
      const locked = computeLockedPlan(settings, jobs, job, dept)
      if (locked) updates.locked_plans = { ...(job.locked_plans || {}), [dept]: locked }
    } else {
      procs.forEach((p) => {
        if (!tracks[dept][p]) tracks[dept][p] = { start: iso, end: iso }
        if (!tracks[dept][p].start) tracks[dept][p].start = iso
        tracks[dept][p].end = iso
      })
    }
  }
  updates.tracks = tracks
  await updateJobField(job.id, updates)
}

// บันทึกลำดับใหม่หลัง DnD
export async function reorderJobs(orderedIds: string[]) {
  await saveJobOrder(orderedIds)
}
