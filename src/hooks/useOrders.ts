import {
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Order, OrderStatus } from '../types/db'

// ดึงออร์เดอร์ตามสถานะ (แทน fetchOrdersByStatus เดิม)
// - 'จัดส่งแล้ว' จำกัด 300 แถวล่าสุดเพื่อความเร็ว
// - สถานะอื่นดึงครบทุกแถวด้วยการแบ่งหน้า (paging)
async function fetchOrdersByStatus(status: OrderStatus): Promise<Order[]> {
  if (status === 'จัดส่งแล้ว') {
    const { data, error } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('status', 'จัดส่งแล้ว')
      .order('shipped_time', { ascending: false })
      .limit(300)
    if (error) throw error
    return (data as Order[]) ?? []
  }

  const all: Order[] = []
  let from = 0
  const pageSize = 1000
  while (true) {
    const { data, error } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('status', status)
      .order('created_at', { ascending: false })
      .range(from, from + pageSize - 1)
    if (error) throw error
    const batch = (data as Order[]) ?? []
    all.push(...batch)
    if (batch.length < pageSize) break
    from += pageSize
  }
  return all
}

export function useOrdersByStatus(status: OrderStatus, enabled = true) {
  return useQuery({
    queryKey: ['orders', status],
    queryFn: () => fetchOrdersByStatus(status),
    enabled,
  })
}

// อัปเดตเลขพัสดุ
export function useUpdateTracking() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      tracking,
    }: {
      id: number
      tracking: string
    }) => {
      const { error } = await supabase
        .from('orders')
        .update({ tracking_number: tracking })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] })
    },
  })
}
