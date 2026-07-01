import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/useAuth'
import { useProducts, useCartoonPatterns } from '../../hooks/useMetadata'
import { beepSuccess, beepError } from '../../lib/beep'
import { buildPackingGroups, naturalSortCompare } from './buildPackingGroups'
import type { PackGroup } from './packingTypes'
import type { Order } from '../../types/db'

const INACTIVITY_MS = 60_000

// รูปสินค้า: ชี้ (hover) แล้วซูมใหญ่ลอยกลางจอ
function ZoomImage({ src, alt }: { src: string; alt: string }) {
  return (
    <span className="group relative inline-block">
      <img
        src={src}
        alt={alt}
        className="mx-auto mb-1 size-16 cursor-zoom-in rounded border border-slate-200 object-cover"
      />
      <img
        src={src}
        alt={alt}
        className="pointer-events-none fixed left-1/2 top-1/2 z-[1200] hidden size-96 max-w-[90vw] -translate-x-1/2 -translate-y-1/2 rounded-xl border-4 border-white object-contain shadow-2xl ring-1 ring-slate-300 group-hover:block"
        style={{ backgroundColor: '#fff' }}
      />
    </span>
  )
}

// แท็กสีหมึกพร้อมไอคอนและสีพื้น (เหมือนหน้าแพ็คเดิม)
function InkTag({ ink }: { ink: string | null }) {
  if (!ink) return null
  let icon = ''
  if (ink.includes('ผ้า')) icon = '👕'
  else if (ink.includes('พลาสติก')) icon = '🥤'
  else if (ink.includes('กระดาษ')) icon = '📄'
  let bg = '#f8f9fa'
  let fg = '#333'
  if (ink.includes('น้ำเงิน')) (bg = '#0040ff'), (fg = '#fff')
  else if (ink.includes('แดง')) (bg = '#e60000'), (fg = '#fff')
  else if (ink.includes('ดำ')) (bg = '#222'), (fg = '#fff')
  else if (ink.includes('เขียว')) (bg = '#008000'), (fg = '#fff')
  else if (ink.includes('ชมพู')) (bg = '#ff66b2'), (fg = '#fff')
  return (
    <span
      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold"
      style={{ backgroundColor: bg, color: fg }}
    >
      {icon && <span className="text-xl leading-none">{icon}</span>}
      <span>{ink}</span>
    </span>
  )
}

interface Props {
  workOrderName: string
  onBack: () => void
}

