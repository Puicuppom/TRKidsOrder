import { supabase } from '../../lib/supabase'
import type { Order, OrderStatus, Product } from '../../types/db'

// ===== helpers =====

// คำนวณจำนวนงานแต่ละประเภทสำหรับแผนผลิต (plan_jobs.qty)
function computeQty(bills: Order[], products: Product[]) {
  const qty: Record<string, number> = {
    เบิก: 0,
    STAMP: 0,
    STK: 0,
    CTT: 0,
    LASER: 0,
    TUBE: 0,
    QC: bills.length,
    PACK: bills.length,
  }
  for (const order of bills) {
    for (const item of order.order_items || []) {
      const product = products.find((p) => p.id === item.product_id)
      const cat = (product?.product_category || '').toUpperCase()
      if (!cat) continue
      if (cat.includes('STAMP')) {
        qty.STAMP++
        qty.เบิก++
      }
      if (cat.includes('STK')) qty.STK++
      if (cat.includes('UV') || cat.includes('SUBLIMATION')) qty.CTT++
      if (cat.includes('LASER')) {
        qty.LASER++
        qty.เบิก++
      }
      if (cat.includes('TUBE')) qty.TUBE++
    }
  }
  return qty
}

// อัปเดตจำนวนบิลในใบงาน — ถ้าไม่เหลือบิลให้ตั้งสถานะใบงานเป็น "จัดส่งแล้ว"
async function updateWorkOrderCount(workOrderName: string) {
  const { count, error } = await supabase
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('work_order_name', workOrderName)
  if (error) throw error
  if (!count) {
    await supabase
      .from('work_orders')
      .update({ status: 'จัดส่งแล้ว' })
      .eq('work_order_name', workOrderName)
  } else {
    await supabase
      .from('work_orders')
      .update({ order_count: count })
      .eq('work_order_name', workOrderName)
  }
}

// อัปเดต/ลบงานในแผนผลิต (plan_jobs) ตามบิลที่เหลือ
async function updatePlannerJob(
  workOrderName: string,
  remainingBills: Order[],
  products: Product[],
) {
  if (remainingBills.length > 0) {
    const qty = computeQty(remainingBills, products)
    await supabase
      .from('plan_jobs')
      .update({ qty })
      .eq('name', workOrderName)
  } else {
    await supabase.from('plan_jobs').delete().eq('name', workOrderName)
  }
}

// ===== actions =====

