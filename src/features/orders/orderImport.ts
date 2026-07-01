import * as XLSX from 'xlsx'
import { supabase } from '../../lib/supabase'
import { generateNextBillNo } from './form/saveOrder'
import type { Product } from '../../types/db'

export interface ImportItem {
  product_id: number | null
  product_name: string
  ink_color?: string
  product_type?: string
  cartoon_pattern?: string
  line_pattern?: string
  font?: string
  line_1?: string
  line_2?: string
  line_3?: string
  quantity: number
  notes?: string
  file_attachment?: string
}

export interface ImportedOrder {
  bill_no?: string
  channel_code: string
  customer_name: string
  customer_address: string
  price: number
  shipping_cost: number
  discount: number
  total_amount: number
  payment_method: string
  promotion?: string
  payment_date: string | null
  payment_time: string | null
  items: ImportItem[]
}

export interface ImportSummary {
  complete: number
  waiting: number
  skipped: number
  incompleteBills: string[]
}

function findHeader(headers: string[], names: string[]): string | null {
  const lower = names.map((n) => n.toLowerCase().trim())
  for (const h of headers) {
    if (h && lower.includes(h.toLowerCase().trim())) return h
  }
  return null
}

function excelDateToJSDate(serial: number): Date | null {
  if (typeof serial !== 'number' || isNaN(serial)) return null
  const utcDays = Math.floor(serial - 25569)
  const dateInfo = new Date(utcDays * 86400 * 1000)
  const frac = serial - Math.floor(serial) + 1e-7
  let total = Math.floor(86400 * frac)
  const seconds = total % 60
  total -= seconds
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor(total / 60) % 60
  return new Date(
    dateInfo.getFullYear(),
    dateInfo.getMonth(),
    dateInfo.getDate(),
    hours,
    minutes,
    seconds,
  )
}

// ===== Templates =====
function downloadTemplate(headers: string[], sample: unknown[][], sheet: string, filename: string) {
  const ws = XLSX.utils.aoa_to_sheet([headers, ...sample])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheet)
  XLSX.writeFile(wb, filename)
}

export function downloadStandardTemplate() {
  downloadTemplate(
    ['ช่องทาง','ชื่อลูกค้า','ที่อยู่ลูกค้า','ราคา','ค่าส่ง','ส่วนลด','วิธีการชำระ','ชื่อโปรโมชั่น','วันที่ชำระ','เวลาที่ชำระ','ชื่อสินค้า','สีหมึก','ชั้นที่','ลายการ์ตูน','ลายเส้น','ฟอนต์','บรรทัด 1','บรรทัด 2','บรรทัด 3','จำนวน','หมายเหตุ','ไฟล์แนบ'],
    [['SP','สมชาย ใจดี','123/45 ถ.สุขุมวิท พระโขนง คลองเตย กทม. 10110',300,30,0,'โอน','โปร 9.9','2025-10-15','10:30','ป้ายชื่อรีดติด','ดำ','1','กระต่าย','เส้นปกติ','TH01','ด.ช. รักเรียน','ชั้น ป.1','',2,'ไม่มี','']],
    'OrderTemplate',
    'TRKids_Multi_Order_Template_Simple.xlsx',
  )
}
export function downloadPgtrTemplate() {
  downloadTemplate(
    ['#','วันที่สั่งซื้อ','เวลา','หลักฐานการโอน','ราคาก่อนส่วนลด','ค่าขนส่ง','coupon','ส่วนลด admin','ยอดสุทธิ','ตัวแทน','แอดมิน','ช่องทางการสั่งซื้อ','เลขออร์เดอร์','ชื่อสินค้า','รหัสสินค้า','ฟอนต์','รหัสรูปแบบ','Underline','Ink','สี','Label1','Label2','Label3','จำนวน','comment','remark','ชื่อสกุลผู้รับ','โทรศัพท์','อีเมล','จังหวัด','เขตอำเภอ','ตำบลปลายทาง','รหัสไปษณีย์','ที่อยู่ผู้รับ','ที่อยู่เต็ม'],
    [[]],
    'PGTR_Template',
    'TRKids_PGTR_Order_Template.xlsx',
  )
}
export function downloadWyTemplate() {
  downloadTemplate(
    ['เลขบิล','ชื่อลูกค้า','รหัสลูกค้า','วันที่สั่งซื้อ','เลขอ้างอิงชำระ','รหัส','สินค้า','บรรทัด1','บรรทัด2','font','จำนวน','ราคา','โค้ดส่วนลด','ส่วนลด','ราคาก่อนลด','ราคาหลังลด','ค่าส่ง','ยอดสุทธิ','หมายเหตุ','เลขพัสดุ','ชื่อ','นามสกุล','เบอร์โทร','ที่อยู่','แขวง/ตำบล','เขต/อำเภอ','จังหวัด','เลขไปษณีย์','ชื่อที่อยู่-เบอร์โทรผู้รับ'],
    [[]],
    'WY_Template',
    'TRKids_WY_Order_Template.xlsx',
  )
}