export default function PackingMain({ workOrderName, onBack }: Props) {
  const { user } = useAuth()
  const username = user?.username ?? user?.email ?? ''
  const qc = useQueryClient()
  const { data: products = [] } = useProducts()
  const { data: patterns = [] } = useCartoonPatterns()

  const [groups, setGroups] = useState<PackGroup[]>([])
  const [allBills, setAllBills] = useState<Order[]>([])
  const [currentIndex, setCurrentIndex] = useState(-1)
  const [status, setStatus] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null)
  const [loading, setLoading] = useState(true)

  const parcelRef = useRef<HTMLInputElement>(null)
  const itemRef = useRef<HTMLInputElement>(null)
  const inactivityRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const productsRef = useRef(products)
  const patternsRef = useRef(patterns)
  productsRef.current = products
  patternsRef.current = patterns

  const completed = useMemo(() => {
    const s = new Set<number>()
    groups.forEach((g, i) => {
      if (g.length > 0 && g.every((it) => it.scanned)) s.add(i)
    })
    return s
  }, [groups])

  const loadData = useCallback(
    async (pickNext = true) => {
      setLoading(true)
      const { data, error } = await supabase
        .from('orders')
        .select('*, order_items(*)')
        .eq('work_order_name', workOrderName)
        .order('bill_no', { ascending: true })
      setLoading(false)
      if (error) {
        alert('ดึงข้อมูลไม่ได้: ' + error.message)
        return
      }
      const bills = (data as Order[]) ?? []
      setAllBills(bills)
      const withTracking = bills.filter(
        (o) => o.tracking_number && o.tracking_number.trim() !== '',
      )
      const g = buildPackingGroups(withTracking, productsRef.current, patternsRef.current)
      setGroups(g)
      if (pickNext) {
        const next = g.findIndex(
          (grp) => !grp.every((it) => it.scanned) && !grp[0]?.isOrderComplete,
        )
        setCurrentIndex(next !== -1 ? next : g.length > 0 ? 0 : -1)
      }
    },
    [workOrderName],
  )

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workOrderName])

  // โฟกัสช่องที่ถูกต้องเมื่อเปลี่ยนออร์เดอร์
  useEffect(() => {
    if (currentIndex < 0) return
    const g = groups[currentIndex]
    if (!g) return
    if (g[0]?.parcelScanned) itemRef.current?.focus()
    else parcelRef.current?.focus()
  }, [currentIndex, groups])

  // ===== inactivity auto-reset =====
  const resetOrder = useCallback(
    async (orderId: number, itemUids: string[]) => {
      await supabase
        .from('order_items')
        .update({ packing_status: null, item_scan_time: null })
        .in('item_uid', itemUids)
      await supabase
        .from('orders')
        .update({
          status: 'ใบงาน (กำลังผลิต)',
          packing_meta: null,
          shipped_by: null,
          shipped_time: null,
        })
        .eq('id', orderId)
    },
    [],
  )

  const armInactivity = useCallback(() => {
    if (inactivityRef.current) clearTimeout(inactivityRef.current)
    const idx = currentIndex
    const g = groups[idx]
    if (!g || g.every((it) => it.scanned)) return
    inactivityRef.current = setTimeout(async () => {
      const started = g.some((it) => it.scanned || it.parcelScanned)
      if (started) {
        await resetOrder(
          g[0].order_id,
          g.map((it) => it.item_uid),
        )
        await loadData(false)
        setStatus({ msg: '⚠️ รีเซ็ตอัตโนมัติ (ไม่มีการเคลื่อนไหวเกิน 1 นาที)', type: 'err' })
      }
    }, INACTIVITY_MS)
  }, [currentIndex, groups, resetOrder, loadData])

  useEffect(() => {
    return () => {
      if (inactivityRef.current) clearTimeout(inactivityRef.current)
    }
  }, [])

  // ===== สแกนพัสดุ =====
  function handleParcelScan(value: string) {
    const v = value.trim().toUpperCase()
    if (!v || currentIndex < 0) return
    const g = groups[currentIndex]
    if (v === String(g[0].tracking_number).trim().toUpperCase()) {
      setGroups((prev) =>
        prev.map((grp, i) =>
          i === currentIndex
            ? grp.map((it) => ({ ...it, parcelScanned: true }))
            : grp,
        ),
      )
      beepSuccess()
      setStatus({ msg: '✅ สแกนพัสดุสำเร็จ', type: 'ok' })
      supabase
        .from('orders')
        .update({
          packing_meta: {
            parcelScanned: true,
            scannedBy: username,
            scanTime: new Date().toISOString(),
          },
        })
        .eq('id', g[0].order_id)
        .then(({ error }) => error && console.error(error))
      setTimeout(() => itemRef.current?.focus(), 50)
      armInactivity()
    } else {
      beepError()
      setStatus({ msg: '❌ เลขพัสดุไม่ตรงกับที่เลือก', type: 'err' })
    }
  }

  // ===== สแกนสินค้า =====
  function handleItemScan(value: string) {
    const v = value.trim().toUpperCase()
    if (!v || currentIndex < 0) return
    const g = groups[currentIndex]
    const target = g.find((it) => !it.scanned && it.item_uid === v)
    if (!target) {
      beepError()
      setStatus({ msg: '❌ สินค้าไม่ถูกต้องหรือสแกนแล้ว', type: 'err' })
      return
    }
    beepSuccess()
    const updated = g.map((it) =>
      it.item_uid === target.item_uid ? { ...it, scanned: true } : it,
    )
    setGroups((prev) => prev.map((grp, i) => (i === currentIndex ? updated : grp)))
    setStatus({ msg: '✅ สแกนสำเร็จ', type: 'ok' })
    supabase
      .from('order_items')
      .update({ item_scan_time: new Date().toISOString(), packing_status: 'สแกนแล้ว' })
      .eq('item_uid', target.item_uid)
      .then(({ error }) => error && console.error(error))
    setTimeout(() => itemRef.current?.focus(), 30)

    const scannedCount = updated.filter((it) => it.scanned).length
    if (scannedCount === updated.length) {
      setStatus({ msg: '✅ สแกนครบแล้ว!', type: 'ok' })
      supabase
        .from('orders')
        .update({
          packing_meta: {
            parcelScanned: true,
            scannedBy: username,
            scanTime: new Date().toISOString(),
          },
        })
        .eq('id', g[0].order_id)
        .then(({ error }) => error && console.error(error))
      if (inactivityRef.current) clearTimeout(inactivityRef.current)
      setTimeout(() => {
        setGroups((cur) => {
          const next = cur.findIndex(
            (grp, i) => !grp.every((it) => it.scanned) && !grp[0]?.isOrderComplete && i !== currentIndex,
          )
          if (next !== -1) setCurrentIndex(next)
          return cur
        })
      }, 700)
    } else {
      armInactivity()
    }
  }

  // สลับออร์เดอร์ — รีเซ็ตออร์เดอร์ปัจจุบันถ้าเริ่มสแกนแต่ยังไม่ครบ
  async function switchTo(index: number) {
    if (currentIndex !== -1 && currentIndex !== index) {
      const g = groups[currentIndex]
      if (g && !g.every((it) => it.scanned) && g.some((it) => it.scanned || it.parcelScanned)) {
        await resetOrder(
          g[0].order_id,
          g.map((it) => it.item_uid),
        )
        await loadData(false)
      }
    }
    setCurrentIndex(index)
  }

  // แพ็คใหม่: ล้างการสแกนของพัสดุปัจจุบันเพื่อเริ่มสแกนใหม่
  async function manualReset() {
    if (currentIndex < 0) return
    const g = groups[currentIndex]
    if (
      !confirm('ยืนยัน "แพ็คใหม่"? (ข้อมูลที่สแกนในบิลนี้จะถูกล้างทั้งหมด)')
    )
      return
    if (inactivityRef.current) clearTimeout(inactivityRef.current)
    await resetOrder(
      g[0].order_id,
      g.map((it) => it.item_uid),
    )
    await loadData(false)
    setStatus({ msg: 'ล้างการสแกนแล้ว เริ่มแพ็คใหม่ได้', type: 'ok' })
    setTimeout(() => parcelRef.current?.focus(), 50)
  }

  async function shipAllScanned() {
    const ids: number[] = []
    completed.forEach((i) => {
      const g = groups[i]
      if (g && !g[0].isOrderComplete) ids.push(g[0].order_id)
    })
    if (ids.length === 0) return alert('ไม่มีบิลที่สแกนครบรอส่ง')
    setLoading(true)
    const { error } = await supabase
      .from('orders')
      .update({
        status: 'จัดส่งแล้ว',
        shipped_by: username,
        shipped_time: new Date().toISOString(),
      })
      .in('id', ids)
    setLoading(false)
    if (error) return alert(error.message)
    alert(`จัดส่งสำเร็จ ${ids.length} รายการ!`)
    beepSuccess()
    qc.invalidateQueries({ queryKey: ['orders'] })
    await loadData()
  }

  async function finalizeWo() {
    if (!confirm('ปิดใบงานนี้?')) return
    await supabase
      .from('work_orders')
      .update({ status: 'จัดส่งแล้ว' })
      .eq('work_order_name', workOrderName)
    alert('ปิดใบงานเรียบร้อย')
    qc.invalidateQueries({ queryKey: ['packing'] })
    onBack()
  }

  // จำนวนบิลที่สแกนครบแล้วแต่ยังไม่จัดส่ง
  const pendingShipCount = useMemo(
    () =>
      [...completed].filter((i) => groups[i] && !groups[i][0].isOrderComplete)
        .length,
    [completed, groups],
  )
  const activeBills = allBills.filter((o) => o.status !== 'ยกเลิก')
  const allShipped =
    activeBills.length > 0 &&
    activeBills.every((o) => o.status === 'จัดส่งแล้ว')

  const group = currentIndex >= 0 ? groups[currentIndex] : null
  const sortedGroup = group
    ? [...group].sort((a, b) =>
        a.scanned === b.scanned
          ? naturalSortCompare(a.item_uid, b.item_uid)
          : a.scanned
            ? 1
            : -1,
      )
    : []
  const scannedCount = group ? group.filter((it) => it.scanned).length : 0

  return (
    <div className="flex h-[calc(100vh-7rem)] gap-3">
      {/* ซ้าย: รายการพัสดุ */}
      <div className="flex w-72 shrink-0 flex-col rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
          <button onClick={onBack} className="text-sm text-violet-600 hover:underline">
            ← เลือกใบงานใหม่
          </button>
          <span className="text-xs text-slate-400">
            {completed.size}/{groups.length}
          </span>
        </div>
        <ul className="flex-1 overflow-y-auto">
          {groups.map((g, i) => {
            const done = g[0].isOrderComplete
            const full = completed.has(i)
            const icon = done ? '✅' : full ? '🟢' : '📦'
            return (
              <li key={g[0].tracking_number}>
                <button
                  onClick={() => switchTo(i)}
                  className={`flex w-full flex-col border-b border-slate-100 px-3 py-2 text-left text-sm ${
                    i === currentIndex ? 'bg-violet-100' : 'hover:bg-slate-50'
                  } ${done ? 'opacity-60' : ''}`}
                >
                  <span className="font-medium text-slate-700">
                    {icon} {g[0].tracking_number}
                  </span>
                  <span className="text-xs text-slate-400">
                    {g[0].customer_name || 'N/A'}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
        <div className="space-y-2 border-t border-slate-200 p-3">
          <button
            onClick={shipAllScanned}
            disabled={pendingShipCount === 0}
            className="w-full rounded-lg bg-green-600 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            📦 จัดส่งบิลที่สแกนครบ
            {pendingShipCount > 0 ? ` (${pendingShipCount})` : ''}
          </button>
          <button
            onClick={finalizeWo}
            disabled={!allShipped}
            className="w-full rounded-lg bg-slate-700 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            title={allShipped ? '' : 'ต้องจัดส่งครบทุกบิลก่อน'}
          >
            ✔️ ปิดใบงาน (เมื่อส่งครบทุกบิล)
          </button>
        </div>
      </div>

      {/* ขวา: รายละเอียด + สแกน */}
      <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 p-3">
          <h2 className="font-bold text-slate-800">จัดของ: {workOrderName}</h2>
        </div>

        {loading && <p className="p-6 text-slate-400">กำลังโหลด...</p>}

        {!loading && !group && (
          <p className="p-6 text-slate-400">ไม่มีพัสดุที่มีเลขพัสดุในใบงานนี้</p>
        )}

        {group && (
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="space-y-2 p-3">
              {group[0].claim_type && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
                  ⚠️ เคลม: {group[0].claim_type}: {group[0].claim_details}
                </div>
              )}
              {group[0].needsTaxInvoice && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 font-semibold text-red-700">
                  ‼️ ต้องการใบกำกับภาษี
                </div>
              )}
              {group[0].needsCashBill && !group[0].needsTaxInvoice && (
                <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 font-semibold text-sky-700">
                  ‼️ ต้องการบิลเงินสด
                </div>
              )}

              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-slate-700">
                  เลขพัสดุ: {group[0].tracking_number}{' '}
                  <span className="font-normal text-slate-500">
                    ({group[0].customer_name})
                  </span>
                </h3>
                <span className="text-2xl font-bold text-slate-800">
                  {scannedCount}/{group.length}
                </span>
              </div>

              {/* ช่องสแกน */}
              <div className="flex gap-2">
                <input
                  ref={parcelRef}
                  placeholder="สแกนเลขพัสดุ"
                  disabled={group[0].parcelScanned}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleParcelScan((e.target as HTMLInputElement).value)
                      ;(e.target as HTMLInputElement).value = ''
                    }
                  }}
                  className="w-48 rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-green-50"
                />
                <input
                  ref={itemRef}
                  placeholder="สแกนสินค้า (Item UID)"
                  disabled={!group[0].parcelScanned}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleItemScan((e.target as HTMLInputElement).value)
                      ;(e.target as HTMLInputElement).value = ''
                    }
                  }}
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
                />
                <button
                  onClick={manualReset}
                  className="shrink-0 rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-600"
                  title="ล้างการสแกนของพัสดุนี้เพื่อเริ่มใหม่"
                >
                  🔄 แพ็คใหม่
                </button>
              </div>
              {status && (
                <div
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                    status.type === 'ok'
                      ? 'bg-green-50 text-green-700'
                      : 'bg-red-50 text-red-700'
                  }`}
                >
                  {status.msg}
                </div>
              )}
            </div>

            {/* ตารางสินค้า */}
            <div className="flex-1 overflow-auto px-3 pb-3">
              <table className="w-full border-collapse text-xs">
                <thead className="sticky top-0 bg-slate-100">
                  <tr className="text-left text-slate-600">
                    <th className="p-2">Item UID</th>
                    <th className="p-2">สินค้า</th>
                    <th className="p-2">ชั้น</th>
                    <th className="p-2">สีหมึก</th>
                    <th className="p-2">ลาย/ปก</th>
                    <th className="p-2">ฟอนต์</th>
                    <th className="p-2">รายละเอียด</th>
                    <th className="p-2">หมายเหตุ</th>
                    <th className="p-2">ไฟล์</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedGroup.map((item) => {
                    const pattern = [item.cartoon_pattern, item.line_pattern]
                      .filter(Boolean)
                      .join(' // ')
                    const notes = (item.notes || '').replace(/\[SET-.*?\]/g, '').trim()
                    const fileUrl =
                      item.file_attachment &&
                      (item.file_attachment.startsWith('http') ||
                        item.file_attachment.includes('www.'))
                        ? item.file_attachment.startsWith('http')
                          ? item.file_attachment
                          : 'https://' + item.file_attachment
                        : null
                    return (
                      <tr
                        key={item.item_uid}
                        className={`border-b border-slate-100 ${
                          item.scanned ? 'bg-green-100' : ''
                        }`}
                      >
                        <td className="p-2 text-center font-bold">
                          {item.scanned && <span className="mr-1 text-green-600">✓</span>}
                          {item.item_uid}
                        </td>
                        <td className="p-2 text-center">
                          {item.image_url ? (
                            <ZoomImage src={item.image_url} alt={item.product_name} />
                          ) : (
                            <div className="mx-auto mb-1 flex size-16 items-center justify-center rounded border border-slate-200 bg-slate-50 text-[9px] text-slate-300">
                              No Pic
                            </div>
                          )}
                          <div className="font-semibold">{item.product_name}</div>
                        </td>
                        <td className="p-2 text-center">{item.shelf_location}</td>
                        <td className="p-2 text-center">
                          <InkTag ink={item.ink_color} />
                        </td>
                        <td className="p-2 text-center">{pattern}</td>
                        <td className="p-2 text-center">{item.font}</td>
                        <td className="p-2">{item.details}</td>
                        <td className="p-2">{notes}</td>
                        <td className="p-2 text-center">
                          {fileUrl ? (
                            <a
                              href={fileUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="font-bold text-blue-600 underline"
                            >
                              เปิดลิงก์
                            </a>
                          ) : (
                            item.file_attachment
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
