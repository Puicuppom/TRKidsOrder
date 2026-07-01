import { useMemo, useState } from 'react'
import { useAuth } from '../../auth/useAuth'
import {
  useProducts,
  useChannels,
  useInkTypes,
} from '../../../hooks/useMetadata'
import { supabase } from '../../../lib/supabase'
import SearchSelect from '../../../components/SearchSelect'
import OrderItemsTable from './OrderItemsTable'
import {
  emptyItemRow,
  type ItemRowState,
  type PaymentRow,
  type TaxItemRow,
} from './formTypes'
import {
  getFilteredProducts,
  getFontsForChannel,
  categoryOf,
} from './formConstants'
import { saveOrder, type OrderFormValues } from './saveOrder'
import { ecommerceChannels } from '../../../lib/constants'
import { useQueryClient } from '@tanstack/react-query'
import { useRef } from 'react'
import {
  downloadStandardTemplate,
  downloadPgtrTemplate,
  downloadWyTemplate,
  parseImportFile,
  saveImportedOrders,
} from '../orderImport'
import type { Order, OrderStatus, Product } from '../../../types/db'

interface Props {
  editingOrder: Order | null
  onSaved: (billNo: string) => void
  onCancel?: () => void
}

// แตกรายการ order_items เป็นแถวฟอร์ม (รวมรายการเหมือนกันเป็นจำนวน)
function groupItemsToRows(order: Order, products: Product[]): ItemRowState[] {
  const items = [...(order.order_items || [])].sort((a, b) =>
    (a.item_uid || '').localeCompare(b.item_uid || '', undefined, {
      numeric: true,
    }),
  )
  const map: Record<string, ItemRowState> = {}
  const rows: ItemRowState[] = []
  for (const it of items) {
    const product = products.find((p) => p.id === it.product_id)
    const isCondo = (product?.product_category || '')
      .toUpperCase()
      .includes('CONDO STAMP')
    const uniquePart = isCondo ? it.item_uid : ''
    const key = [
      it.product_id,
      it.ink_color,
      it.product_type,
      it.cartoon_pattern,
      it.line_pattern,
      it.font,
      it.line_1,
      it.line_2,
      it.line_3,
      it.notes,
      it.file_attachment,
      uniquePart,
    ].join('||')
    if (!map[key]) {
      const noName = (it.notes || '').includes('[ไม่รับชื่อ]')
      map[key] = {
        ...emptyItemRow(),
        product_id: it.product_id,
        ink_color: it.ink_color || '',
        shelf_location: it.product_type || '',
        cartoon_pattern: it.cartoon_pattern || '',
        line_pattern: it.line_pattern || '',
        font: it.font || '',
        no_name: noName,
        line_1: it.line_1 || '',
        line_2: it.line_2 || '',
        line_3: it.line_3 || '',
        notes: (it.notes || '')
          .replace('[ไม่รับชื่อ]', '')
          .replace(/\[SET-.*?\]/g, '')
          .replace(/\[เคลม:.*?\]/g, '')
          .trim(),
        file_attachment: it.file_attachment || '',
        quantity: 1,
      }
      rows.push(map[key])
    } else {
      map[key].quantity++
    }
  }
  return rows
}

