import { supabase } from '../../lib/supabase'
import { defaultSettings, type PlanSettings, type PlanJob } from './planTypes'
import { getEffectiveQty } from './planTimeline'

// สร้าง object ใบงานใหม่ (tracks/line_assignments ตามแผนกที่มี qty)
export function createJobObject(
  settings: PlanSettings,
  data: { date: string; name: string; cut: string | null; qty: Record<string, number> },
): PlanJob {
  const safeCut = data.cut && String(data.cut).trim() !== '' ? String(data.cut).trim() : null
  const job: PlanJob = {
    id: newJobId(),
    date: data.date,
    name: data.name.trim(),
    cut: safeCut,
    qty: data.qty,
    tracks: {},
    line_assignments: {},
    order_index: 0,
    manual_plan_starts: {},
    locked_plans: {},
  }
  settings.departments.forEach((d) => {
    if (getEffectiveQty(job, d) > 0) {
      job.tracks[d] = { เตรียมไฟล์: { start: null, end: null } }
      ;(settings.processes[d] || []).forEach((p) => {
        job.tracks[d][p.name] = { start: null, end: null }
      })
      job.line_assignments[d] = 0
    }
  })
  return job
}

export async function loadPlanSettings(): Promise<PlanSettings> {
  const { data } = await supabase
    .from('plan_settings')
    .select('data')
    .eq('id', 1)
    .single()
  return (data?.data as PlanSettings) ?? defaultSettings()
}

export async function loadPlanJobs(date: string): Promise<PlanJob[]> {
  if (!date) return []
  const { data, error } = await supabase
    .from('plan_jobs')
    .select('*')
    .eq('date', date)
    .order('order_index')
  if (error) throw error
  return (data as PlanJob[]) ?? []
}

export async function savePlanSettings(settings: PlanSettings) {
  const { error } = await supabase
    .from('plan_settings')
    .upsert({ id: 1, data: settings }, { onConflict: 'id' })
  if (error) throw error
}

// อัปเดตบางฟิลด์ของใบงาน (tracks, line_assignments, locked_plans ฯลฯ)
export async function updateJobField(id: string, fields: Partial<PlanJob>) {
  const { error } = await supabase.from('plan_jobs').update(fields).eq('id', id)
  if (error) throw error
}

export async function insertJob(job: PlanJob) {
  const { error } = await supabase.from('plan_jobs').insert(job)
  if (error) throw error
}

export async function deleteJob(id: string) {
  const { error } = await supabase.from('plan_jobs').delete().eq('id', id)
  if (error) throw error
}

// บันทึกลำดับใหม่ (DnD) — อัปเดต order_index ทีละใบ
export async function saveJobOrder(orderedIds: string[]) {
  for (let i = 0; i < orderedIds.length; i++) {
    await supabase.from('plan_jobs').update({ order_index: i }).eq('id', orderedIds[i])
  }
}

export function newJobId(): string {
  return 'J' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4)
}
