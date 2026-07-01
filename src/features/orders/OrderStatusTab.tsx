import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { OrderStatus, Order } from '../../types/db'
import { useOrdersByStatus } from '../../hooks/useOrders'
import { useChannels, useProducts } from '../../hooks/useMetadata'
import { useAuth } from '../auth/useAuth'
import OrderListItem from './OrderListItem'
import { orderMatchesSearch, isUnpackedComplete } from './orderHelpers'
import {
  createWorkOrders,
  updateOrdersStatus,
} from './workOrderActions'
import { createClaimOrder } from './claimActions'
import ClaimModal from './ClaimModal'
import { exportShippedData, exportTrackingCsv } from './shippedExports'

interface Props {
  status: OrderStatus
  // แสดงสรุปจำนวนบิลตามช่องทาง (เฉพาะแท็บ "ลงข้อมูลเสร็จสิ้น")
  showChannelSummary?: boolean
  onEdit?: (order: Order) => void
}

export default function OrderStatusTab({
  status,
  showChannelSummary,
  onEdit,
}: Props) {
  const { data: orders = [], isLoading, error } = useOrdersByStatus(status)
  const { data: channels = [] } = useChannels()
  const { data: products = [] } = useProducts()
  const { user } = useAuth()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [channelFilter, setChannelFilter] = useState('all')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [busy, setBusy] = useState(false)
  const [woQty, setWoQty] = useState(0)
  const [claimOrder, setClaimOrder] = useState<Order | null>(null)

  // แท็บ "เสร็จสิ้น" ต้องไม่แสดงบิลที่แพ็ค/ส่งแล้ว
  const baseOrders = useMemo(() => {
    if (status === 'ลงข้อมูลเสร็จสิ้น') return orders.filter(isUnpackedComplete)
    return orders
  }, [orders, status])

  const visible = useMemo(() => {
    return baseOrders
      .filter(
        (o) =>
          (channelFilter === 'all' || o.channel_code === channelFilter) &&
          orderMatchesSearch(o, search),
      )
      .sort((a, b) => {
        if (status === 'จัดส่งแล้ว')
          return (b.shipped_time || '').localeCompare(a.shipped_time || '')
        return (b.bill_no || '').localeCompare(a.bill_no || '')
      })
  }, [baseOrders, channelFilter, search, status])

  // นับจำนวนบิลต่อช่องทาง (ใช้ทั้ง dropdown และชิปสรุป)
  const channelCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const o of baseOrders) {
      const c = o.channel_code || 'N/A'
      counts[c] = (counts[c] || 0) + 1
    }
    return counts
  }, [baseOrders])

  const presentChannels = useMemo(
    () => Object.keys(channelCounts).sort(),
    [channelCounts],
  )

  const channelName = (code: string) =>
    channels.find((c) => c.channel_code === code)?.channel_name ?? code

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelected((prev) =>
      prev.size === visible.length
        ? new Set()
        : new Set(visible.map((o) => o.id)),
    )
  }

  async function refresh() {
    await qc.invalidateQueries({ queryKey: ['orders'] })
    setSelected(new Set())
  }

  async function doCreateWorkOrder() {
    // เลือกบิลเป้าหมาย: บิลที่ติ๊ก > ตามจำนวนที่กรอก (FIFO เก่าก่อน) > ทั้งหมดที่กรอง
    let target: Order[]
    if (selected.size > 0) {
      target = orders.filter((o) => selected.has(o.id))
    } else if (woQty > 0) {
      const fifo = [...visible].sort((a, b) =>
        (a.created_at || '').localeCompare(b.created_at || ''),
      )
      if (woQty > visible.length) {
        if (
          !confirm(
            `ต้องการ ${woQty} บิล แต่มีเพียง ${visible.length} บิล\nสร้างใบงานจาก ${visible.length} บิล?`,
          )
        )
          return
      }
      target = fifo.slice(0, woQty)
    } else {
      target = visible
    }
    if (target.length === 0) return alert('ไม่พบบิลตามเงื่อนไข')
    if (!confirm(`สร้างใบงานจาก ${target.length} บิล?`)) return
    setBusy(true)
    try {
      const { success, errors } = await createWorkOrders(
        target,
        products,
        user?.username ?? user?.email ?? '',
      )
      setWoQty(0)
      await refresh()
      if (success.length) alert(success.join('\n'))
      if (errors.length) alert('ข้อผิดพลาด:\n' + errors.join('\n'))
    } finally {
      setBusy(false)
    }
  }

  // ป้ายปุ่มสร้างใบงานตามโหมด
  const createWoLabel =
    selected.size > 0
      ? `📋 สร้างใบงาน (${selected.size} ที่เลือก)`
      : woQty > 0
        ? `📋 สร้างใบงานตามจำนวน (${woQty} บิล)`
        : `📋 สร้างใบงาน (ทั้งหมดที่กรอง: ${visible.length})`

  async function doStatus(newStatus: OrderStatus, label: string) {
    if (selected.size === 0) return alert('กรุณาเลือกบิล')
    if (!confirm(`${label} ${selected.size} บิล?`)) return
    setBusy(true)
    try {
      await updateOrdersStatus([...selected], newStatus)
      await refresh()
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  function openClaim() {
    if (selected.size !== 1) return alert('กรุณาเลือกออร์เดอร์เพียง 1 รายการ')
    const id = [...selected][0]
    const order = orders.find((o) => o.id === id)
    if (order) setClaimOrder(order)
  }

  async function doClaim(claimType: string, claimDetails: string) {
    if (!claimOrder) return
    setBusy(true)
    try {
      const billNo = await createClaimOrder(
        claimOrder,
        claimType,
        claimDetails,
        user?.username ?? user?.email ?? '',
      )
      setClaimOrder(null)
      await refresh()
      alert(`สร้างออร์เดอร์เคลมสำเร็จ!\nเลขบิล: ${billNo}\nไปที่แท็บ "รอลงข้อมูล"`)
    } catch (e) {
      alert('เกิดข้อผิดพลาด: ' + (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  function selectedShipped(): Order[] {
    return orders.filter((o) => selected.has(o.id))
  }
  function doExportShipped() {
    const sel = selectedShipped()
    if (sel.length === 0) return alert('กรุณาเลือกออร์เดอร์ที่ต้องการ Export')
    exportShippedData(sel)
  }
  function doExportTracking() {
    const sel = selectedShipped()
    if (sel.length === 0) return alert('กรุณาเลือกออร์เดอร์ที่ต้องการ Export')
    const carrier = prompt('ระบุชื่อขนส่งสำหรับ CSV เลขพัสดุ:')?.trim()
    if (!carrier) return
    exportTrackingCsv(sel, carrier)
  }

  const btn =
    'rounded-lg px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50'

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          placeholder="ค้นหา บิล / ลูกค้า / เลขพัสดุ"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64 rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-violet-500"
        />
        <select
          value={channelFilter}
          onChange={(e) => setChannelFilter(e.target.value)}
          className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
        >
          <option value="all">ทุกช่องทาง ({baseOrders.length})</option>
          {presentChannels.map((code) => (
            <option key={code} value={code}>
              {channelName(code)} ({channelCounts[code]})
            </option>
          ))}
        </select>
        <span className="text-sm text-slate-500">
          {visible.length} รายการ
          {selected.size > 0 && ` · เลือก ${selected.size}`}
        </span>
      </div>

      {/* แถบจัดการบิลที่เลือก ตามสถานะ */}
      <div className="flex flex-wrap gap-2">
        {status === 'รอลงข้อมูล' && (
          <>
            <button
              disabled={busy}
              onClick={() => doStatus('ลงข้อมูลเสร็จสิ้น', 'ย้ายไป "ลงข้อมูลเสร็จสิ้น"')}
              className={btn + ' bg-green-600 hover:bg-green-700'}
            >
              ย้ายไป "ลงข้อมูลเสร็จสิ้น"
            </button>
            <button
              disabled={busy}
              onClick={() => doStatus('ยกเลิก', 'ยกเลิก')}
              className={btn + ' bg-red-600 hover:bg-red-700'}
            >
              ยกเลิกบิลที่เลือก
            </button>
          </>
        )}
        {status === 'ลงข้อมูลเสร็จสิ้น' && (
          <>
            <input
              type="number"
              min={1}
              placeholder="จำนวนบิล (ถ้าไม่เลือก)"
              value={woQty || ''}
              disabled={selected.size > 0}
              onChange={(e) => setWoQty(parseInt(e.target.value) || 0)}
              className="w-44 rounded-lg border border-slate-300 px-3 py-1.5 text-sm disabled:bg-slate-100"
            />
            <button
              disabled={busy}
              onClick={doCreateWorkOrder}
              className={btn + ' bg-violet-600 hover:bg-violet-700'}
            >
              {createWoLabel}
            </button>
            <button
              disabled={busy}
              onClick={() => doStatus('รอลงข้อมูล', 'คืนไป "รอลงข้อมูล"')}
              className={btn + ' bg-amber-500 hover:bg-amber-600'}
            >
              คืนไป "รอลงข้อมูล"
            </button>
            <button
              disabled={busy}
              onClick={() => doStatus('ยกเลิก', 'ยกเลิก')}
              className={btn + ' bg-red-600 hover:bg-red-700'}
            >
              ยกเลิกบิลที่เลือก
            </button>
          </>
        )}
        {status === 'จัดส่งแล้ว' && (
          <>
            <button
              disabled={busy}
              onClick={openClaim}
              className={btn + ' bg-cyan-600 hover:bg-cyan-700'}
            >
              🔧 เคลมบิลที่เลือก
            </button>
            <button
              onClick={doExportShipped}
              className={btn + ' bg-green-600 hover:bg-green-700'}
            >
              📊 Export ข้อมูลที่เลือก
            </button>
            <button
              onClick={doExportTracking}
              className={btn + ' bg-violet-600 hover:bg-violet-700'}
            >
              📋 Export CSV เลขพัสดุ
            </button>
          </>
        )}
        {status === 'ยกเลิก' && (
          <>
            <button
              disabled={busy}
              onClick={() => doStatus('รอลงข้อมูล', 'ดึงกลับไป "รอลงข้อมูล"')}
              className={btn + ' bg-amber-500 hover:bg-amber-600'}
            >
              ดึงกลับ "รอลงข้อมูล"
            </button>
            <button
              disabled={busy}
              onClick={() =>
                doStatus('ลงข้อมูลเสร็จสิ้น', 'ดึงกลับไป "ลงข้อมูลเสร็จสิ้น"')
              }
              className={btn + ' bg-green-600 hover:bg-green-700'}
            >
              ดึงกลับ "ลงข้อมูลเสร็จสิ้น"
            </button>
          </>
        )}
      </div>

      {showChannelSummary && presentChannels.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-400">กดเพื่อกรองช่องทาง:</span>
          {presentChannels.map((code) => {
            const active = channelFilter === code
            return (
              <button
                key={code}
                onClick={() => setChannelFilter(active ? 'all' : code)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  active
                    ? 'bg-violet-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {channelName(code)}: {channelCounts[code]} บิล
              </button>
            )
          })}
          {channelFilter !== 'all' && (
            <button
              onClick={() => setChannelFilter('all')}
              className="text-xs text-violet-600 hover:underline"
            >
              ล้างตัวกรอง
            </button>
          )}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
          <input
            type="checkbox"
            checked={visible.length > 0 && selected.size === visible.length}
            onChange={toggleAll}
            className="size-4"
          />
          <span>เลือกทั้งหมด</span>
        </div>

        {isLoading && (
          <p className="px-3 py-6 text-center text-slate-400">กำลังโหลด...</p>
        )}
        {error && (
          <p className="px-3 py-6 text-center text-red-600">
            {(error as Error).message}
          </p>
        )}
        {!isLoading && !error && visible.length === 0 && (
          <p className="px-3 py-6 text-center text-slate-400">ไม่มีรายการ</p>
        )}

        <ul>
          {visible.map((o: Order) => (
            <OrderListItem
              key={o.id}
              order={o}
              selected={selected.has(o.id)}
              onToggle={toggle}
              onEdit={onEdit}
            />
          ))}
        </ul>
      </div>

      {claimOrder && (
        <ClaimModal
          order={claimOrder}
          busy={busy}
          onClose={() => setClaimOrder(null)}
          onSubmit={doClaim}
        />
      )}
    </div>
  )
}
