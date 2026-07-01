import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type {
  Product,
  Channel,
  WorkOrder,
  InkType,
  CartoonPattern,
} from '../types/db'

// ข้อมูลตั้งค่า (metadata) ที่ไม่ค่อยเปลี่ยน — cache นานเพื่อประหยัด Supabase

export function useProducts() {
  return useQuery({
    queryKey: ['products'],
    queryFn: async (): Promise<Product[]> => {
      const { data, error } = await supabase.from('products').select('*')
      if (error) throw error
      return data ?? []
    },
    staleTime: 5 * 60_000,
  })
}

export function useChannels() {
  return useQuery({
    queryKey: ['channels'],
    queryFn: async (): Promise<Channel[]> => {
      const { data, error } = await supabase
        .from('channels')
        .select('channel_code, channel_name, default_carrier, bank_account')
      if (error) throw error
      const list: Channel[] = data ?? []
      // เพิ่มช่องทาง CLAIM ถ้ายังไม่มี (เหมือนโค้ดเดิม)
      if (!list.some((c) => c.channel_code === 'CLAIM')) {
        list.push({
          channel_code: 'CLAIM',
          channel_name: 'CLAIM',
          default_carrier: null,
        })
      }
      list.sort((a, b) => a.channel_code.localeCompare(b.channel_code))
      return list
    },
    staleTime: 5 * 60_000,
  })
}

export function useWorkOrders() {
  return useQuery({
    queryKey: ['work_orders', 'active'],
    queryFn: async (): Promise<WorkOrder[]> => {
      const { data, error } = await supabase
        .from('work_orders')
        .select('*')
        .eq('status', 'กำลังผลิต')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
  })
}

export function useInkTypes() {
  return useQuery({
    queryKey: ['ink_types'],
    queryFn: async (): Promise<InkType[]> => {
      const { data, error } = await supabase
        .from('ink_types')
        .select('ink_name')
        .order('id')
      if (error) throw error
      return data ?? []
    },
    staleTime: 5 * 60_000,
  })
}

export function useCartoonPatterns() {
  return useQuery({
    queryKey: ['cartoon_patterns'],
    queryFn: async (): Promise<CartoonPattern[]> => {
      const { data, error } = await supabase.from('cartoon_patterns').select('*')
      if (error) throw error
      return data ?? []
    },
    staleTime: 5 * 60_000,
  })
}
