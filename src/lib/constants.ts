import type { OrderStatus } from '../types/db'

// ช่องทาง E-commerce (ที่อยู่ลูกค้า = เลขพัสดุ ไม่ต้องพิมพ์ใบปะหน้าเอง)
export const ecommerceChannels = ['SPTR', 'FSPTR', 'LZTR', 'TTTR', 'SHOP']

// ช่องทางที่ใช้ "เรียงใบปะหน้า"
export const waybillSortChannels = ['FSPTR', 'SPTR', 'TTTR', 'LZTR', 'SHOP']

export const ORDER_STATUSES: OrderStatus[] = [
  'รอลงข้อมูล',
  'ลงข้อมูลเสร็จสิ้น',
  'ใบงาน (กำลังผลิต)',
  'จัดส่งแล้ว',
  'ยกเลิก',
]

// แท็บในระบบออร์เดอร์ → สถานะที่ใช้ดึงข้อมูล
export const TAB_STATUS: Record<string, OrderStatus> = {
  waiting: 'รอลงข้อมูล',
  complete: 'ลงข้อมูลเสร็จสิ้น',
  'work-orders': 'ใบงาน (กำลังผลิต)',
  shipped: 'จัดส่งแล้ว',
  cancelled: 'ยกเลิก',
}