// สร้างใบงานจากบิลที่เลือก (จัดกลุ่มตามช่องทาง) + ส่งเข้าแผนผลิต
export async function createWorkOrders(
  selectedOrders: Order[],
  products: Product[],
  username: string,
): Promise<{ success: string[]; errors: string[] }> {
  const success: string[] = []
  const errors: string[] = []

  // จัดกลุ่มตามช่องทาง
  const byChannel: Record<string, Order[]> = {}
  for (const o of selectedOrders) {
    ;(byChannel[o.channel_code] ||= []).push(o)
  }

  // หา order_index สูงสุดในแผนผลิต
  const { data: maxIdxRes } = await supabase
    .from('plan_jobs')
    .select('order_index')
    .order('order_index', { ascending: false })
    .limit(1)
  let currentMaxIdx = maxIdxRes?.[0]?.order_index ?? 0

  for (const channelCode of Object.keys(byChannel)) {
    const bills = byChannel[channelCode]
    const ids = bills.map((o) => o.id)
    try {
      const today = new Date()
      const y = today.getFullYear()
      const m = String(today.getMonth() + 1).padStart(2, '0')
      const d = String(today.getDate()).padStart(2, '0')
      const workOrderDate = `${y}-${m}-${d}`
      const shortYear = String(y + 543).slice(-2)
      const datePart = `${d}${m}${shortYear}`

      // หา batch_number ล่าสุดของช่องทาง+วันที่
      const { data: woData, error: woReadErr } = await supabase
        .from('work_orders')
        .select('batch_number')
        .eq('channel_code', channelCode)
        .eq('production_date', workOrderDate)
        .order('batch_number', { ascending: false })
        .limit(1)
      if (woReadErr) throw woReadErr
      const batchNumber = (woData?.[0]?.batch_number ?? 0) + 1
      const workOrderName = `${channelCode}-${datePart}-R${batchNumber}`

      const { error: woErr } = await supabase.from('work_orders').insert({
        work_order_name: workOrderName,
        channel_code: channelCode,
        production_date: workOrderDate,
        batch_number: batchNumber,
        order_count: ids.length,
        created_by: username,
        status: 'กำลังผลิต',
      })
      if (woErr) throw woErr

      const { error: updErr } = await supabase
        .from('orders')
        .update({ status: 'ใบงาน (กำลังผลิต)', work_order_name: workOrderName })
        .in('id', ids)
      if (updErr) throw updErr

      const qty = computeQty(bills, products)
      const cutTime = new Date().toLocaleTimeString('th-TH', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
      })
      const tracks: Record<string, object> = {}
      for (const key of [
        'เบิก',
        'STAMP',
        'STK',
        'CTT',
        'LASER',
        'TUBE',
        'QC',
        'PACK',
      ]) {
        if (qty[key] > 0) tracks[key] = {}
      }
      currentMaxIdx++

      const { error: planErr } = await supabase.from('plan_jobs').insert({
        id:
          'J' +
          Math.random().toString(36).slice(2, 8) +
          Date.now().toString(36).slice(-4),
        name: workOrderName,
        date: workOrderDate,
        cut: cutTime,
        qty,
        tracks,
        line_assignments: {},
        order_index: currentMaxIdx,
      })
      if (planErr) throw planErr

      success.push(`สร้างใบงาน "${workOrderName}" (${ids.length} บิล) สำเร็จ`)
    } catch (e) {
      errors.push(`ช่องทาง ${channelCode}: ${(e as Error).message}`)
    }
  }
  return { success, errors }
}

// คืนบิลที่เลือกออกจากใบงาน ไปยังสถานะใหม่
export async function revertBillsFromWorkOrder(
  workOrderName: string,
  selectedIds: number[],
  newStatus: OrderStatus,
  allBillsInWO: Order[],
  products: Product[],
) {
  const { error } = await supabase
    .from('orders')
    .update({ status: newStatus, work_order_name: null })
    .in('id', selectedIds)
  if (error) throw error
  await updateWorkOrderCount(workOrderName)
  const remaining = allBillsInWO.filter((b) => !selectedIds.includes(b.id))
  await updatePlannerJob(workOrderName, remaining, products)
}

// ยกเลิกบิลที่เลือกในใบงาน
export async function cancelBillsFromWorkOrder(
  workOrderName: string,
  selectedIds: number[],
  allBillsInWO: Order[],
  products: Product[],
) {
  const { error } = await supabase
    .from('orders')
    .update({ status: 'ยกเลิก', work_order_name: null })
    .in('id', selectedIds)
  if (error) throw error
  await updateWorkOrderCount(workOrderName)
  const remaining = allBillsInWO.filter((b) => !selectedIds.includes(b.id))
  await updatePlannerJob(workOrderName, remaining, products)
}

// ยกเลิกทั้งใบงาน (คืนบิลทั้งหมดไป "ลงข้อมูลเสร็จสิ้น" + ลบจากแผนผลิต)
export async function cancelWorkOrder(workOrderName: string) {
  await supabase
    .from('orders')
    .update({ status: 'ลงข้อมูลเสร็จสิ้น', work_order_name: null })
    .eq('work_order_name', workOrderName)
  await supabase.from('work_orders').delete().eq('work_order_name', workOrderName)
  await supabase.from('plan_jobs').delete().eq('name', workOrderName)
}

// ย้าย/ยกเลิก/ดึงกลับ บิลที่เลือก (สำหรับแท็บสถานะ)
export async function updateOrdersStatus(
  ids: number[],
  newStatus: OrderStatus,
) {
  const { error } = await supabase
    .from('orders')
    .update({ status: newStatus })
    .in('id', ids)
  if (error) throw error
}