// ===== Parsers =====
type Row = Record<string, unknown>

function parseStandard(buf: ArrayBuffer, products: Product[]): ImportedOrder[] {
  const wb = XLSX.read(new Uint8Array(buf), { type: 'array' })
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], {
    header: 1,
    defval: '',
  })
  const out: ImportedOrder[] = []
  let current: ImportedOrder | null = null
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] as unknown[]
    if (r.every((c) => String(c).trim() === '')) continue
    if (String(r[0]).trim() && String(r[1]).trim()) {
      current = {
        channel_code: String(r[0]),
        customer_name: String(r[1]),
        customer_address: String(r[2]),
        price: parseFloat(String(r[3])) || 0,
        shipping_cost: parseFloat(String(r[4])) || 0,
        discount: parseFloat(String(r[5])) || 0,
        payment_method: String(r[6]),
        promotion: String(r[7]),
        payment_date: (r[8] as string) || null,
        payment_time: (r[9] as string) || null,
        total_amount: 0,
        items: [],
      }
      current.total_amount =
        current.price + current.shipping_cost - current.discount
      out.push(current)
    }
    if (String(r[10]).trim() && current) {
      const key = String(r[10]).toLowerCase()
      const p = products.find(
        (x) =>
          ((x.product_code || '').toLowerCase() === key ||
            x.product_name.toLowerCase().includes(key)) &&
          !String(x.product_code || '').startsWith('22'),
      )
      current.items.push({
        product_id: p ? p.id : null,
        product_name: p ? p.product_name : String(r[10]),
        ink_color: String(r[11]),
        product_type: String(r[12]),
        cartoon_pattern: String(r[13]),
        line_pattern: String(r[14]),
        font: String(r[15]),
        line_1: String(r[16]),
        line_2: String(r[17]),
        line_3: String(r[18]),
        quantity: parseInt(String(r[19])) || 1,
        notes: String(r[20]),
      })
    }
  }
  return out
}

function parsePgtr(buf: ArrayBuffer, products: Product[]): ImportedOrder[] {
  const wb = XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: true })
  const json = XLSX.utils.sheet_to_json<Row>(wb.Sheets[wb.SheetNames[0]], {
    raw: false,
  })
  const map = new Map<string, ImportedOrder>()
  if (json.length === 0) return []
  const headers = Object.keys(json[0])
  const orderH = findHeader(headers, ['เลขออร์เดอร์', 'เลขที่ออเดอร์', 'Order Number'])
  for (const r of json) {
    const rawB = String(r[orderH!] || '').trim()
    if (!rawB) continue
    let b = rawB
    const lastD = rawB.lastIndexOf('-')
    if (lastD > 0 && !isNaN(Number(rawB.substring(lastD + 1))))
      b = rawB.substring(0, lastD)
    if (!map.has(b)) {
      const pVal = parseFloat(String(r['ราคาก่อนส่วนลด'] || 0).replace(/,/g, '')) || 0
      const s = parseFloat(String(r['ค่าขนส่ง'] || 0).replace(/,/g, '')) || 0
      const d = parseFloat(String(r['ส่วนลด admin'] || 0).replace(/,/g, '')) || 0
      let pDate: string | null = null
      let pTime: string | null = null
      const rawDate = r['วันที่สั่งซื้อ']
      if (rawDate) {
        const dObj = new Date(rawDate as string)
        if (!isNaN(dObj.getTime())) {
          pDate = dObj.toISOString().split('T')[0]
          if (dObj.getHours() !== 0 || dObj.getMinutes() !== 0)
            pTime = `${String(dObj.getHours()).padStart(2, '0')}:${String(dObj.getMinutes()).padStart(2, '0')}`
        }
      }
      if (r['เวลา']) pTime = String(r['เวลา']).trim().substring(0, 5)
      map.set(b, {
        bill_no: b,
        channel_code: 'PGTR',
        customer_name: String(r['ชื่อสกุลผู้รับ'] || ''),
        customer_address: String(r['ที่อยู่เต็ม'] || ''),
        price: pVal,
        shipping_cost: s,
        discount: d,
        total_amount: pVal + s - d,
        payment_method: 'โอน',
        payment_date: pDate,
        payment_time: pTime,
        items: [],
      })
    }
    const curr = map.get(b)!
    const pCode = String(r['รหัสสินค้า'] || '').split('-')[0]
    const p = products.find(
      (x) => x.product_code === pCode && !String(x.product_code || '').startsWith('22'),
    )
    curr.items.push({
      product_id: p ? p.id : null,
      product_name: p ? p.product_name : String(r['ชื่อสินค้า'] || 'รหัสไม่ตรง'),
      ink_color: String(r['Ink'] || r['สี'] || '').trim(),
      cartoon_pattern:
        p && (p.product_category || '').toUpperCase().includes('UV')
          ? String(r['ชื่อสินค้า'] || '')
          : '',
      line_pattern: String(r['Underline'] || ''),
      font: String(r['ฟอนต์'] || r['font'] || ''),
      line_1: String(r['Label1'] || ''),
      line_2: String(r['Label2'] || ''),
      line_3: String(r['Label3'] || ''),
      quantity: parseInt(String(r['จำนวน'])) || 1,
      notes: String(r['comment'] || r['remark'] || ''),
    })
  }
  return Array.from(map.values())
}

