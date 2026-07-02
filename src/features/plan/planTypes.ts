// โมเดลข้อมูลของ Production Planner (plan_jobs + plan_settings)

export interface PlanProcess {
  name: string
  type: 'per_piece' | 'fixed'
  value: number
}

export interface PlanBreak {
  start: string // 'HH:MM'
  end: string
}

export interface PlanSettings {
  dayStart: string
  dayEnd: string
  departments: string[]
  processes: Record<string, PlanProcess[]>
  prepPerJob: Record<string, number> // นาที ต่อใบงาน (ขั้นต่ำ)
  deptBreaks: Record<string, PlanBreak[]>
  linesPerDept: Record<string, number>
}

export interface TrackTime {
  start: string | null // ISO
  end: string | null
}

// tracks[dept][processName] = { start, end }
export type Tracks = Record<string, Record<string, TrackTime>>

export interface PlanJob {
  id: string
  date: string
  name: string
  cut: string | null // 'HH:MM'
  qty: Record<string, number>
  tracks: Tracks
  line_assignments: Record<string, number>
  order_index: number
  manual_plan_starts?: Record<string, string> // dept -> 'HH:MM'
  locked_plans?: Record<string, { start: number; end: number }> // dept -> sec
}

export interface TimelineEntry {
  id: string
  start: number // วินาทีจากเที่ยงคืน
  end: number
  dur: number
  line: number
}

export type PrecomputedTimelines = Record<string, TimelineEntry[]>

export function defaultSettings(): PlanSettings {
  return {
    dayStart: '09:30',
    dayEnd: '18:30',
    departments: ['เบิก', 'STAMP', 'STK', 'CTT', 'LASER', 'TUBE', 'QC', 'PACK'],
    processes: {
      เบิก: [{ name: 'ดึงกระดาษ/อุปกรณ์', type: 'per_piece', value: 10 }],
      STAMP: [
        { name: 'ออกแบบ', type: 'per_piece', value: 20 },
        { name: 'ยิงหน้ายาง', type: 'per_piece', value: 25 },
        { name: 'รอประกอบ', type: 'fixed', value: 1800 },
        { name: 'ประกอบ', type: 'per_piece', value: 60 },
      ],
      STK: [
        { name: 'ออกแบบ', type: 'per_piece', value: 10 },
        { name: 'ปริ้น', type: 'per_piece', value: 15 },
        { name: 'จัดเรียง', type: 'per_piece', value: 10 },
      ],
      CTT: [
        { name: 'ออกแบบ', type: 'per_piece', value: 20 },
        { name: 'ปริ้น', type: 'per_piece', value: 180 },
        { name: 'จัดเรียง', type: 'per_piece', value: 10 },
      ],
      LASER: [
        { name: 'ออกแบบ', type: 'per_piece', value: 20 },
        { name: 'ยิง', type: 'per_piece', value: 60 },
        { name: 'จัดเรียง', type: 'per_piece', value: 10 },
      ],
      TUBE: [
        { name: 'ออกแบบ', type: 'per_piece', value: 20 },
        { name: 'ปริ้น', type: 'per_piece', value: 60 },
        { name: 'จัดเรียง', type: 'per_piece', value: 10 },
      ],
      QC: [{ name: 'ตรวจสอบความถูกต้อง', type: 'per_piece', value: 20 }],
      PACK: [
        { name: 'ทำใบปะหน้า', type: 'per_piece', value: 20 },
        { name: 'แพ็ค', type: 'per_piece', value: 60 },
      ],
    },
    prepPerJob: { เบิก: 10, STAMP: 10, STK: 10, CTT: 10, LASER: 10, TUBE: 10, QC: 10, PACK: 10 },
    deptBreaks: {
      เบิก: [{ start: '13:00', end: '14:00' }],
      STAMP: [{ start: '13:00', end: '14:00' }],
      STK: [{ start: '13:00', end: '14:00' }],
      CTT: [{ start: '13:00', end: '14:00' }],
      LASER: [{ start: '13:00', end: '14:00' }],
      TUBE: [{ start: '13:00', end: '14:00' }],
      QC: [{ start: '13:00', end: '14:00' }],
      PACK: [{ start: '13:00', end: '14:00' }],
    },
    linesPerDept: { เบิก: 1, STAMP: 1, STK: 1, CTT: 1, LASER: 1, TUBE: 1, QC: 1, PACK: 1 },
  }
}
