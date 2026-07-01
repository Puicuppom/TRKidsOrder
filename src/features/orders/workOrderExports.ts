import * as XLSX from 'xlsx'
import { supabase } from '../../lib/supabase'
import type { Order, OrderItem, Product } from '../../types/db'

// กัน Excel ตัดเลข 0/+ นำหน้า
function forceText(val: unknown): string {
  const str = String(val ?? '').trim()
  return str.startsWith('+') || str.startsWith('0') ? '​' + str : str
}

const cleanNotes = (n: string | null | undefined) =>
  (n || '').replace(/\[SET-.*?\]/g, '').trim()

// ดึง orders + order_items ทั้งหมดของใบงาน (วนจนครบ)
async function fetchWorkOrderItems(
  workOrderName: string,
): Promise<{ orders: Order[]; items: OrderItem[] }> {
  const orders: Order[] = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('orders')
      .select('id, bill_no, claim_type, claim_details')
      .eq('work_order_name', workOrderName)
      .range(from, from + 999)
    if (error) throw error
    orders.push(...((data as Order[]) ?? []))
    if (!data || data.length < 1000) break
    from += 1000
  }
  if (orders.length === 0) return { orders: [], items: [] }

  const orderIds = orders.map((o) => o.id)
  const items: OrderItem[] = []
  let fromI = 0
  while (true) {
    const { data, error } = await supabase
      .from('order_items')
      .select('*')
      .in('order_id', orderIds)
      .range(fromI, fromI + 999)
    if (error) throw error
    items.push(...((data as OrderItem[]) ?? []))
    if (!data || data.length < 1000) break
    fromI += 1000
  }
  items.sort((a, b) =>
    (a.item_uid || '').localeCompare(b.item_uid || '', undefined, {
      numeric: true,
    }),
  )
  return { orders, items }
}

function downloadCsv(filename: string, content: string) {
  const blob = new Blob(['﻿' + content], {
    type: 'text/csv;charset=utf-8;',
  })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = filename
  link.click()
}

// ===== Export ไฟล์ผลิต (xlsx) =====
export async function exportForProduction(workOrderName: string) {
  const { items } = await fetchWorkOrderItems(workOrderName)
  if (items.length === 0) throw new Error('ไม่พบข้อมูลออร์เดอร์ในใบงานนี้')
  const headers = [
    'ชื่อใบงาน', 'เลขบิล', 'Item UID', 'ชื่อสินค้า', 'สีหมึก', 'ชั้นที่',
    'ลายการ์ตูน', 'ลายเส้น', 'ฟอนต์', 'บรรทัด 1', 'บรรทัด 2', 'บรรทัด 3',
    'จำนวน', 'หมายเหตุ', 'ไฟล์แนบ',
  ]
  const rows = items.map((it) => [
    workOrderName, it.bill_no, it.item_uid, it.product_name, it.ink_color,
    it.product_type, it.cartoon_pattern, it.line_pattern, it.font,
    forceText(it.line_1), forceText(it.line_2), forceText(it.line_3),
    1, cleanNotes(it.notes), it.file_attachment,
  ])
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'ProductionData')
  XLSX.writeFile(wb, `Production_${workOrderName}.xlsx`)
}

// ===== Copy ไฟล์ผลิต (TSV → clipboard) =====
export async function copyForProduction(workOrderName: string): Promise<number> {
  const { items } = await fetchWorkOrderItems(workOrderName)
  if (items.length === 0) throw new Error('ไม่พบข้อมูลออร์เดอร์ในใบงานนี้')
  const tsv = items
    .map((it) =>
      [
        workOrderName, it.bill_no, it.item_uid, it.product_name, it.ink_color,
        it.product_type, it.cartoon_pattern, it.line_pattern, it.font,
        String(it.line_1 || '').trim(), String(it.line_2 || '').trim(),
        String(it.line_3 || '').trim(), 1, cleanNotes(it.notes),
        it.file_attachment,
      ].join('\t'),
    )
    .join('\n')
  await navigator.clipboard.writeText(tsv)
  return items.length
}

