import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import html2canvas from 'html2canvas'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/useAuth'
import { useChannels } from '../../hooks/useMetadata'
import { beepSuccess, beepError } from '../../lib/beep'
import type { Order, Channel, TransportMeta } from '../../types/db'

const PARCEL_TYPES = ['กล่อง', 'ซองกระดาษ', 'ซองบับเบิล', 'ถุงพัสดุ'] as const
const today = () => new Date().toLocaleDateString('en-CA')

function carrierOf(channels: Channel[], channelCode: string): string {
  const c = channels.find((x) => x.channel_code === channelCode)
  return (c?.default_carrier || 'OTHER').toUpperCase()
}

export default function TransportPage() {
  const { user } = useAuth()
  const username = user?.username ?? user?.email ?? ''
  const { data: channels = [] } = useChannels()

  const [date, setDate] = useState(today())
  const [orders, setOrders] = useState<Order[]>([])
  const [activeCarrier, setActiveCarrier] = useState<string | null>(null)
  const [parcelType, setParcelType] = useState<string>('กล่อง')
  const [status, setStatus] = useState<{ msg: string; type: 'ok' | 'err' | '' }>({ msg: '', type: '' })
  const [loading, setLoading] = useState(false)
  const scanRef = useRef<HTMLInputElement>(null)
  const summaryRef = useRef<HTMLDivElement>(null)

  const getCarrier = useCallback((code: string) => carrierOf(channels, code), [channels])

  const fetchData = useCallback(async () => {
    if (!date) return
    setLoading(true)
    setStatus({ msg: '⌛ กำลังดึงข้อมูลวันที่ ' + date, type: '' })
    try {
      const all: Order[] = []
      let from = 0
      while (true) {
        const { data, error } = await supabase
          .from('orders')
          .select('*')
          .eq('status', 'จัดส่งแล้ว')
          .gte('shipped_time', `${date}T00:00:00Z`)
          .lte('shipped_time', `${date}T23:59:59Z`)
          .range(from, from + 999)
        if (error) throw error
        all.push(...(data as Order[]))
        if (!data || data.length < 1000) break
        from += 1000
      }
      setOrders(all)
      setStatus({ msg: '', type: '' })
    } catch (e) {
      setStatus({ msg: '❌ ดึงข้อมูลไม่สำเร็จ: ' + (e as Error).message, type: 'err' })
    } finally {
      setLoading(false)
    }
  }, [date])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const carriers = useMemo(
    () =>
      [...new Set(channels.map((c) => (c.default_carrier || 'OTHER').toUpperCase()))].sort(),
    [channels],
  )

  async function handleScan(tracking: string) {
    const t = tracking.trim().toUpperCase()
    if (!t || !activeCarrier) return
    try {
      const idx = orders.findIndex((o) => String(o.tracking_number).toUpperCase() === t)
      const order = orders[idx]
      if (!order) throw new Error('ไม่พบเลขพัสดุในระบบ (หรือบิลยังไม่ได้ส่ง)')
      const carrier = getCarrier(order.channel_code)
      if (carrier !== activeCarrier) throw new Error(`❌ ผิด! ของเจ้า ${carrier}`)
      if (order.transport_meta?.verified) throw new Error('สแกนซ้ำไปแล้ว')

      const meta: TransportMeta = {
        verified: true,
        verified_at: new Date().toISOString(),
        verified_by: username,
        carrier,
        parcel_type: parcelType,
      }
      const { error } = await supabase
        .from('orders')
        .update({ transport_meta: meta })
        .eq('id', order.id)
      if (error) throw error
      setOrders((prev) =>
        prev.map((o, i) => (i === idx ? { ...o, transport_meta: meta } : o)),
      )
      beepSuccess()
      setStatus({ msg: `✅ ${order.bill_no} ผ่าน [${parcelType}]`, type: 'ok' })
    } catch (e) {
      beepError()
      setStatus({ msg: (e as Error).message, type: 'err' })
    } finally {
      scanRef.current?.focus()
    }
  }

  async function undo(id: number) {
    if (!confirm('ยกเลิกการทวนสอบบิลนี้?')) return
    setLoading(true)
    await supabase.from('orders').update({ transport_meta: null }).eq('id', id)
    await fetchData()
    setLoading(false)
  }

  // ===== สรุป (carrier → channel → parcel type) =====
  const summary = useMemo(() => {
    const nested: Record<string, Record<string, Record<string, number>>> = {}
    for (const o of orders) {
      if (!o.transport_meta?.verified) continue
      const carrier = getCarrier(o.channel_code)
      const ch = (o.channel_code || 'N/A').toUpperCase()
      const pt = o.transport_meta.parcel_type || 'กล่อง'
      nested[carrier] ??= {}
      nested[carrier][ch] ??= { กล่อง: 0, ซองกระดาษ: 0, ซองบับเบิล: 0, ถุงพัสดุ: 0, total: 0 }
      nested[carrier][ch][pt] = (nested[carrier][ch][pt] || 0) + 1
      nested[carrier][ch].total++
    }
    return nested
  }, [orders, getCarrier])

  const stats = useMemo(() => {
    let gTotal = 0, gVer = 0, cTotal = 0, cVer = 0
    for (const o of orders) {
      gTotal++
      const v = !!o.transport_meta?.verified
      if (v) gVer++
      if (getCarrier(o.channel_code) === activeCarrier) {
        cTotal++
        if (v) cVer++
      }
    }
    return { gTotal, gVer, cTotal, cVer }
  }, [orders, activeCarrier, getCarrier])

  const carrierCounts = useMemo(() => {
    const m: Record<string, number> = {}
    for (const o of orders) {
      const c = getCarrier(o.channel_code)
      m[c] = (m[c] || 0) + 1
    }
    return m
  }, [orders, getCarrier])

  const displayed = useMemo(
    () =>
      activeCarrier
        ? orders.filter((o) => getCarrier(o.channel_code) === activeCarrier)
        : [],
    [orders, activeCarrier, getCarrier],
  )

  function exportCSV() {
    if (!activeCarrier) return
    const rows = [['เวลาสแกน', 'เลขบิล', 'เลขพัสดุ', 'ประเภทพัสดุ', 'ชื่อลูกค้า', 'สถานะ']]
    for (const o of displayed) {
      const v = o.transport_meta?.verified
      rows.push([
        v ? new Date(o.transport_meta!.verified_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '-',
        o.bill_no,
        o.tracking_number ?? '',
        o.transport_meta?.parcel_type ?? '-',
        o.customer_name ?? '',
        v ? 'ตรวจแล้ว' : 'รอตรวจ',
      ])
    }
    const csv = '﻿' + rows.map((r) => r.map((v) => `"${v}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `ขนส่ง_${activeCarrier}_${date}.csv`
    a.click()
  }

  async function exportPNG() {
    if (!summaryRef.current) return
    try {
      const canvas = await html2canvas(summaryRef.current, { scale: 2, backgroundColor: '#ffffff' })
      const a = document.createElement('a')
      a.download = `สรุปยอดขนส่ง_${date}.png`
      a.href = canvas.toDataURL('image/png')
      a.click()
    } catch (e) {
      alert('บันทึกภาพไม่ได้: ' + (e as Error).message)
    }
  }

  const sortedCarriers = Object.keys(summary).sort()
  const grand = { กล่อง: 0, ซองกระดาษ: 0, ซองบับเบิล: 0, ถุงพัสดุ: 0, total: 0 }
  const cell = 'border border-slate-200 p-2 text-center'

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-bold text-slate-800">ระบบขนส่ง (ทวนสอบพัสดุ)</h1>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
        />
        {loading && <span className="text-sm text-slate-400">กำลังโหลด...</span>}
      </div>

      {/* stats */}
      <div className="grid grid-cols-2 gap-3 sm:max-w-md">
        <div className="rounded-xl bg-slate-900 p-4 text-center text-white">
          <div className="text-xs opacity-80">รวมทั้งหมด ({date})</div>
          <div className="text-3xl font-black">{stats.gVer} / {stats.gTotal}</div>
        </div>
        <div className="rounded-xl border-t-4 border-blue-500 bg-white p-4 text-center">
          <div className="text-xs text-slate-500">{activeCarrier || 'เลือกขนส่ง'}</div>
          <div className="text-3xl font-black text-blue-600">
            {activeCarrier ? `${stats.cVer} / ${stats.cTotal}` : '-'}
          </div>
        </div>
      </div>

      {/* carrier tabs */}
      <div className="flex flex-wrap gap-2">
        {carriers.map((c) => (
          <button
            key={c}
            onClick={() => {
              setActiveCarrier(c)
              setTimeout(() => scanRef.current?.focus(), 100)
            }}
            className={`rounded-lg border px-4 py-2 text-sm font-bold transition ${
              activeCarrier === c
                ? 'border-blue-600 bg-blue-600 text-white'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            {c} ({carrierCounts[c] || 0})
          </button>
        ))}
      </div>

      {/* scan + parcel type */}
      <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-slate-600">ประเภทหีบห่อ:</span>
          {PARCEL_TYPES.map((pt) => (
            <button
              key={pt}
              onClick={() => {
                setParcelType(pt)
                scanRef.current?.focus()
              }}
              className={`rounded-lg border px-3 py-1.5 text-sm font-bold ${
                parcelType === pt
                  ? 'border-green-500 bg-green-500 text-white'
                  : 'border-slate-200 bg-white text-slate-600'
              }`}
            >
              {pt}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={scanRef}
            disabled={!activeCarrier}
            placeholder={activeCarrier ? `สแกนเลขพัสดุ ${activeCarrier}` : 'เลือกขนส่งก่อน'}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleScan((e.target as HTMLInputElement).value)
                ;(e.target as HTMLInputElement).value = ''
              }
            }}
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
          />
          {activeCarrier && (
            <button onClick={exportCSV} className="rounded-lg bg-slate-600 px-3 py-2 text-sm text-white">
              📥 CSV
            </button>
          )}
        </div>
        {status.msg && (
          <div className={`text-sm font-medium ${status.type === 'ok' ? 'text-green-600' : status.type === 'err' ? 'text-red-600' : 'text-slate-500'}`}>
            {status.msg}
          </div>
        )}
      </div>

      {/* รายการ active carrier */}
      {activeCarrier && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-600">
              <tr>
                <th className="p-2 text-left">เวลาสแกน</th>
                <th className="p-2 text-left">เลขบิล</th>
                <th className="p-2 text-left">เลขพัสดุ</th>
                <th className="p-2 text-left">หีบห่อ</th>
                <th className="p-2 text-left">ลูกค้า</th>
                <th className="p-2 text-center">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {displayed.map((o) => {
                const v = o.transport_meta?.verified
                return (
                  <tr key={o.id} className={`border-t border-slate-100 ${v ? 'bg-green-50' : ''}`}>
                    <td className="p-2 text-slate-500">
                      {v ? new Date(o.transport_meta!.verified_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '-'}
                    </td>
                    <td className="p-2 font-semibold">{o.bill_no}</td>
                    <td className="p-2 font-mono">{o.tracking_number}</td>
                    <td className="p-2">{o.transport_meta?.parcel_type || '-'}</td>
                    <td className="p-2">{o.customer_name}</td>
                    <td className="p-2 text-center">
                      {v ? (
                        <>
                          <span className="rounded-full border border-green-500 bg-green-50 px-2 py-0.5 text-xs font-bold text-green-600">
                            ✓ ตรวจแล้ว
                          </span>
                          <button onClick={() => undo(o.id)} className="ml-2 text-xs text-blue-600 underline">
                            ยกเลิก
                          </button>
                        </>
                      ) : (
                        <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-bold text-red-600">
                          🔴 รอตรวจ
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
              {displayed.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-400">
                    ไม่มีบิลของขนส่งนี้ในวันที่เลือก
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* สรุปยอด */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-slate-700">สรุปยอดการทวนสอบ</h2>
          <button onClick={exportPNG} className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm text-white">
            🖼️ บันทึกภาพสรุป (PNG)
          </button>
        </div>
        <div ref={summaryRef} className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-2">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-600">
              <tr>
                <th className={cell + ' text-left'}>ขนส่ง / ช่องทาง</th>
                {PARCEL_TYPES.map((pt) => (
                  <th key={pt} className={cell}>{pt}</th>
                ))}
                <th className={cell}>รวม</th>
              </tr>
            </thead>
            <tbody>
              {sortedCarriers.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-400">
                    ไม่มีข้อมูลการทวนสอบในวันที่เลือก
                  </td>
                </tr>
              )}
              {sortedCarriers.map((carrier) => {
                const sub = { กล่อง: 0, ซองกระดาษ: 0, ซองบับเบิล: 0, ถุงพัสดุ: 0, total: 0 }
                const chRows = Object.keys(summary[carrier]).sort().map((ch) => {
                  const s = summary[carrier][ch]
                  PARCEL_TYPES.forEach((pt) => (sub[pt] += s[pt] || 0))
                  sub.total += s.total
                  return (
                    <tr key={carrier + ch}>
                      <td className={cell + ' pl-8 text-left text-slate-500'}>└ {ch}</td>
                      {PARCEL_TYPES.map((pt) => (
                        <td key={pt} className={cell}>{s[pt] || 0}</td>
                      ))}
                      <td className={cell + ' font-bold'}>{s.total}</td>
                    </tr>
                  )
                })
                PARCEL_TYPES.forEach((pt) => (grand[pt] += sub[pt]))
                grand.total += sub.total
                return (
                  <Fragment key={carrier}>
                    <tr className="bg-slate-50">
                      <td colSpan={6} className={cell + ' text-left font-bold text-blue-600'}>
                        🚚 ขนส่ง: {carrier}
                      </td>
                    </tr>
                    {chRows}
                    <tr className="bg-blue-50 font-bold">
                      <td className={cell + ' text-right'}>รวมยอด {carrier}</td>
                      {PARCEL_TYPES.map((pt) => (
                        <td key={pt} className={cell}>{sub[pt]}</td>
                      ))}
                      <td className={cell + ' text-blue-600'}>{sub.total}</td>
                    </tr>
                  </Fragment>
                )
              })}
              {sortedCarriers.length > 0 && (
                <tr className="bg-slate-900 font-bold text-white">
                  <td className={cell + ' text-left'}>ยอดรวมทุกขนส่งสุทธิ</td>
                  {PARCEL_TYPES.map((pt) => (
                    <td key={pt} className={cell}>{grand[pt]}</td>
                  ))}
                  <td className={cell + ' bg-blue-600'}>{grand.total}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