function parseWy(buf: ArrayBuffer, products: Product[]): ImportedOrder[] {
  const wb = XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: true })
  const json = XLSX.utils.sheet_to_json<Row>(wb.Sheets[wb.SheetNames[0]], {
    raw: false,
  })
  const map = new Map<string, ImportedOrder>()
  for (const r of json) {
    const b = String(r['เลขบิล'] || '').trim()
    if (!b) continue
    const rowPrice = parseFloat(String(r['ราคาก่อนลด'] || 0).replace(/,/g, '')) || 0
    const rowShipping = parseFloat(String(r['ค่าส่ง'] || 0).replace(/,/g, '')) || 0
    const rowDiscount = parseFloat(String(r['ส่วนลด'] || 0).replace(/,/g, '')) || 0
    const rowTotal = parseFloat(String(r['ยอดสุทธิ'] || 0).replace(/,/g, '')) || 0
    if (!map.has(b)) {
      let pDate: string | null = null
      let pTime: string | null = null
      const rawDate = r['วันที่สั่งซื้อ']
      if (rawDate) {
        const dObj =
          typeof rawDate === 'number'
            ? excelDateToJSDate(rawDate)
            : new Date(rawDate as string)
        if (dObj && !isNaN(dObj.getTime())) {
          pDate = dObj.toISOString().split('T')[0]
          if (dObj.getHours() !== 0 || dObj.getMinutes() !== 0)
            pTime = `${String(dObj.getHours()).padStart(2, '0')}:${String(dObj.getMinutes()).padStart(2, '0')}`
        }
      }
      if (r['เวลา']) pTime = String(r['เวลา']).trim().substring(0, 5)
      map.set(b, {
        bill_no: b,
        channel_code: 'WY',
        customer_name: String(r['ชื่อลูกค้า'] || ''),
        customer_address: String(
          r['ชื่อที่อยู่-เบอร์โทรผู้รับ'] || r['ที่อยู่'] || r['เลขพัสดุ'] || '',
        ),
        price: rowPrice,
        shipping_cost: rowShipping,
        discount: rowDiscount,
        total_amount: rowTotal,
        payment_method: 'โอน',
        payment_date: pDate,
        payment_time: pTime,
        items: [],
      })
    } else {
      const ex = map.get(b)!
      ex.price += rowPrice
      ex.shipping_cost += rowShipping
      ex.discount += rowDiscount
      ex.total_amount += rowTotal
    }
    const p = products.find(
      (x) =>
        String(x.product_name).trim() === String(r['รหัส']).trim() &&
        String(x.product_code || '').startsWith('22'),
    )
    map.get(b)!.items.push({
      product_id: p ? p.id : null,
      product_name: p ? p.product_name : String(r['สินค้า'] || 'รหัสไม่ตรง'),
      cartoon_pattern: '',
      line_pattern: '',
      line_1: String(r['บรรทัด1'] || ''),
      line_2: String(r['บรรทัด2'] || ''),
      line_3: '',
      font: String(r['font'] || ''),
      quantity: parseInt(String(r['จำนวน'])) || 1,
      notes: String(r['หมายเหตุ'] || ''),
    })
  }
  return Array.from(map.values())
}

