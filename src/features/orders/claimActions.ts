import { supabase } from '../../lib/supabase'
import type { Order } from '../../types/db'

// เคลมที่ยัง active (ไม่นับที่ยกเลิก) ของบิลต้นฉบับนี้ — ใช้เตือน "เคลมซ้ำ"
export async function fetchActiveClaims(billNo: string): Promise<string[]> {
  const originalBillNo = billNo.replace(/^C\d*-/, '')
  const { data } = await supabase
    .from('orders')
    .select('bill_no')
    .like('bill_no', `C%-${originalBillNo}`)
    .neq('status', 'ยกเลิก')
  return (data ?? []).map((d) => d.bill_no as string)
}

// ประเภทเคลมที่เคยใช้ (สำหรับ dropdown)
export async function fetchClaimTypes(): Promise<string[]> {
  const { data } = await supabase
    .from('orders')
    .select('claim_type')
    .not('claim_type', 'is', null)
    .neq('claim_type', '')
  return [...new Set((data ?? []).map((d) => d.claim_type as string))].sort()
}

// สร้างบิลเคลมจากออร์เดอร์เดิม → บิลใหม่ C{n}-{บิลเดิม}, สถานะ "รอลงข้อมูล"
export async function createClaimOrder(
  order: Order,
  claimType: string,
  claimDetails: string,
  username: string,
): Promise<string> {
  const originalBillNo = order.bill_no.replace(/^C\d*-/, '')

  // นับบิลเคลมเดิมของบิลนี้ (ไม่นับที่ยกเลิก → เคลมที่ถูกยกเลิกจะไม่ทำให้เลขเดินเป็น C2)
  const { data: existing } = await supabase
    .from('orders')
    .select('bill_no')
    .like('bill_no', `C%-${originalBillNo}`)
    .neq('status', 'ยกเลิก')
  const n = (existing?.length ?? 0) + 1
  const newBillNo = `C${n}-${originalBillNo}`

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id, order_items, ...rest } = order
  const claimOrder = {
    ...rest,
    channel_code: 'CLAIM',
    bill_no: newBillNo,
    status: 'รอลงข้อมูล',
    price: 0,
    shipping_cost: 0,
    discount: 0,
    total_amount: 0,
    payment_method: null,
    payment_date: null,
    payment_time: null,
    promotion: null,
    work_order_name: null,
    shipped_by: null,
    shipped_time: null,
    tracking_number: null,
    packing_meta: null,
    transport_meta: null,
    created_at: new Date().toISOString(),
    entry_date: new Date().toISOString().slice(0, 10),
    admin_user: username,
    claim_type: claimType,
    claim_details: claimDetails,
  }

  const { data: inserted, error } = await supabase
    .from('orders')
    .insert(claimOrder)
    .select()
    .single()
  if (error) throw error

  const items = order.order_items ?? []
  if (items.length > 0) {
    const claimInfo = `[เคลม: ${claimType}${claimDetails ? ' - ' + claimDetails : ''}]`
    let seq = 1
    const toInsert = items.map((it) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id: _id, ...itemRest } = it
      const oldNotes = it.notes || ''
      return {
        ...itemRest,
        order_id: inserted.id,
        bill_no: newBillNo,
        item_uid: `${newBillNo}-${seq++}`,
        item_scan_time: null,
        packing_status: null,
        notes: oldNotes.includes(claimInfo)
          ? oldNotes
          : `${claimInfo} ${oldNotes}`.trim(),
      }
    })
    const { error: itemsErr } = await supabase.from('order_items').insert(toInsert)
    if (itemsErr) {
      await supabase.from('orders').delete().eq('id', inserted.id)
      throw itemsErr
    }
  }
  return newBillNo
}
