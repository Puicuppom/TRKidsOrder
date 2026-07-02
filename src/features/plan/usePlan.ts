import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { loadPlanSettings, loadPlanJobs } from './planApi'
import type { PlanSettings, PlanJob } from './planTypes'

// โหลด settings ของ planner (ใช้ร่วมทุกวัน)
export function usePlanSettings() {
  return useQuery({
    queryKey: ['plan', 'settings'],
    queryFn: loadPlanSettings,
    staleTime: 5 * 60_000,
  })
}

// โหลดใบงานตามวันที่ + realtime (plan_jobs/plan_settings เปลี่ยน → refetch)
export function usePlanJobs(date: string) {
  const qc = useQueryClient()
  const query = useQuery({
    queryKey: ['plan', 'jobs', date],
    queryFn: () => loadPlanJobs(date),
    enabled: !!date,
  })

  useEffect(() => {
    const ch = supabase
      .channel('plan-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'plan_jobs' }, () =>
        qc.invalidateQueries({ queryKey: ['plan', 'jobs'] }),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'plan_settings' }, () =>
        qc.invalidateQueries({ queryKey: ['plan', 'settings'] }),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [qc])

  return query
}

export type { PlanSettings, PlanJob }
