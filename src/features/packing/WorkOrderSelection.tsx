import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'

interface WoInfo {
  work_order_name: string
  order_count: number
  hasTracking: boolean
  partiallyPacked: boolean
}

// โหลดใบงาน (กำลังผลิต) + สถานะการแพ็คคร่าวๆ
function usePackingWorkOrders() {
  return useQuery({
    queryKey: ['packing', 'work-orders'],
    queryFn: async (): Promise<WoInfo[]> => {
      const { data: wos, error } = await supabase
        .from('work_orders')
        .select('work_order_name, order_count')
        .eq('status', 'กำลังผลิต')
        .order('created_at', { ascending: false })
      if (error) throw error
      if (!wos || wos.length === 0) return []

      const names = wos.map((w) => w.work_order_name)
      const orders: {
        work_order_name: string
        tracking_number: string | null
        packing_meta: { parcelScanned?: boolean } | null
        order_items: { packing_status: string | null }[]
      }[] = []
      let from = 0
      while (true) {
        const { data, error: e } = await supabase
          .from('orders')
          .select(
            'work_order_name, tracking_number, packing_meta, order_items(packing_status)',
          )
          .in('work_order_name', names)
          .range(from, from + 999)
        if (e) throw e
        orders.push(...(data as typeof orders))
        if (!data || data.length < 1000) break
        from += 1000
      }

      return wos.map((wo) => {
        const inWo = orders.filter(
          (o) => o.work_order_name === wo.work_order_name,
        )
        return {
          work_order_name: wo.work_order_name,
          order_count: wo.order_count,
          hasTracking: inWo.some((o) => o.tracking_number),
          partiallyPacked: inWo.some(
            (o) =>
              o.packing_meta?.parcelScanned ||
              o.order_items.some((oi) => oi.packing_status === 'สแกนแล้ว'),
          ),
        }
      })
    },
  })
}

interface Props {
  onSelect: (workOrderName: string) => void
}

export default function WorkOrderSelection({ onSelect }: Props) {
  const { data: wos = [], isLoading, error } = usePackingWorkOrders()

  return (
    <div className="mx-auto max-w-xl space-y-3">
      <h2 className="text-lg font-bold text-slate-800">เลือกใบงานเพื่อจัดของ</h2>
      {isLoading && <p className="text-slate-400">กำลังโหลด...</p>}
      {error && <p className="text-red-600">{(error as Error).message}</p>}
      {!isLoading && wos.length === 0 && (
        <p className="text-slate-400">ไม่พบใบงานที่กำลังผลิต</p>
      )}
      <ul className="space-y-2">
        {wos.map((wo) => {
          const icon = !wo.hasTracking ? '⚠️' : wo.partiallyPacked ? '🔄' : '📦'
          return (
            <li key={wo.work_order_name}>
              <button
                disabled={!wo.hasTracking}
                onClick={() => onSelect(wo.work_order_name)}
                className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition ${
                  wo.hasTracking
                    ? 'border-slate-200 bg-white hover:border-violet-400 hover:bg-violet-50'
                    : 'cursor-not-allowed border-amber-200 bg-amber-50'
                }`}
              >
                <span className="text-xl">{icon}</span>
                <span className="font-semibold text-slate-700">
                  {wo.work_order_name} ({wo.order_count} บิล)
                </span>
                {!wo.hasTracking && (
                  <span className="ml-auto text-sm text-amber-600">
                    รอเลขพัสดุ
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
