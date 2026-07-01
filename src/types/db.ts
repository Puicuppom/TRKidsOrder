// โมเดลข้อมูลทั้งหมด — ตรงกับตารางใน Supabase
// อ้างอิงจากการใช้งานจริงในไฟล์ index.html เดิม

export type OrderStatus =
  | 'รอลงข้อมูล'
  | 'ลงข้อมูลเสร็จสิ้น'
  | 'ใบงาน (กำลังผลิต)'
  | 'จัดส่งแล้ว'
  | 'ยกเลิก'

export interface TaxItem {
  product_name: string
  quantity: number
  unit_price: number
}

export interface BillingDetails {
  request_tax_invoice: boolean
  request_cash_bill: boolean
  tax_customer_name?: string
  tax_customer_address?: string
  tax_id?: string
  tax_items: TaxItem[]
}

export interface PaymentRecord {
  amount: number
  date: string
  time: string
}

export interface PackingMeta {
  scanTime?: string
  scannedBy?: string
  parcelScanned?: boolean
}

export interface TransportMeta {
  verified: boolean
  verified_at: string
  verified_by: string
  carrier: string
  parcel_type: string
}

export interface OrderItem {
  id?: number
  order_id: number
  bill_no: string
  product_id: number
  product_name: string
  ink_color: string | null
  product_type: string | null // ตำแหน่งชั้นวาง (shelf_location)
  cartoon_pattern: string | null
  line_pattern: string | null
  font: string | null
  line_1: string | null
  line_2: string | null
  line_3: string | null
  notes: string | null
  file_attachment: string | null
  item_uid: string
  packing_status?: string | null // 'สแกนแล้ว' ฯลฯ
  item_scan_time?: string | null
}

export interface Order {
  id: number
  channel_code: string
  bill_no: string
  status: OrderStatus
  price: number
  shipping_cost: number
  discount: number
  total_amount: number
  payment_date: string | null
  payment_time: string | null
  payment_details: PaymentRecord[] | null
  payment_method: string | null
  promotion: string | null
  customer_name: string | null
  customer_address: string | null
  claim_type?: string | null
  claim_details?: string | null
  billing_details?: BillingDetails | null
  admin_user?: string | null
  entry_date?: string | null
  created_at?: string | null
  shipped_time?: string | null
  shipped_by?: string | null
  tracking_number?: string | null
  work_order_name?: string | null
  packing_meta?: PackingMeta | null
  transport_meta?: TransportMeta | null
  order_items?: OrderItem[]
}

export interface Product {
  id: number
  product_name: string
  product_code?: string | null
  product_type: string | null // 'FINISHPRODUCT' ฯลฯ
  product_category: string | null // STAMP / UV / LASER / TUBE / SUBLIMATION / STK / CONDO STAMP
  storage_location?: string | null // จุดเก็บ (ใบเบิก)
  rubber_code?: string | null // รหัสอะไหล่ยาง (ใบเบิก)
  image_url?: string | null // รูปสินค้า (หน้าแพ็ค)
  is_active: boolean | null
}

export interface Channel {
  channel_code: string
  channel_name: string
  default_carrier?: string | null
  bank_account?: string | null
}

export interface WorkOrder {
  id: number
  work_order_name: string
  channel_code: string
  status: string // 'กำลังผลิต' ฯลฯ
  created_at?: string | null
}

export interface InkType {
  ink_name: string
}

export interface PlanJob {
  id: string
  name: string
  date: string
  cut: string | null
  qty: Record<string, number> | null
  tracks?: Record<string, unknown> | null
  line_assignments?: Record<string, unknown> | null
  order_index: number
}

export interface BankStatement {
  id: number
  statement_date: string
  statement_time: string
  description: string | null
  deposit_amount: number
  balance?: number | null
  channel: string | null
  details: string | null
  withdrawal_amount?: number | null
  is_matched: boolean
  unique_hash?: string | null
  bank_account?: string | null
  bill_no?: string | null
}

export interface CartoonPattern {
  id: number
  pattern_code?: string | null
  pattern_name?: string | null
  image_url?: string | null
  [key: string]: unknown
}
