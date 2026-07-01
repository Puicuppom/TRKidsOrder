import * as XLSX from 'xlsx'
import {
  normalizeInline,
  collectPhones,
  th2ar,
  extractNameAndAddressSmart,
  stripPhonesFromText,
  stripPostcodeTokens,
  stripSpecificPostcode,
} from './addressParser'
import type { Order } from '../../types/db'

// หัวคอลัมน์ไฟล์ Flash Express (ตามต้นฉบับ)
export const H = [
  '客户订单号\nCustomer_order_number\n(เลขออเดอร์ของลูกค้า)',
  '收件人名称\n*Consignee_name\n(ชื่อผู้รับ)',
  '地址\n*Address\n(ทิ่อยู่)',
  '邮编\n*Postal_code\n(รหัสไปรษณีย์)',
  '手机号\n*Phone_number\n(เบอร์โทรศัพท์)',
  '手机号2\nPhone_number2\n(เบอร์โทรศัพท์)',
  '包裹数量\nNumber of parcels \n（จำนวนพัสดุ）',
  'COD\n(ยอดเรียกเก็บ)',
  '\n商品描述1（名称|尺寸/重量|颜色|数量）\nItem description1(Name|Size/Weight|color|quantity)\nรายละเอียดสินค้า 1 (ชื่อสินค้า | ขนาด/น้ำหนัก | สี | จำนวน)',
  '商品描述2（名称|尺寸/重量|颜色|数量）\nItem description2(Name|Size/Weight|color|quantity)\nรายละเอียดสินค้า 2',
  '商品描述3\nItem description3\nรายละเอียดสินค้า 3',
  '商品描述4\nItem description4\nรายละเอียดสินค้า 4',
  '商品描述5\nItem description5\nรายละเอียดสินค้า 5',
  '物品类型\nItem_type\n(ประเภทสินค้า)',
  '重量\n*Weight_kg\n(น้ำหนัก)',
  '长\nLength\n(ยาว)',
  '宽\nWidth\n(กว้าง)',
  '高\nHeight\n(สูง)',
  'Flash_care',
  'Flash_care_plus',
  '申报价值\nDeclared_value\n(มูลค่าสินค้าที่ระบุโดยลูกค้า)',
  'Box_shield',
  '文件返还服务\nDocument return service\n(บริการส่งคืนเอกสาร)',
  '寄件产品\n*Product_type\n(ประเภทสินค้า）',
  '付款方式\n*Payment method\n（วิธีชำระเงิน）',
  '备注\nRemark\n(หมายเหตุ)',
  '配送偏好地点备注\nDelivery Preference_location note',
  '配送联系偏好备注\nDelivery Preference_contact note',
]

export const PREVIEW_HEADERS = [
  'Address (ต้นฉบับ)',
  '*Consignee_name\n(ชื่อผู้รับ)',
  '*Address\n(ทิ่อยู่)',
  '*Postal_code\n(รหัสไปรษณีย์)',
  '*Phone_number\n(เบอร์โทรศัพท์)',
  'Phone_number2\n(เบอร์โทรศัพท์)',
  'COD\n(ยอดเรียกเก็บ)',
]
const REQUIRED_KEYS = [1, 2, 3, 4] // index ใน PREVIEW_HEADERS ที่บังคับ

export type FlashRow = Record<string, string>

export function rowHasMissing(row: FlashRow): boolean {
  return REQUIRED_KEYS.some((i) => {
    const k = PREVIEW_HEADERS[i]
    return !row[k] || String(row[k]).trim() === ''
  })
}

// สร้างแถว Flash จากบิลในใบงาน
export function buildFlashRows(bills: Order[]): FlashRow[] {
  const out: FlashRow[] = []
  for (const bill of bills) {
    const orderNo = (bill.bill_no || '').trim()
    if (!orderNo) continue
    const addressRaw = bill.customer_address || ''

    const isCod = (bill.payment_method || '').toLowerCase().includes('cod')
    const codRaw = isCod ? String(bill.total_amount || '0').trim() : '0'

    const s0 = normalizeInline(addressRaw)
    const phones = collectPhones(s0)
    const phone1 = phones[0] || ''
    const phone2 = phones[1] || ''

    const all5 = [...th2ar(s0).matchAll(/\b(\d{5})\b/g)]
    const pcFallback = all5.length ? all5[all5.length - 1][1] : ''

    const parsed = extractNameAndAddressSmart(s0)
    const finalPostcode = parsed.postcode || pcFallback
    let address = parsed.address
    address = stripPhonesFromText(address, phones)
    address = stripPostcodeTokens(address)
    address = stripSpecificPostcode(address, finalPostcode)
    address = address
      .replace(/[ ,;:|\-]+$/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim()

    const row: FlashRow = {}
    // คอลัมน์พรีวิว
    row[PREVIEW_HEADERS[0]] = addressRaw
    row[PREVIEW_HEADERS[1]] = parsed.name
    row[PREVIEW_HEADERS[2]] = address
    row[PREVIEW_HEADERS[3]] = finalPostcode
    row[PREVIEW_HEADERS[4]] = phone1
    row[PREVIEW_HEADERS[5]] = phone2
    row[PREVIEW_HEADERS[6]] = codRaw
    // คอลัมน์ส่งออก (H)
    row[H[0]] = orderNo
    row[H[1]] = parsed.name
    row[H[2]] = address
    row[H[3]] = finalPostcode
    row[H[4]] = phone1
    row[H[5]] = phone2
    row[H[6]] = '1'
    row[H[7]] = codRaw
    row[H[13]] = 'อื่นๆ'
    row[H[14]] = '0.1'
    row[H[15]] = '1'
    row[H[16]] = '1'
    row[H[17]] = '1'
    row[H[23]] = 'Standard'
    row[H[24]] = 'payment by sender'
    row[H[25]] = orderNo
    out.push(row)
  }
  return out
}

// sync ค่าที่แก้ในพรีวิว → คอลัมน์ส่งออก
export function syncPreviewToExport(row: FlashRow, previewIndex: number, value: string) {
  const map: Record<number, number> = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 7 }
  row[PREVIEW_HEADERS[previewIndex]] = value
  if (map[previewIndex] !== undefined) row[H[map[previewIndex]]] = value
}

export function exportFlashXlsx(rows: FlashRow[], filename: string) {
  const aoa = [H, ...rows.map((r) => H.map((h) => (r[h] ?? '').toString()))]
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = H.map((h) => ({
    wch: Math.min(45, Math.max(14, h.split('\n')[0].length + 6)),
  }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Export')
  XLSX.writeFile(wb, `${filename || 'output'}.xlsx`)
}
