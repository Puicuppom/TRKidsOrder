import { supabase } from '../../../lib/supabase'
import { ecommerceChannels } from '../../../lib/constants'
import type {
  ItemRowState,
  PaymentRow,
  TaxItemRow,
} from './formTypes'
import type { Order, OrderStatus, Product } from '../../../types/db'

export interface OrderFormValues {
  channelCode: string
  adminUser: string
  customerName: string
  customerAddress: string
  claimType: string
  claimDetails: string
  price: number
  shippingCost: number
  discount: number
  totalAmount: number
  paymentMethod: string
  promotion: string
  requestTaxInvoice: boolean
  requestCashBill: boolean
  taxCustomerName: string
  taxCustomerAddress: string
  taxId: string
  taxItems: TaxItemRow[]
  paymentRecords: PaymentRow[]
  items: ItemRowState[]
}

// สร้างเลขบิลถัดไป (เหมือน generateNextBillNo เดิม)
export async function generateNextBillNo(channelCode: string): Promise<string> {
  const today = new Date()
  const year = String(today.getFullYear() + 543).slice(-2)
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const prefix = `${channelCode}${year}${month}`
  const { data, error } = await supabase
    .from('orders')
    .select('bill_no')
    .like('bill_no', `${prefix}%`)
    .order('bill_no', { ascending: false })
    .limit(1)
  if (error) throw new Error(`ค้นหาบิลล่าสุดไม่ได้: ${error.message}`)
  let next = 1
  if (data && data.length > 0) {
    const last = parseInt(data[0].bill_no.slice(prefix.length), 10)
    if (!isNaN(last)) next = last + 1
  }
  return `${prefix}${String(next).padStart(5, '0')}`
}