export default function OrderForm({ editingOrder, onSaved, onCancel }: Props) {
  const { user } = useAuth()
  const role = user?.role
  const { data: products = [] } = useProducts()
  const { data: channels = [] } = useChannels()
  const { data: inkTypes = [] } = useInkTypes()

  const isEdit = !!editingOrder
  const status = editingOrder?.status

  // ===== state =====
  const [channelCode, setChannelCode] = useState(
    editingOrder?.channel_code ?? '',
  )
  const [customerName, setCustomerName] = useState(
    editingOrder?.customer_name ?? '',
  )
  const [customerAddress, setCustomerAddress] = useState(
    editingOrder?.customer_address ?? '',
  )
  const [claimType, setClaimType] = useState(editingOrder?.claim_type ?? '')
  const [claimDetails, setClaimDetails] = useState(
    editingOrder?.claim_details ?? '',
  )
  const [price, setPrice] = useState(editingOrder?.price ?? 0)
  const [shippingCost, setShippingCost] = useState(
    editingOrder?.shipping_cost ?? 0,
  )
  const [discount, setDiscount] = useState(editingOrder?.discount ?? 0)
  const [paymentMethod, setPaymentMethod] = useState(
    editingOrder?.payment_method ?? 'โอน',
  )
  const [promotion, setPromotion] = useState(editingOrder?.promotion ?? '')

  const [requestTaxInvoice, setRequestTaxInvoice] = useState(
    editingOrder?.billing_details?.request_tax_invoice ?? false,
  )
  const [requestCashBill, setRequestCashBill] = useState(
    editingOrder?.billing_details?.request_cash_bill ?? false,
  )
  const [taxCustomerName, setTaxCustomerName] = useState(
    editingOrder?.billing_details?.tax_customer_name ?? '',
  )
  const [taxCustomerAddress, setTaxCustomerAddress] = useState(
    editingOrder?.billing_details?.tax_customer_address ?? '',
  )
  const [taxId, setTaxId] = useState(editingOrder?.billing_details?.tax_id ?? '')

  const [items, setItems] = useState<ItemRowState[]>(() =>
    editingOrder
      ? groupItemsToRows(editingOrder, products)
      : [emptyItemRow()],
  )
  const [payments, setPayments] = useState<PaymentRow[]>(() => {
    if (editingOrder?.payment_details?.length)
      return editingOrder.payment_details.map((p) => ({ ...p, manual: true }))
    if (editingOrder?.payment_date)
      return [
        {
          amount: editingOrder.total_amount,
          date: editingOrder.payment_date,
          time: editingOrder.payment_time ?? '',
          manual: true,
        },
      ]
    return [{ amount: 0, date: '', time: '' }]
  })

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const qc = useQueryClient()
  const importFileRef = useRef<HTMLInputElement>(null)

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    setError('')
    try {
      const { orders, useProvidedBillNo } = await parseImportFile(file, products)
      if (orders.length === 0) {
        alert('ไม่พบข้อมูลออร์เดอร์ในไฟล์')
        return
      }
      if (!confirm(`พบ ${orders.length} ออร์เดอร์ ต้องการนำเข้าหรือไม่?`)) return
      const s = await saveImportedOrders(
        orders,
        products,
        user?.username ?? user?.email ?? '',
        useProvidedBillNo,
      )
      await qc.invalidateQueries({ queryKey: ['orders'] })
      let msg = `✅ นำเข้าเสร็จสิ้น!\n`
      msg += `📦 ข้อมูลครบ: ${s.complete} บิล\n`
      msg += `⚠️ ข้อมูลไม่ครบ (รอลงข้อมูล): ${s.waiting} บิล\n`
      if (s.skipped > 0) msg += `⏭️ ข้ามบิลซ้ำ: ${s.skipped} บิล\n`
      if (s.incompleteBills.length > 0)
        msg += `\nบิลที่ต้องตรวจ: ${s.incompleteBills.slice(0, 10).join(', ')}${s.incompleteBills.length > 10 ? ' ...' : ''}`
      alert(msg)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  // ===== derived =====
  const billNo = editingOrder?.bill_no ?? ''
  const fonts = getFontsForChannel(channelCode, billNo)
  const filteredProducts = useMemo(
    () => getFilteredProducts(products, channelCode, billNo),
    [products, channelCode, billNo],
  )
  const productOptions = useMemo(() => {
    const opts = filteredProducts.map((p) => ({
      value: String(p.id),
      label: p.product_name,
    }))
    // เผื่อสินค้าปิดการขายที่ยังอยู่ในบิลเดิม
    for (const it of items) {
      if (it.product_id && !opts.some((o) => o.value === String(it.product_id))) {
        const p = products.find((x) => x.id === it.product_id)
        if (p)
          opts.push({
            value: String(p.id),
            label: p.product_name + ' (ปิดการขาย)',
          })
      }
    }
    return opts
  }, [filteredProducts, items, products])

  const isClaimOrInfu = channelCode === 'CLAIM' || channelCode === 'INFU'
  // label ที่อยู่เปลี่ยนตามช่องทาง: e-commerce → "เลขพัสดุ"
  const addressLabel = ecommerceChannels.includes(channelCode)
    ? 'เลขพัสดุ'
    : 'ที่อยู่ลูกค้า'

  const preTax = (price || 0) + (shippingCost || 0) - (discount || 0)
  const vat = requestTaxInvoice ? preTax * 0.07 : 0
  const totalAmount = +(preTax + vat).toFixed(2)

  const sumPaid = payments.reduce((s, p) => s + (p.amount || 0), 0)
  const balance = totalAmount - sumPaid

  // auto-fill ยอดเงินแถวแรก (เฉพาะบิลใหม่ และยังไม่พิมพ์เอง)
  const effectivePayments = useMemo(() => {
    if (!isEdit && payments[0] && !payments[0].manual) {
      const copy = [...payments]
      copy[0] = { ...copy[0], amount: totalAmount }
      return copy
    }
    return payments
  }, [payments, totalAmount, isEdit])

  // ===== สิทธิ์แก้ไข =====
  const shippedReadOnly = status === 'จัดส่งแล้ว'
  const workOrderViewOnly =
    status === 'ใบงาน (กำลังผลิต)' &&
    role !== 'superadmin' &&
    role !== 'manager'
  const itemsDisabled = shippedReadOnly || workOrderViewOnly

  // ===== items helpers =====
  function patchRow(uid: string, patch: Partial<ItemRowState>) {
    setItems((prev) =>
      prev.map((r) => (r.uid === uid ? { ...r, ...patch } : r)),
    )
  }

  function removeRow(uid: string) {
    setItems((prev) => {
      const target = prev.find((r) => r.uid === uid)
      // ลบแถวหมึกที่ผูกอยู่ด้วย
      let next = prev.filter(
        (r) => r.uid !== uid && r.uid !== target?.linkedInkRowUid,
      )
      // ถ้าลบแถว condo ส่วนหนึ่ง ให้ลบทั้งกลุ่ม
      if (target?.condoGroupId)
        next = next.filter((r) => r.condoGroupId !== target.condoGroupId)
      return next.length ? next : [emptyItemRow()]
    })
  }

  function recomputeStampInk(uid: string, list: ItemRowState[]): ItemRowState[] {
    const row = list.find((r) => r.uid === uid)
    if (!row) return list
    // ลบแถวหมึกเดิมที่ผูกไว้
    let next = list.filter((r) => r.uid !== row.linkedInkRowUid)
    row.linkedInkRowUid = undefined

    const cat = categoryOf(products, row.product_id)
    if (!cat.includes('STAMP')) return next

    const colors = ['เขียว', 'ดำ', 'แดง', 'น้ำเงิน']
    const matched = colors.find(
      (c) => row.ink_color.includes(c) && row.ink_color.includes('พลาสติก'),
    )
    if (!matched) return next

    const inkName = `หมึกแฟลชพลาสติก 5 ml. (${matched})`
    const inkProduct = products.find((p) => p.product_name === inkName)
    if (!inkProduct) return next

    const inkRow: ItemRowState = {
      ...emptyItemRow(),
      product_id: inkProduct.id,
      quantity: 1,
      isAutoAdded: true,
    }
    row.linkedInkRowUid = inkRow.uid
    // วางแถวหมึกถัดจากแถวต้นทาง
    const idx = next.findIndex((r) => r.uid === uid)
    next = [...next.slice(0, idx + 1), inkRow, ...next.slice(idx + 1)]
    return next
  }

  function changeProduct(uid: string, productId: number | null) {
    setItems((prev) => {
      let next = prev.map((r) =>
        r.uid === uid ? { ...r, product_id: productId } : r,
      )
      const cat = categoryOf(products, productId)
      const row = next.find((r) => r.uid === uid)!

      // CONDO STAMP → แตกเป็น 5 ชั้น
      if (
        cat === 'CONDO STAMP' &&
        !row.isCondoPart &&
        !row.condoGroupId &&
        productId
      ) {
        const groupId = 'condo-' + Date.now()
        next = next.map((r) =>
          r.uid === uid
            ? {
                ...r,
                shelf_location: '1',
                quantity: 1,
                qtyReadonly: true,
                isCondoPart: true,
                condoGroupId: groupId,
              }
            : r,
        )
        const extra: ItemRowState[] = []
        for (let i = 2; i <= 5; i++) {
          extra.push({
            ...emptyItemRow(),
            product_id: productId,
            shelf_location: String(i),
            quantity: 1,
            qtyReadonly: true,
            isCondoPart: true,
            condoGroupId: groupId,
          })
        }
        const idx = next.findIndex((r) => r.uid === uid)
        next = [...next.slice(0, idx + 1), ...extra, ...next.slice(idx + 1)]
      }

      return recomputeStampInk(uid, next)
    })
  }

  function changeRow(uid: string, patch: Partial<ItemRowState>) {
    if ('ink_color' in patch) {
      setItems((prev) => {
        const updated = prev.map((r) =>
          r.uid === uid ? { ...r, ...patch } : r,
        )
        return recomputeStampInk(uid, updated)
      })
    } else {
      patchRow(uid, patch)
    }
  }

  // ===== save =====
  async function doSave(targetStatus: OrderStatus | null) {
    setError('')
    setBusy(true)
    try {
      const taxItems: TaxItemRow[] = buildTaxItems()
      const values: OrderFormValues = {
        channelCode,
        adminUser: user?.username ?? user?.email ?? '',
        customerName,
        customerAddress,
        claimType,
        claimDetails,
        price: price || 0,
        shippingCost: shippingCost || 0,
        discount: discount || 0,
        totalAmount,
        paymentMethod,
        promotion,
        requestTaxInvoice,
        requestCashBill,
        taxCustomerName,
        taxCustomerAddress,
        taxId,
        taxItems,
        paymentRecords: effectivePayments,
        items,
      }
      const savedBill = await saveOrder(values, {
        status: targetStatus,
        products,
        editingOrder,
      })
      onSaved(savedBill)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function cancelBill() {
    if (!editingOrder) return
    if (!confirm('ต้องการยกเลิกบิลนี้?')) return
    setBusy(true)
    try {
      const { error } = await supabase
        .from('orders')
        .update({ status: 'ยกเลิก' })
        .eq('id', editingOrder.id)
      if (error) throw error
      onSaved(editingOrder.bill_no)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  // สร้างรายการ tax invoice จากสินค้าปัจจุบัน (อย่างง่าย)
  function buildTaxItems(): TaxItemRow[] {
    if (!requestTaxInvoice && !requestCashBill) return []
    const agg: Record<string, { name: string; qty: number; cat: string }> = {}
    for (const it of items) {
      if (!it.product_id) continue
      const p = products.find((x) => x.id === it.product_id)
      const key = String(it.product_id)
      if (!agg[key])
        agg[key] = {
          name: p?.product_name ?? '',
          qty: 0,
          cat: (p?.product_category || '').toUpperCase(),
        }
      agg[key].qty += it.quantity || 0
    }
    const rows: TaxItemRow[] = Object.values(agg).map((a) => ({
      product_name: a.name,
      quantity: a.cat === 'CONDO STAMP' ? Math.ceil(a.qty / 5) : a.qty,
      unit_price: 0,
    }))
    if ((shippingCost || 0) > 0)
      rows.push({ product_name: 'ค่าจัดส่ง', quantity: 1, unit_price: shippingCost })
    if ((discount || 0) > 0)
      rows.push({ product_name: 'ส่วนลด', quantity: 1, unit_price: -discount })
    return rows
  }

  // ===== action buttons =====
  function renderActions() {
    if (workOrderViewOnly)
      return <p className="text-slate-500">สถานะ: {status} (ดูอย่างเดียว)</p>

    const btn =
      'rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50'
    if (!isEdit)
      return (
        <>
          <button
            disabled={busy}
            onClick={() => doSave('รอลงข้อมูล')}
            className={btn + ' bg-slate-500 hover:bg-slate-600'}
          >
            บันทึก (รอลงข้อมูล)
          </button>
          <button
            disabled={busy}
            onClick={() => doSave('ลงข้อมูลเสร็จสิ้น')}
            className={btn + ' bg-green-600 hover:bg-green-700'}
          >
            บันทึก (ข้อมูลครบ)
          </button>
        </>
      )

    if (status === 'จัดส่งแล้ว')
      return (
        <button
          disabled={busy}
          onClick={() => doSave(null)}
          className={btn + ' bg-violet-600 hover:bg-violet-700'}
        >
          อัปเดตข้อมูลการชำระเงิน
        </button>
      )
    if (status === 'ใบงาน (กำลังผลิต)')
      return (
        <button
          disabled={busy}
          onClick={() => doSave(null)}
          className={btn + ' bg-violet-600 hover:bg-violet-700'}
        >
          อัปเดต
        </button>
      )
    if (status === 'รอลงข้อมูล')
      return (
        <>
          <button
            disabled={busy}
            onClick={() => doSave(null)}
            className={btn + ' bg-violet-600 hover:bg-violet-700'}
          >
            อัปเดต
          </button>
          <button
            disabled={busy}
            onClick={() => doSave('ลงข้อมูลเสร็จสิ้น')}
            className={btn + ' bg-green-600 hover:bg-green-700'}
          >
            ย้ายไป "ข้อมูลครบ"
          </button>
          <button
            disabled={busy}
            onClick={cancelBill}
            className={btn + ' bg-red-600 hover:bg-red-700'}
          >
            ยกเลิกบิล
          </button>
        </>
      )
    // ลงข้อมูลเสร็จสิ้น
    return (
      <>
        <button
          disabled={busy}
          onClick={() => doSave(null)}
          className={btn + ' bg-violet-600 hover:bg-violet-700'}
        >
          อัปเดต
        </button>
        <button
          disabled={busy}
          onClick={cancelBill}
          className={btn + ' bg-red-600 hover:bg-red-700'}
        >
          ยกเลิกบิล
        </button>
      </>
    )
  }

  // ช่อง input/select สูงเท่ากันทุกตัว (h-10) — textarea ใช้ fieldArea แยก
  // ใช้ text-[13px] เพื่อให้สระบน-ล่างไทยแสดงครบในความสูงที่จำกัด
  const field =
    'h-10 rounded-lg border border-slate-300 px-3 text-[13px] outline-none focus:border-violet-500'
  const fieldArea =
    'rounded-lg border border-slate-300 px-3 py-2 text-[13px] outline-none focus:border-violet-500'

  return (
    <div className="space-y-5 rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-800">
          {isEdit ? `แก้ไข: ${editingOrder!.bill_no}` : 'สร้างออร์เดอร์ใหม่'}
        </h2>
        {onCancel && (
          <button
            onClick={onCancel}
            className="text-sm text-slate-500 hover:underline"
          >
            ← กลับไปรายการ
          </button>
        )}
      </div>

      {/* ข้อมูลหลัก */}
      <div className="space-y-3">
        {/* แถว 1: ช่องทาง / แอดมิน / ชื่อลูกค้า */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <label className="flex flex-col gap-1 text-sm text-slate-600">
            ช่องทาง
            <SearchSelect
              options={channels.map((c) => ({
                value: c.channel_code,
                label: c.channel_name,
              }))}
              value={channelCode || null}
              disabled={isEdit}
              placeholder="-- เลือกช่องทาง --"
              onChange={(v) => setChannelCode(v ?? '')}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-slate-600">
            แอดมิน
            <input
              className={field + ' bg-slate-100'}
              value={user?.username ?? user?.email ?? ''}
              readOnly
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-slate-600">
            ชื่อลูกค้า
            <input
              className={field}
              value={customerName}
              disabled={shippedReadOnly}
              onChange={(e) => setCustomerName(e.target.value)}
            />
          </label>
        </div>
        {/* แถว 2: ที่อยู่ลูกค้า / เลขพัสดุ (label เปลี่ยนตามช่องทาง) */}
        <label className="flex flex-col gap-1 text-sm text-slate-600">
          {addressLabel}
          <textarea
            className={fieldArea}
            rows={2}
            value={customerAddress}
            disabled={shippedReadOnly}
            onChange={(e) => setCustomerAddress(e.target.value)}
          />
        </label>
      </div>

      {/* การเคลม */}
      {isClaimOrInfu && (
        <div className="space-y-3 rounded-lg border border-red-200 bg-red-50 p-3">
          <h4 className="font-semibold text-red-700">ข้อมูลการเคลม</h4>
          <input
            className={field + ' w-full'}
            placeholder="ประเภทเคลม"
            value={claimType}
            onChange={(e) => setClaimType(e.target.value)}
          />
          <textarea
            className={fieldArea + ' w-full'}
            rows={2}
            placeholder="รายละเอียดเคลม"
            value={claimDetails}
            onChange={(e) => setClaimDetails(e.target.value)}
          />
        </div>
      )}

      {/* นำเข้าออร์เดอร์จาก Excel (เฉพาะตอนสร้างใหม่) */}
      {!isEdit && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <span className="text-sm font-medium text-slate-600">
            นำเข้าหลายบิลจากไฟล์:
          </span>
          <button
            onClick={downloadStandardTemplate}
            className="rounded-lg bg-sky-100 px-2.5 py-1 text-xs text-sky-700 hover:bg-sky-200"
          >
            📥 Template (Standard)
          </button>
          <button
            onClick={downloadPgtrTemplate}
            className="rounded-lg bg-sky-100 px-2.5 py-1 text-xs text-sky-700 hover:bg-sky-200"
          >
            📥 Template (PGTR)
          </button>
          <button
            onClick={downloadWyTemplate}
            className="rounded-lg bg-sky-100 px-2.5 py-1 text-xs text-sky-700 hover:bg-sky-200"
          >
            📥 Template (WY)
          </button>
          <button
            disabled={busy}
            onClick={() => importFileRef.current?.click()}
            className="rounded-lg bg-green-600 px-3 py-1 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50"
          >
            📤 Import Orders จากไฟล์
          </button>
          <input
            ref={importFileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={handleImportFile}
          />
        </div>
      )}

      {/* รายการสินค้า */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-slate-700">รายการสินค้า</h3>
          {!itemsDisabled && (
            <button
              onClick={() => setItems((p) => [...p, emptyItemRow()])}
              className="rounded-lg bg-slate-200 px-3 py-1.5 text-sm hover:bg-slate-300"
            >
              + เพิ่มแถว
            </button>
          )}
        </div>
        <OrderItemsTable
          rows={items}
          productOptions={productOptions}
          fonts={fonts}
          inkTypes={inkTypes}
          disabled={itemsDisabled}
          onChangeRow={changeRow}
          onChangeProduct={changeProduct}
          onRemoveRow={removeRow}
        />
      </div>

      {/* การชำระเงิน */}
      {!isClaimOrInfu && (
        <div className="space-y-3">
          <h3 className="font-semibold text-slate-700">ข้อมูลการชำระเงิน</h3>
          <div className="flex flex-wrap items-end gap-3">
            <NumField label="ราคา" value={price} onChange={setPrice} />
            <NumField
              label="ค่าส่ง"
              value={shippingCost}
              onChange={setShippingCost}
            />
            <NumField label="ส่วนลด" value={discount} onChange={setDiscount} />
            <div className="flex flex-col gap-1">
              <span className="text-sm font-semibold text-blue-600">
                ยอดสุทธิ
              </span>
              <input
                readOnly
                value={totalAmount.toFixed(2)}
                className="h-10 w-36 rounded-lg border-2 border-blue-500 bg-blue-50 px-3 text-[13px] font-bold text-blue-700"
              />
            </div>
            <label className="flex flex-col gap-1 text-sm text-slate-600">
              วิธีชำระ
              <select
                className={field}
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
              >
                <option value="โอน">โอน</option>
                <option value="COD">COD</option>
              </select>
            </label>
            <label className="flex flex-1 flex-col gap-1 text-sm text-slate-600">
              โปรโมชั่น
              <input
                className={field}
                value={promotion}
                onChange={(e) => setPromotion(e.target.value)}
              />
            </label>
          </div>

          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm text-red-600">
              <input
                type="checkbox"
                checked={requestTaxInvoice}
                onChange={(e) => {
                  setRequestTaxInvoice(e.target.checked)
                  if (e.target.checked) {
                    setTaxCustomerName(customerName)
                    setTaxCustomerAddress(customerAddress)
                  }
                }}
              />
              📄 ขอใบกำกับภาษี
            </label>
            <label className="flex items-center gap-2 text-sm text-blue-600">
              <input
                type="checkbox"
                checked={requestCashBill}
                onChange={(e) => setRequestCashBill(e.target.checked)}
              />
              💵 บิลเงินสด
            </label>
          </div>

          {/* รายการโอน (ซ้าย 2 ส่วน) + ใบกำกับภาษี/บิลเงินสด (ขวา 3 ส่วน) */}
          <div className="grid items-start gap-3 md:grid-cols-5">
          <div className="rounded-lg border border-slate-200 md:col-span-2">
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-3 py-2">
              <span className="text-sm font-semibold text-slate-600">
                รายการหลักฐานการโอน
              </span>
              <button
                onClick={() =>
                  setPayments((p) => [...p, { amount: 0, date: '', time: '' }])
                }
                className="rounded bg-slate-200 px-2 py-1 text-xs hover:bg-slate-300"
              >
                + เพิ่มรายการ
              </button>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500">
                  <th className="px-3 py-1.5">ยอดเงิน</th>
                  <th className="px-3 py-1.5">วันที่</th>
                  <th className="px-3 py-1.5">เวลา</th>
                  <th className="px-3 py-1.5"></th>
                </tr>
              </thead>
              <tbody>
                {effectivePayments.map((p, i) => (
                  <tr key={i} className="border-t border-slate-50">
                    <td className="px-3 py-1">
                      <input
                        type="number"
                        step="0.01"
                        value={p.amount}
                        onChange={(e) =>
                          setPayments((prev) =>
                            prev.map((r, idx) =>
                              idx === i
                                ? {
                                    ...r,
                                    amount: parseFloat(e.target.value) || 0,
                                    manual: true,
                                  }
                                : r,
                            ),
                          )
                        }
                        className="w-full rounded border border-slate-200 px-2 py-1"
                      />
                    </td>
                    <td className="px-3 py-1">
                      <input
                        type="date"
                        value={p.date}
                        onChange={(e) =>
                          setPayments((prev) =>
                            prev.map((r, idx) =>
                              idx === i ? { ...r, date: e.target.value } : r,
                            ),
                          )
                        }
                        className="w-full rounded border border-slate-200 px-2 py-1"
                      />
                    </td>
                    <td className="px-3 py-1">
                      <input
                        type="time"
                        lang="th-TH"
                        step={60}
                        value={p.time}
                        onChange={(e) =>
                          setPayments((prev) =>
                            prev.map((r, idx) =>
                              idx === i ? { ...r, time: e.target.value } : r,
                            ),
                          )
                        }
                        className="w-full rounded border border-slate-200 px-2 py-1"
                      />
                    </td>
                    <td className="px-3 py-1 text-center">
                      <button
                        onClick={() =>
                          setPayments((prev) =>
                            prev.length > 1
                              ? prev.filter((_, idx) => idx !== i)
                              : prev,
                          )
                        }
                        className="rounded bg-red-500 px-2 py-0.5 text-xs text-white"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="border-t border-slate-100 px-3 py-2 text-right text-sm">
              <span className="mr-4">
                ยอดโอนสะสม:{' '}
                <strong className="text-green-600">{sumPaid.toFixed(2)}</strong>
              </span>
              <span>
                คงเหลือ:{' '}
                <strong className={balance <= 0 ? 'text-green-600' : 'text-red-600'}>
                  {balance.toFixed(2)}
                </strong>
              </span>
            </div>
          </div>

          {/* ฝั่งขวา (3 ส่วน): ใบกำกับภาษี / บิลเงินสด */}
          <div className="rounded-lg border border-slate-200 p-3 md:col-span-3">
            {requestTaxInvoice || requestCashBill ? (
              <div className="space-y-3">
                <h4 className="font-semibold text-slate-700">
                  ข้อมูลออกใบกำกับภาษี / บิลเงินสด
                </h4>
                <input
                  className={field + ' w-full'}
                  placeholder="ชื่อลูกค้า/บริษัท"
                  value={taxCustomerName}
                  onChange={(e) => setTaxCustomerName(e.target.value)}
                />
                <textarea
                  className={fieldArea + ' w-full'}
                  rows={2}
                  placeholder="ที่อยู่"
                  value={taxCustomerAddress}
                  onChange={(e) => setTaxCustomerAddress(e.target.value)}
                />
                {requestTaxInvoice && (
                  <input
                    className={field + ' w-full'}
                    placeholder="เลขประจำตัวผู้เสียภาษี (TAX ID)"
                    value={taxId}
                    onChange={(e) => setTaxId(e.target.value)}
                  />
                )}
                <p className="text-xs text-slate-400">
                  รายการ/ราคาในใบกำกับจะถูกสร้างจากรายการสินค้าโดยอัตโนมัติเมื่อบันทึก
                </p>
              </div>
            ) : (
              <div className="flex h-full min-h-32 items-center justify-center p-4 text-center text-sm text-slate-400">
                ติ๊ก "ขอใบกำกับภาษี" หรือ "บิลเงินสด" ด้านบน เพื่อกรอกข้อมูลที่นี่
              </div>
            )}
          </div>
          </div>
        </div>
      )}

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </p>
      )}

      <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
        {renderActions()}
      </div>
    </div>
  )
}

function NumField({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (n: number) => void
}) {
  return (
    <label className="flex flex-col gap-1 text-sm text-slate-600">
      {label}
      <input
        type="number"
        step="0.01"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="h-10 w-32 rounded-lg border border-slate-300 px-3 text-[13px] outline-none focus:border-violet-500"
      />
    </label>
  )
}
