import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useOrdersByStatus } from '../../hooks/useOrders'
import { useWorkOrders, useProducts } from '../../hooks/useMetadata'
import { useAuth } from '../auth/useAuth'
import OrderListItem from './OrderListItem'
import { orderMatchesSearch } from './orderHelpers'
import {
  revertBillsFromWorkOrder,
  cancelBillsFromWorkOrder,
  cancelWorkOrder,
} from './workOrderActions'
import {
  exportForProduction,
  copyForProduction,
  exportForQC,
  exportForBarcode,
  importTrackingFile,
  autoFillTrackingFromAddress,
} from './workOrderExports'
import { buildPickingData, type PickingData } from './pickingSlip'
import { waybillSortChannels } from '../../lib/constants'
import { lazy, Suspense, useRef } from 'react'
import type { Order, OrderStatus } from '../../types/db'

// modal หนัก (html2canvas / pdf.js / OCR / zxing) โหลดเฉพาะตอนเปิด
const PickingSlipModal = lazy(() => import('./PickingSlipModal'))
const WaybillSorterModal = lazy(() => import('./WaybillSorterModal'))
const FlashWaybillModal = lazy(() => import('../flash/FlashWaybillModal'))

// แท็บใบงาน: บิลสถานะ "ใบงาน (กำลังผลิต)" จัดกลุ่มตาม work_order_name
// หมายเหตุ: สร้างกลุ่มจาก "ตัวบิล" โดยตรง (ไม่ผูกกับตาราง work_orders)
// เพื่อให้ใบงานแสดงเสมอตราบใดที่มีบิลในสถานะนี้
export default function WorkOrdersTab({
  onEdit,
}: {
  onEdit?: (order: Order) => void
}) {
  const { data: orders = [], isLoading } = useOrdersByStatus('ใบงาน (กำลังผลิต)')
  const { data: workOrders = [] } = useWorkOrders()
  const { data: products = [] } = useProducts()
  const { user } = useAuth()
  const qc = useQueryClient()
  const isManager = user?.role === 'superadmin' || user?.role === 'manager'
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [busy, setBusy] = useState(false)
  const [picking, setPicking] = useState<PickingData | null>(null)
  const [sorter, setSorter] = useState<{ name: string; bills: Order[] } | null>(
    null,
  )
  const [flash, setFlash] = useState<{ name: string; bills: Order[] } | null>(
    null,
  )
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const fileInputRef = useRef<HTMLInputElement>(null)
  const importWoRef = useRef<string | null>(null)

  function toggleExpand(name: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  // รัน export/action ที่มี loading + จับ error
  async function run(fn: () => Promise<void>) {
    setBusy(true)
    try {
      await fn()
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  function openPicking(name: string, bills: Order[]) {
    const data = buildPickingData(name, bills, products)
    if (!data) return alert('ไม่พบสินค้าในใบงานนี้')
    setPicking(data)
  }

  async function doTrackingImport(name: string, bills: Order[]) {
    setBusy(true)
    try {
      const filled = await autoFillTrackingFromAddress(bills)
      if (filled > 0) {
        await refresh()
        alert(`คัดลอกเลขพัสดุจากช่องที่อยู่ ${filled} รายการ`)
      }
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setBusy(false)
    }
    if (confirm('ต้องการเลือกไฟล์ Excel/CSV เพื่อนำเข้าเลขพัสดุเพิ่มหรือไม่?')) {
      importWoRef.current = name
      fileInputRef.current?.click()
    }
  }

  async function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    try {
      const count = await importTrackingFile(file)
      await refresh()
      alert(`นำเข้าเลขพัสดุสำเร็จ ${count} รายการ`)
    } catch (err) {
      alert((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function refresh() {
    await qc.invalidateQueries({ queryKey: ['orders'] })
    await qc.invalidateQueries({ queryKey: ['work_orders'] })
    setSelected(new Set())
  }

  function selectedInGroup(bills: Order[]): number[] {
    return bills.filter((b) => selected.has(b.id)).map((b) => b.id)
  }

  function toggleGroup(bills: Order[]) {
    const ids = bills.map((b) => b.id)
    const allSel = ids.every((id) => selected.has(id))
    setSelected((prev) => {
      const next = new Set(prev)
      ids.forEach((id) => (allSel ? next.delete(id) : next.add(id)))
      return next
    })
  }

  async function doRevert(
    woName: string,
    bills: Order[],
    newStatus: OrderStatus,
    label: string,
  ) {
    const ids = selectedInGroup(bills)
    if (ids.length === 0) return alert('กรุณาเลือกบิลในใบงานนี้')
    if (!confirm(`${label} ${ids.length} บิล?`)) return
    setBusy(true)
    try {
      await revertBillsFromWorkOrder(woName, ids, newStatus, bills, products)
      await refresh()
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function doCancelBills(woName: string, bills: Order[]) {
    const ids = selectedInGroup(bills)
    if (ids.length === 0) return alert('กรุณาเลือกบิลในใบงานนี้')
    if (!confirm(`ยกเลิก ${ids.length} บิล?`)) return
    setBusy(true)
    try {
      await cancelBillsFromWorkOrder(woName, ids, bills, products)
      await refresh()
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function doCancelWO(woName: string) {
    if (!confirm(`ยกเลิกใบงาน "${woName}"?\n(บิลจะคืนไป "ลงข้อมูลเสร็จสิ้น" และลบออกจากแผนผลิต)`))
      return
    setBusy(true)
    try {
      await cancelWorkOrder(woName)
      await refresh()
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const gbtn =
    'rounded px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50'

  const groups = useMemo(() => {
    // จัดกลุ่มบิลตามชื่อใบงาน
    const byName = new Map<string, Order[]>()
    for (const o of orders) {
      const name = o.work_order_name || '(ไม่มีชื่อใบงาน)'
      if (!byName.has(name)) byName.set(name, [])
      byName.get(name)!.push(o)
    }

    // ลำดับการสร้างใบงานจากตาราง work_orders (ถ้าอ่านได้) ไว้ช่วยเรียง
    const woOrder = new Map(
      workOrders.map((wo, i) => [wo.work_order_name, i]),
    )

    return Array.from(byName.entries())
      .map(([name, bills]) => ({
        name,
        bills: bills.sort((a, b) =>
          (a.bill_no || '').localeCompare(b.bill_no || ''),
        ),
      }))
      .filter(({ name, bills }) => {
        if (!search) return true
        const woMatch = name.toLowerCase().includes(search.toLowerCase())
        const billMatch = bills.some((b) => orderMatchesSearch(b, search))
        return woMatch || billMatch
      })
      .sort((a, b) => {
        // เรียงตามลำดับใน work_orders ก่อน ถ้าไม่มีให้เรียงชื่อจากใหม่ไปเก่า
        const ia = woOrder.has(a.name) ? woOrder.get(a.name)! : Infinity
        const ib = woOrder.has(b.name) ? woOrder.get(b.name)! : Infinity
        if (ia !== ib) return ia - ib
        return b.name.localeCompare(a.name)
      })
  }, [orders, workOrders, search])

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <input
          placeholder="ค้นหา ชื่อใบงาน / บิล / ลูกค้า"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-72 rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-violet-500"
        />
        <span className="text-sm text-slate-500">{groups.length} ใบงาน</span>
      </div>

      {isLoading && <p className="text-slate-400">กำลังโหลด...</p>}
      {!isLoading && groups.length === 0 && (
        <p className="text-slate-400">ไม่มีใบงานที่กำลังผลิต</p>
      )}

      {groups.map(({ name, bills }) => {
        const allHaveTracking =
          bills.length > 0 &&
          bills.every((b) => b.tracking_number && b.tracking_number.trim())
        const channel = bills[0]?.channel_code ?? ''
        const showSort =
          waybillSortChannels.includes(channel) || channel === 'INFU'
        // Export ใบปะหน้า (Flash): ทุกช่องทางยกเว้น e-commerce
        const showWaybillExport = !waybillSortChannels.includes(channel)
        return (
          <div
            key={name}
            className="overflow-hidden rounded-xl border border-slate-200 bg-white"
          >
            <div className="space-y-2 bg-slate-100 px-4 py-2">
              <button
                onClick={() => toggleExpand(name)}
                className="flex items-center gap-2 font-semibold text-slate-700"
              >
                <span className="text-slate-400">
                  {expanded.has(name) ? '▼' : '▶'}
                </span>
                {name} ({bills.length} บิล)
                {allHaveTracking && (
                  <span className="ml-1 font-bold text-green-600">✓</span>
                )}
              </button>

              {/* ปุ่ม Export / Import (ทุกคน) */}
              <div className="flex flex-wrap gap-1.5">
                <button
                  disabled={busy}
                  onClick={() => openPicking(name, bills)}
                  className={gbtn + ' bg-green-600 hover:bg-green-700'}
                >
                  📋 ทำใบเบิก
                </button>
                <button
                  disabled={busy}
                  onClick={() => run(() => exportForProduction(name))}
                  className={gbtn + ' bg-blue-600 hover:bg-blue-700'}
                >
                  📤 Export (ไฟล์ผลิต)
                </button>
                <button
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      const n = await copyForProduction(name)
                      alert(`คัดลอกข้อมูลใบงาน ${name} จำนวน ${n} รายการแล้ว`)
                    })
                  }
                  className={gbtn + ' bg-cyan-600 hover:bg-cyan-700'}
                >
                  📋 Copy (ไฟล์ผลิต)
                </button>
                <button
                  disabled={busy}
                  onClick={() => run(() => exportForQC(name, products))}
                  className={gbtn + ' bg-violet-600 hover:bg-violet-700'}
                >
                  🔍 Export QC
                </button>
                <button
                  disabled={busy}
                  onClick={() => run(() => exportForBarcode(name, products))}
                  className={gbtn + ' bg-indigo-600 hover:bg-indigo-700'}
                >
                  🏷️ ทำ Barcode
                </button>
                <button
                  disabled={busy}
                  onClick={() => doTrackingImport(name, bills)}
                  className={gbtn + ' bg-teal-600 hover:bg-teal-700'}
                >
                  📥 นำเข้าเลขพัสดุ
                </button>
                {showWaybillExport && (
                  <button
                    disabled={busy}
                    onClick={() => setFlash({ name, bills })}
                    className={gbtn + ' bg-orange-500 hover:bg-orange-600'}
                  >
                    📤 Export (ใบปะหน้า)
                  </button>
                )}
                {showSort && (
                  <button
                    disabled={busy}
                    onClick={() => setSorter({ name, bills })}
                    className={gbtn + ' bg-amber-600 hover:bg-amber-700'}
                  >
                    📤 เรียงใบปะหน้า
                  </button>
                )}
              </div>

            </div>
            {expanded.has(name) && (
              <div>
                {isManager && (
                  <div className="flex flex-wrap gap-1.5 border-t border-slate-100 bg-slate-50 px-4 py-2">
                    <button
                      onClick={() => toggleGroup(bills)}
                      className={gbtn + ' bg-slate-500 hover:bg-slate-600'}
                    >
                      เลือกทั้งหมด
                    </button>
                    <button
                      disabled={busy}
                      onClick={() =>
                        doRevert(name, bills, 'รอลงข้อมูล', 'คืนไป "รอลงข้อมูล"')
                      }
                      className={gbtn + ' bg-amber-500 hover:bg-amber-600'}
                    >
                      คืน "รอลงข้อมูล"
                    </button>
                    <button
                      disabled={busy}
                      onClick={() =>
                        doRevert(
                          name,
                          bills,
                          'ลงข้อมูลเสร็จสิ้น',
                          'คืนไป "ลงข้อมูลเสร็จสิ้น"',
                        )
                      }
                      className={gbtn + ' bg-blue-500 hover:bg-blue-600'}
                    >
                      คืน "เสร็จสิ้น"
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => doCancelBills(name, bills)}
                      className={gbtn + ' bg-red-500 hover:bg-red-600'}
                    >
                      ยกเลิกบิลที่เลือก
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => doCancelWO(name)}
                      className={gbtn + ' bg-red-700 hover:bg-red-800'}
                    >
                      ยกเลิกใบงาน
                    </button>
                  </div>
                )}
                <ul>
                  {bills.map((b) => (
                    <OrderListItem
                      key={b.id}
                      order={b}
                      selected={selected.has(b.id)}
                      onToggle={toggle}
                      onEdit={onEdit}
                    />
                  ))}
                </ul>
              </div>
            )}
          </div>
        )
      })}

      {/* input ซ่อนสำหรับนำเข้าเลขพัสดุ */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={onFileSelected}
      />

      <Suspense fallback={null}>
        {picking && (
          <PickingSlipModal data={picking} onClose={() => setPicking(null)} />
        )}
        {sorter && (
          <WaybillSorterModal
            workOrderName={sorter.name}
            bills={sorter.bills}
            onClose={() => setSorter(null)}
          />
        )}
        {flash && (
          <FlashWaybillModal
            workOrderName={flash.name}
            bills={flash.bills}
            onClose={() => setFlash(null)}
          />
        )}
      </Suspense>
    </div>
  )
}
