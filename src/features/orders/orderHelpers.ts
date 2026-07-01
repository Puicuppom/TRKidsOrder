import type { Order } from '../../types/db'

// ตรงกับเงื่อนไขค้นหาเดิม: bill_no / customer_name / tracking_number
export function orderMatchesSearch(order: Order, term: string): boolean {
  if (!term) return true
  const t = term.toLowerCase()
  return (
    !!order.bill_no?.toLowerCase().includes(t) ||
    !!order.customer_name?.toLowerCase().includes(t) ||
    !!order.tracking_number?.toLowerCase().includes(t)
  )
}

export interface BillingIndicator {
  label: string
  className: string
}

export function getBillingIndicator(order: Order): BillingIndicator | null {
  const b = order.billing_details
  if (!b) return null
  if (b.request_tax_invoice)
    return {
      label: '📄 ใบกำกับภาษี',
      className: 'border border-red-600 bg-red-100 text-red-700',
    }
  if (b.request_cash_bill)
    return {
      label: '💵 บิลเงินสด',
      className: 'border border-blue-600 bg-blue-50 text-blue-700',
    }
  return null
}

// ข้อความสถานะแพ็ค/ส่ง (เขียว) — ตรงกับ logic เดิม
export function getPackedInfo(order: Order): string | null {
  const isShippedOrPacked =
    order.status === 'จัดส่งแล้ว' || order.packing_meta?.scanTime
  if (!isShippedOrPacked) return null

  const timeToUse = order.packing_meta?.scanTime ?? order.shipped_time
  const staff = order.packing_meta?.scannedBy ?? order.shipped_by ?? 'N/A'
  if (!timeToUse) return null

  const displayTime = new Date(timeToUse).toLocaleString('th-TH', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  return `📦 แพ็คเสร็จ: ${displayTime} (${staff})`
}

// บิลในแท็บ "ลงข้อมูลเสร็จสิ้น" ต้องยังไม่ถูกแพ็ค/ส่ง
export function isUnpackedComplete(order: Order): boolean {
  const isAlreadyPacked = !!order.packing_meta?.scanTime
  const isShipped = !!order.shipped_time
  return !isAlreadyPacked && !isShipped
}
