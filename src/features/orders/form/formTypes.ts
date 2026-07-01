// สถานะของแถวรายการสินค้าในฟอร์ม (ก่อนแตกตามจำนวนเป็น order_items)
export interface ItemRowState {
  uid: string
  product_id: number | null
  ink_color: string
  shelf_location: string // = product_type
  cartoon_pattern: string
  line_pattern: string
  font: string
  no_name: boolean
  line_1: string
  line_2: string
  line_3: string
  quantity: number
  notes: string
  file_attachment: string
  // meta
  isAutoAdded?: boolean // แถวหมึกแฟลชที่เพิ่มอัตโนมัติ
  linkedInkRowUid?: string
  isCondoPart?: boolean
  condoGroupId?: string
  qtyReadonly?: boolean
}

export interface PaymentRow {
  amount: number
  date: string
  time: string
  manual?: boolean
}

export interface TaxItemRow {
  product_name: string
  quantity: number
  unit_price: number
}

export function emptyItemRow(): ItemRowState {
  return {
    uid: 'row-' + Date.now() + Math.random().toString(36).slice(2),
    product_id: null,
    ink_color: '',
    shelf_location: '',
    cartoon_pattern: '',
    line_pattern: '',
    font: '',
    no_name: false,
    line_1: '',
    line_2: '',
    line_3: '',
    quantity: 1,
    notes: '',
    file_attachment: '',
  }
}
