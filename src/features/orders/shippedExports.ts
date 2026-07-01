import * as XLSX from 'xlsx'
import type { Order } from '../../types/db'

// Export ข้อมูลบิลที่จัดส่งแล้ว (แยกตามรายการสินค้า) เป็น xlsx
export function exportShippedData(orders: Order[]) {
  const headers = [
    'เลขบิล', 'ลูกค้า', 'เลขพัสดุ', 'ผู้จัดส่ง', 'เวลาจัดส่ง',
    'Item UID', 'ชื่อสินค้า', 'รายละเอียดสินค้า', 'ประเภทเคลม', 'รายละเอียดเคลม',
  ]
  const rows: (string | null | undefined)[][] = []
  for (const o of orders) {
    const shipped = o.shipped_time ? new Date(o.shipped_time).toLocaleString('th-TH') : 'N/A'
    const items = o.order_items ?? []
    if (items.length > 0) {
      for (const it of items) {
        const notes = (it.notes || '').replace(/\[SET-.*?\]/g, '').trim()
        const details = [it.line_1, it.line_2, it.line_3, it.font, it.ink_color, notes]
          .filter(Boolean)
          .join(' | ')
        rows.push([o.bill_no, o.customer_name, o.tracking_number, o.shipped_by, shipped, it.item_uid, it.product_name, details, o.claim_type || '', o.claim_details || ''])
      }
    } else {
      rows.push([o.bill_no, o.customer_name, o.tracking_number, o.shipped_by, shipped, 'N/A', 'N/A', 'N/A', o.claim_type || '', o.claim_details || ''])
    }
  }
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Shipped Data')
  XLSX.writeFile(wb, `ShippedData_${new Date().toISOString().slice(0, 10)}.xlsx`)
}

// Export CSV เลขพัสดุ (เลขบิล, Trackno, ชื่อขนส่ง)
export function exportTrackingCsv(orders: Order[], carrier: string) {
  const headers = ['เลขบิล', 'Trackno', 'ชื่อขนส่ง']
  const rows = orders.map((o) => [o.bill_no, o.tracking_number || '', carrier])
  const csv = [headers, ...rows].map((r) => r.join(',')).join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `Tracking_${carrier}_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
}