export interface ParseResult {
  orders: ImportedOrder[]
  useProvidedBillNo: boolean
}

// ตรวจประเภทไฟล์อัตโนมัติ → เลือก parser
export async function parseImportFile(
  file: File,
  products: Product[],
): Promise<ParseResult> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(new Uint8Array(buf), { type: 'array' })
  const json = XLSX.utils.sheet_to_json<Row>(wb.Sheets[wb.SheetNames[0]], {
    defval: '',
  })
  if (json.length === 0) throw new Error('ไฟล์ไม่มีข้อมูล')
  const headers = Object.keys(json[0])
  const orderH = findHeader(headers, ['เลขออร์เดอร์', 'เลขที่ออเดอร์', 'Order Number'])
  if (orderH) return { orders: parsePgtr(buf, products), useProvidedBillNo: true }
  if (
    headers.includes('เลขบิล') &&
    String(json[0]['เลขบิล']).toUpperCase().startsWith('WY')
  )
    return { orders: parseWy(buf, products), useProvidedBillNo: true }
  return { orders: parseStandard(buf, products), useProvidedBillNo: false }
}

// เพิ่มสินค้าแถม (หมึกแฟลช) สำหรับ STAMP ที่ใช้หมึกพลาสติก
function applyStampInk(order: ImportedOrder, products: Product[]) {
  for (const item of [...order.items]) {
    const product = products.find((p) => p.id === item.product_id)
    if (!product?.product_category?.toUpperCase().includes('STAMP')) continue
    const ink = item.ink_color || ''
    const color = ['เขียว', 'ดำ', 'แดง', 'น้ำเงิน'].find(
      (c) => ink.includes(c) && ink.includes('พลาสติก'),
    )
    if (!color) continue
    const inkProduct = products.find(
      (p) => p.product_name === `หมึกแฟลชพลาสติก 5 ml. (${color})`,
    )
    if (inkProduct && !order.items.some((it) => it.product_id === inkProduct.id)) {
      order.items.push({
        product_id: inkProduct.id,
        product_name: inkProduct.product_name,
        quantity: 1,
        notes: 'สินค้าแถม',
      })
    }
  }
}

function isComplete(order: ImportedOrder): boolean {
  if (!order.customer_name || !order.customer_address) return false
  if (order.channel_code !== 'CLAIM' && order.channel_code !== 'INFU') {
    if (order.total_amount <= 0 || !order.payment_method) return false
  }
  if (!order.items.length) return false
  return order.items.every((it) => it.product_id)
}

export async function saveImportedOrders(
  orders: ImportedOrder[],
  products: Product[],
  username: string,
  useProvidedBillNo: boolean,
): Promise<ImportSummary> {
  const today = new Date().toISOString().slice(0, 10)
  const summary: ImportSummary = {
    complete: 0,
    waiting: 0,
    skipped: 0,
    incompleteBills: [],
  }

  for (const order of orders) {
    try {
      const billNo = useProvidedBillNo
        ? order.bill_no!
        : await generateNextBillNo(order.channel_code)

      // เช็คบิลซ้ำ
      const { data: existing } = await supabase
        .from('orders')
        .select('id')
        .eq('bill_no', billNo)
        .limit(1)
      if (existing && existing.length > 0) {
        summary.skipped++
        continue
      }

      const complete = isComplete(order)
      const status = complete ? 'ลงข้อมูลเสร็จสิ้น' : 'รอลงข้อมูล'
      if (complete) summary.complete++
      else {
        summary.waiting++
        summary.incompleteBills.push(billNo)
      }

      applyStampInk(order, products)

      const { items, ...rest } = order
      const orderData = {
        ...rest,
        bill_no: billNo,
        status,
        entry_date: today,
        admin_user: username,
      }
      const { data: inserted, error } = await supabase
        .from('orders')
        .insert(orderData)
        .select()
        .single()
      if (error) throw error

      const toIns: Record<string, unknown>[] = []
      let seq = 1
      for (const item of items) {
        const qty = item.quantity || 1
        const { quantity: _q, ...base } = item
        void _q
        for (let i = 0; i < qty; i++) {
          toIns.push({
            ...base,
            order_id: inserted.id,
            bill_no: billNo,
            item_uid: `${billNo}-${seq++}`,
          })
        }
      }
      if (toIns.length > 0) {
        const { error: itemsErr } = await supabase
          .from('order_items')
          .insert(toIns)
        if (itemsErr) throw itemsErr
      }
    } catch (e) {
      console.error('Import error:', order.customer_name, e)
    }
  }
  return summary
}