// ตรวจสอบเงื่อนไข + บันทึก order และ order_items
export async function saveOrder(
  values: OrderFormValues,
  opts: {
    status: OrderStatus | null // ปุ่มที่กด (null = อัปเดตคงสถานะเดิม)
    products: Product[]
    editingOrder: Order | null
  },
): Promise<string> {
  const { status, products, editingOrder } = opts
  const isUpdate = !!editingOrder
  const v = values
  const channelCode = v.channelCode
  const customerName = v.customerName.trim()
  const customerAddress = v.customerAddress.trim()

  if (!customerName) throw new Error("กรุณากรอก 'ชื่อลูกค้า' ก่อนทำการบันทึก")

  // ตรวจ prefix ชื่อลูกค้าตามช่องทาง
  if (channelCode === 'SPTR' && !customerName.startsWith('26'))
    throw new Error("❌ ช่องทาง SPTR: ชื่อลูกค้าต้องขึ้นต้นด้วย '26'")
  if (channelCode === 'TTTR' && !customerName.startsWith('58'))
    throw new Error("❌ ช่องทาง TTTR: ชื่อลูกค้าต้องขึ้นต้นด้วย '58'")
  if (
    channelCode === 'LZTR' &&
    !(customerName.startsWith('10') || customerName.startsWith('11'))
  )
    throw new Error("❌ ช่องทาง LZTR: ชื่อลูกค้าต้องขึ้นต้นด้วย '10' หรือ '11'")

  const effectiveStatus = status || editingOrder?.status || null
  const isBillingRequested = v.requestTaxInvoice || v.requestCashBill
  const validItems = v.items.filter((it) => it.product_id)

  if (effectiveStatus === 'ลงข้อมูลเสร็จสิ้น') {
    if (channelCode === 'CLAIM' && customerAddress.toUpperCase().startsWith('TH'))
      throw new Error(
        "❌ ช่องทาง CLAIM ต้องระบุ 'ที่อยู่ลูกค้า' ห้ามใส่เลขพัสดุ (TH...)",
      )

    // ตรวจเลขพัสดุซ้ำ (ช่องทาง e-commerce)
    if (ecommerceChannels.includes(channelCode) && customerAddress) {
      let query = supabase
        .from('orders')
        .select('bill_no, customer_name')
        .eq('customer_address', customerAddress)
        .neq('status', 'ยกเลิก')
      if (isUpdate) query = query.neq('id', editingOrder!.id)
      const { data: dup } = await query
      if (dup && dup.length > 0)
        throw new Error(`❌ เลขพัสดุซ้ำ! ถูกใช้ไปแล้วในบิล: ${dup[0].bill_no}`)
    }

    if (!customerAddress) throw new Error("กรุณากรอก 'ที่อยู่ลูกค้า / เลขพัสดุ'")

    if (validItems.length === 0 && !isBillingRequested)
      throw new Error(
        '❌ บันทึกไม่ได้: ต้องมีรายการสินค้าอย่างน้อย 1 รายการ หรือเลือกขอใบกำกับ/บิลเงินสด',
      )

    if (channelCode !== 'CLAIM' && channelCode !== 'INFU') {
      if (v.totalAmount <= 0) throw new Error('ยอดสุทธิต้องมากกว่า 0')
      if (!v.paymentMethod) throw new Error("กรุณาเลือก 'วิธีการชำระเงิน'")
      if (
        v.paymentMethod === 'โอน' &&
        (!v.paymentRecords[0]?.date || !v.paymentRecords[0]?.time)
      )
        throw new Error("กรุณากรอก 'วันที่' และ 'เวลาที่ชำระ'")
    }

    // ตรวจ field ตามหมวดสินค้า
    let rowIndex = 1
    for (const it of validItems) {
      const product = products.find((p) => p.id === it.product_id)
      const category = (product?.product_category || '').toUpperCase()
      const req = (val: string, name: string) => {
        if (!val.trim())
          throw new Error(
            `แถวที่ ${rowIndex} (${product?.product_name}): กรุณากรอก '${name}'`,
          )
      }
      if (category.includes('STAMP')) {
        req(it.ink_color, 'สีหมึก')
        req(it.cartoon_pattern, 'ลายการ์ตูน')
        if (!it.no_name) req(it.line_1, 'บรรทัด 1')
      } else if (
        category.includes('UV') ||
        category.includes('LASER') ||
        category.includes('TUBE') ||
        category.includes('SUBLIMATION')
      ) {
        req(it.cartoon_pattern, 'ลายการ์ตูน')
        if (!it.no_name) req(it.line_1, 'บรรทัด 1')
        if (category.includes('UV')) {
          const pat = (it.cartoon_pattern || '').trim().toUpperCase()
          if ((pat.startsWith('L') || pat.startsWith('G')) && !it.no_name)
            req(it.line_2, 'บรรทัด 2 (ลาย L/G)')
        }
      } else if (category.includes('STK')) {
        if (!it.no_name) req(it.line_1, 'บรรทัด 1')
      }
      rowIndex++
    }
  }

  // เตรียมข้อมูลบันทึก
  const billNo = isUpdate
    ? editingOrder!.bill_no
    : await generateNextBillNo(channelCode)
  const currentStatus: OrderStatus =
    status || editingOrder?.status || 'รอลงข้อมูล'

  const paymentRecords = v.paymentRecords
    .filter((p) => (p.amount || 0) > 0)
    .map((p) => ({ amount: p.amount, date: p.date, time: p.time }))

  const orderData: Record<string, unknown> = {
    channel_code: channelCode,
    bill_no: billNo,
    status: currentStatus,
    price: v.price || 0,
    shipping_cost: v.shippingCost || 0,
    discount: v.discount || 0,
    total_amount: v.totalAmount,
    payment_date: v.paymentRecords[0]?.date || null,
    payment_time: v.paymentRecords[0]?.time || null,
    payment_details: paymentRecords,
    payment_method: v.paymentMethod,
    promotion: v.promotion.trim(),
    customer_name: customerName,
    customer_address: customerAddress,
  }

  if (channelCode === 'CLAIM') {
    orderData.claim_type = v.claimType.trim()
    orderData.claim_details = v.claimDetails.trim()
  }

  orderData.billing_details = {
    request_tax_invoice: v.requestTaxInvoice,
    request_cash_bill: v.requestCashBill,
    tax_customer_name: v.taxCustomerName,
    tax_customer_address: v.taxCustomerAddress,
    tax_id: v.taxId,
    tax_items: isBillingRequested ? v.taxItems : [],
  }

  let targetOrderId = editingOrder?.id
  if (isUpdate) {
    const { error } = await supabase
      .from('orders')
      .update(orderData)
      .eq('id', editingOrder!.id)
    if (error) throw error
  } else {
    orderData.admin_user = v.adminUser
    orderData.entry_date = new Date().toISOString().slice(0, 10)
    const { data: inserted, error } = await supabase
      .from('orders')
      .insert(orderData)
      .select()
      .single()
    if (error) throw error
    targetOrderId = inserted.id
  }

  // บันทึกรายการสินค้า (ยกเว้นบิลที่จัดส่งแล้ว)
  if (currentStatus !== 'จัดส่งแล้ว' && targetOrderId) {
    await supabase.from('order_items').delete().eq('order_id', targetOrderId)
    const toInsert: Record<string, unknown>[] = []
    let seq = 1
    for (const it of validItems) {
      const product = products.find((p) => p.id === it.product_id)!
      const qty = it.quantity || 1
      let notes = it.no_name
        ? `[ไม่รับชื่อ] ${it.notes}`.trim()
        : it.notes
      if (channelCode === 'CLAIM' && v.claimType.trim()) {
        const prefix = `[เคลม: ${v.claimType.trim()}${
          v.claimDetails.trim() ? ' - ' + v.claimDetails.trim() : ''
        }]`
        if (!notes.includes(prefix)) notes = `${prefix} ${notes}`.trim()
      }
      const base = {
        order_id: targetOrderId,
        bill_no: billNo,
        product_id: product.id,
        product_name: product.product_name,
        ink_color: it.ink_color,
        product_type: it.shelf_location,
        cartoon_pattern: it.cartoon_pattern,
        line_pattern: it.line_pattern,
        font: it.font,
        line_1: it.no_name ? '' : it.line_1,
        line_2: it.no_name ? '' : it.line_2,
        line_3: it.no_name ? '' : it.line_3,
        notes,
        file_attachment: it.file_attachment,
      }
      for (let i = 0; i < qty; i++)
        toInsert.push({ ...base, item_uid: `${billNo}-${seq++}` })
    }
    if (toInsert.length > 0) {
      const { error } = await supabase.from('order_items').insert(toInsert)
      if (error) throw error
    }
  }

  return billNo
}