// ===== Export สำหรับ QC (xlsx) =====
export async function exportForQC(workOrderName: string, products: Product[]) {
  const { orders, items } = await fetchWorkOrderItems(workOrderName)
  if (items.length === 0) throw new Error('ไม่พบข้อมูลออร์เดอร์ในใบงานนี้')
  const headers = [
    'ชื่อใบงาน', 'เลขบิล', 'Item UID', 'รหัสสินค้า', 'ชื่อสินค้า', 'หมวดหมู่สินค้า',
    'สีหมึก', 'ชั้นที่', 'ลายการ์ตูน', 'ลายเส้น', 'ฟอนต์', 'บรรทัด 1', 'บรรทัด 2',
    'บรรทัด 3', 'จำนวน', 'หมายเหตุ', 'ไฟล์แนบ', 'ประเภทเคลม', 'รายละเอียดเคลม',
  ]
  const rows = items.map((it) => {
    const parent = orders.find((o) => o.id === it.order_id)
    const prod = products.find((p) => p.id === it.product_id)
    return [
      workOrderName, it.bill_no, it.item_uid, prod?.product_code ?? 'N/A',
      it.product_name, prod?.product_category ?? 'N/A', it.ink_color,
      it.product_type, it.cartoon_pattern, it.line_pattern, it.font,
      forceText(it.line_1), forceText(it.line_2), forceText(it.line_3), 1,
      cleanNotes(it.notes), it.file_attachment, parent?.claim_type ?? '',
      parent?.claim_details ?? '',
    ]
  })
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'QC_Data')
  XLSX.writeFile(wb, `QC_${workOrderName}.xlsx`)
}

// ===== ทำ Barcode (csv) =====
export async function exportForBarcode(
  workOrderName: string,
  products: Product[],
) {
  const { items } = await fetchWorkOrderItems(workOrderName)
  if (items.length === 0) throw new Error('ไม่พบข้อมูลออร์เดอร์ในใบงานนี้')
  const headers = ['Item UID', 'ชื่อสินค้า', 'สีหมึก', 'บรรทัด 1', 'หมวด']
  const rows = items.map((it) => {
    const prod = products.find((p) => p.id === it.product_id)
    const category = prod?.product_category || 'N/A'
    const l1 = String(it.line_1 || '').trim()
    const l2 = String(it.line_2 || '').trim()
    let combined = l1
    if (l2) combined += (combined ? ' // ' : '') + l2
    return [
      it.item_uid, it.product_name, it.ink_color,
      combined ? '​' + combined : '', category,
    ]
  })
  const csv = [headers, ...rows]
    .map((r) =>
      r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','),
    )
    .join('\n')
  downloadCsv(`Barcode_${workOrderName}.csv`, csv)
}

// ===== นำเข้าเลขพัสดุจากไฟล์ Excel/CSV =====
function findHeader(headers: string[], candidates: string[]): string | null {
  for (const c of candidates) {
    const found = headers.find((h) => h.trim() === c)
    if (found) return found
  }
  return null
}

export async function importTrackingFile(file: File): Promise<number> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(new Uint8Array(buf), { type: 'array' })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
  })
  if (json.length === 0) throw new Error('ไฟล์ไม่มีข้อมูล')

  const headers = Object.keys(json[0])
  const billHeader = findHeader(headers, [
    'bill_no', 'เลขออเดอร์', 'เลขที่ออเดอร์', 'Order Number', 'เลขบิล',
  ])
  const trackHeader = findHeader(headers, [
    'tracking_number', 'เลขพัสดุ', 'Tracking Number', 'เลขพัสดุ/Tracking No.',
  ])
  if (!billHeader || !trackHeader)
    throw new Error(
      "ไม่พบคอลัมน์ที่ต้องการ\n(ตั้งชื่อคอลัมน์เป็น 'เลขออเดอร์' และ 'เลขพัสดุ')",
    )

  const updates = json
    .map((row) => ({
      bill_no: String(row[billHeader] ?? '').trim(),
      tracking_number: String(row[trackHeader] ?? '').trim(),
    }))
    .filter((u) => u.bill_no && u.tracking_number)

  if (updates.length === 0) throw new Error('ไม่พบข้อมูลที่สมบูรณ์สำหรับอัปเดต')

  const { data, error } = await supabase.rpc('update_tracking_numbers_batch', {
    p_updates: updates,
  })
  if (error) throw error
  return (data as number) ?? updates.length
}

// คัดลอกเลขพัสดุจากช่องที่อยู่ (กรณีที่อยู่เป็นเลขพัสดุ) ไปยังช่อง tracking
const trackingRe =
  /^(SPXTH|LEX|TH|KEX|KER|SHP|88|66|J&T|6B|OB|P|FLASH|KRY)[A-Z0-9]+$/

export async function autoFillTrackingFromAddress(
  billsInWO: Order[],
): Promise<number> {
  const toUpdate = billsInWO
    .filter((o) => {
      const addr = (o.customer_address || '').trim().toUpperCase()
      return (
        !o.tracking_number &&
        addr.length >= 9 &&
        !addr.includes(' ') &&
        trackingRe.test(addr)
      )
    })
    .map((o) => ({
      id: o.id,
      bill_no: o.bill_no,
      channel_code: o.channel_code,
      tracking_number: (o.customer_address || '').trim().toUpperCase(),
      customer_address: (o.customer_address || '').trim(),
    }))

  if (toUpdate.length === 0) return 0
  const { error } = await supabase.from('orders').upsert(toUpdate)
  if (error) throw error
  return toUpdate.length
}
