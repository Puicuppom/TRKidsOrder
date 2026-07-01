import { useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import html2canvas from 'html2canvas'
import { supabase } from '../../lib/supabase'
import { useChannels } from '../../hooks/useMetadata'
import type { Order } from '../../types/db'

const ECOM_TABLE = ['SPTR', 'FSPTR', 'LZTR', 'TTTR', 'WY', 'PGTR', 'CLAIM']
const today = () => new Date().toLocaleDateString('en-CA')
const fmt = (n: number) =>
  (n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

type ReportRow = Order & { match_status_type: string; total_paid_in_statements: number }

export default function AccountingReport() {
  const { data: channels = [] } = useChannels()
  const [start, setStart] = useState(today())
  const [end, setEnd] = useState(today())
  const [customer, setCustomer] = useState('')
  const [amount, setAmount] = useState('')
  const [rows, setRows] = useState<ReportRow[]>([])
  const [busy, setBusy] = useState(false)
  const [ran, setRan] = useState(false)
  const summaryRef = useRef<HTMLDivElement>(null)

  const channelMap = useMemo(() => {
    const m: Record<string, { name: string; account: string }> = {}
    channels.forEach((c) => (m[c.channel_code] = { name: c.channel_name, account: c.bank_account || 'ไม่ระบุ' }))
    return m
  }, [channels])

  async function generate() {
    if (!start || !end) return alert('กรุณาเลือกช่วงวันที่ให้ครบถ้วน')
    setBusy(true)
    try {
      const all: Order[] = []
      let from = 0
      while (true) {
        let q = supabase
          .from('orders')
          .select('*')
          .gte('payment_date', start)
          .lte('payment_date', end)
          .neq('status', 'ยกเลิก')
          .not('payment_date', 'is', null)
        if (customer.trim()) q = q.ilike('customer_name', `%${customer.trim()}%`)
        if (amount.trim()) q = q.eq('total_amount', amount.trim())
        const { data, error } = await q.order('payment_date', { ascending: true }).range(from, from + 999)
        if (error) throw error
        all.push(...(data as Order[]))
        if (!data || data.length < 1000) break
        from += 1000
      }

      // สถานะการจับคู่จาก bank_statements
      const billNos = all.map((o) => o.bill_no).filter(Boolean)
      const paidMap: Record<string, number> = {}
      if (billNos.length > 0) {
        const { data: stmts } = await supabase
          .from('bank_statements')
          .select('bill_no, deposit_amount')
          .in('bill_no', billNos)
          .eq('is_matched', true)
        ;(stmts ?? []).forEach((s) => {
          paidMap[s.bill_no] = (paidMap[s.bill_no] || 0) + parseFloat(s.deposit_amount)
        })
      }

      setRows(
        all.map((o) => {
          const paid = paidMap[o.bill_no] || 0
          const total = parseFloat(String(o.total_amount || 0))
          let mt = 'unmatched'
          if (paid >= total && total > 0) mt = 'fully_matched'
          else if (paid > 0) mt = 'partial'
          return { ...o, match_status_type: mt, total_paid_in_statements: paid }
        }),
      )
      setRan(true)
    } catch (e) {
      alert('เกิดข้อผิดพลาด: ' + (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const totals = useMemo(() => {
    const totalSales = rows.reduce((s, o) => s + (o.total_amount || 0), 0)
    const totalShipping = rows.reduce((s, o) => s + (o.shipping_cost || 0), 0)
    const byChannel: Record<string, number> = {}
    const byAccount: Record<string, number> = {}
    const shipByChannel: Record<string, number> = {}
    rows.forEach((o) => {
      const info = channelMap[o.channel_code] || { name: o.channel_code, account: 'ไม่ระบุ' }
      byChannel[o.channel_code] = (byChannel[o.channel_code] || 0) + (o.total_amount || 0)
      byAccount[info.account] = (byAccount[info.account] || 0) + (o.total_amount || 0)
      shipByChannel[o.channel_code] = (shipByChannel[o.channel_code] || 0) + (o.shipping_cost || 0)
    })
    return { totalSales, totalShipping, byChannel, byAccount, shipByChannel }
  }, [rows, channelMap])

  const tableRows = useMemo(
    () => rows.filter((o) => !ECOM_TABLE.includes(o.channel_code)),
    [rows],
  )

  function exportXlsx() {
    if (rows.length === 0) return alert('ไม่มีข้อมูลสำหรับ Export')
    const header = ['วันที่ชำระ', 'เวลา', 'เลขบิล', 'ช่องทาง', 'ลูกค้า', 'ยอดสุทธิ', 'การจับคู่', 'สถานะ']
    const data = tableRows.map((o) => [
      o.payment_date,
      o.payment_time?.substring(0, 5) ?? '',
      o.bill_no,
      o.channel_code,
      o.customer_name,
      o.total_amount,
      o.match_status_type === 'fully_matched' ? 'ครบถ้วน' : o.match_status_type === 'partial' ? 'บางส่วน' : 'ยังไม่พบ',
      o.status,
    ])
    const ws = XLSX.utils.aoa_to_sheet([header, ...data])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'บัญชี')
    XLSX.writeFile(wb, `รายงานบัญชี_${start}_to_${end}.xlsx`)
  }

  async function exportPng() {
    if (!summaryRef.current) return
    const canvas = await html2canvas(summaryRef.current, { scale: 2, backgroundColor: '#fff' })
    const a = document.createElement('a')
    a.download = `สรุปบัญชี_${start}_${end}.png`
    a.href = canvas.toDataURL('image/png')
    a.click()
  }

  const inp = 'rounded-lg border border-slate-300 px-3 py-1.5 text-sm'

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-sm text-slate-600">
          เริ่ม
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={inp} />
        </label>
        <label className="flex flex-col gap-1 text-sm text-slate-600">
          ถึง
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className={inp} />
        </label>
        <input placeholder="ค้นหาลูกค้า" value={customer} onChange={(e) => setCustomer(e.target.value)} className={inp} />
        <input placeholder="ยอดเงิน" value={amount} onChange={(e) => setAmount(e.target.value)} className={inp + ' w-28'} />
        <button onClick={generate} disabled={busy} className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50">
          {busy ? 'กำลังดึง...' : 'สร้างรายงาน'}
        </button>
        {ran && (
          <>
            <button onClick={exportXlsx} className="rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white">
              📥 XLSX
            </button>
            <button onClick={exportPng} className="rounded-lg bg-slate-600 px-3 py-2 text-sm font-semibold text-white">
              🖼️ PNG
            </button>
          </>
        )}
      </div>

      {!ran && (
        <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-400">
          เลือกช่วงวันที่ (วันที่ชำระ) แล้วกด "สร้างรายงาน"
        </p>
      )}

      {ran && (
        <>
          <div ref={summaryRef} className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl bg-violet-600 p-4 text-white">
              <h3 className="text-sm opacity-90">สรุปภาพรวม</h3>
              <div className="mt-2 text-2xl font-black">{fmt(totals.totalSales)}</div>
              <div className="text-sm opacity-90">{rows.length.toLocaleString('th-TH')} ออร์เดอร์</div>
            </div>
            <SummaryBox title="ตามช่องทาง" entries={totals.byChannel} total={totals.totalSales} labelFn={(k) => `${channelMap[k]?.name || k} (${k})`} />
            <SummaryBox title="ค่าขนส่งตามช่องทาง" entries={totals.shipByChannel} total={totals.totalShipping} labelFn={(k) => `${channelMap[k]?.name || k} (${k})`} />
            <SummaryBox title="ตามบัญชี" entries={totals.byAccount} total={totals.totalSales} labelFn={(k) => k} />
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-600">
                <tr>
                  <th className="p-2">วันที่</th>
                  <th className="p-2">เวลา</th>
                  <th className="p-2 text-left">เลขบิล</th>
                  <th className="p-2">ช่องทาง</th>
                  <th className="p-2 text-left">ลูกค้า</th>
                  <th className="p-2 text-right">ยอดสุทธิ</th>
                  <th className="p-2 text-center">การจับคู่</th>
                  <th className="p-2">สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((o) => (
                  <tr key={o.id} className="border-t border-slate-100">
                    <td className="p-2 text-center">{o.payment_date ? new Date(o.payment_date).toLocaleDateString('th-TH') : ''}</td>
                    <td className="p-2 text-center">{o.payment_time?.substring(0, 5)}</td>
                    <td className="p-2">{o.bill_no}</td>
                    <td className="p-2 text-center">{o.channel_code}</td>
                    <td className="p-2">{o.customer_name}</td>
                    <td className="p-2 text-right font-medium">{fmt(o.total_amount || 0)}</td>
                    <td className="p-2 text-center">
                      {o.match_status_type === 'fully_matched' ? (
                        <span className="rounded bg-green-100 px-2 py-0.5 text-xs font-bold text-green-700">✓ ครบถ้วน</span>
                      ) : o.match_status_type === 'partial' ? (
                        <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">
                          ⚠ ขาด {fmt((o.total_amount || 0) - o.total_paid_in_statements)}
                        </span>
                      ) : (
                        <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">✗ ยังไม่พบ</span>
                      )}
                    </td>
                    <td className="p-2 text-center">{o.status}</td>
                  </tr>
                ))}
                {tableRows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-6 text-center text-slate-400">ไม่พบข้อมูล</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

function SummaryBox({
  title,
  entries,
  total,
  labelFn,
}: {
  title: string
  entries: Record<string, number>
  total: number
  labelFn: (key: string) => string
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <h3 className="mb-2 text-sm font-bold text-slate-700">{title}</h3>
      <table className="w-full text-xs">
        <tbody>
          {Object.entries(entries).map(([k, v]) => (
            <tr key={k} className="border-b border-slate-50">
              <td className="py-1 text-slate-600">{labelFn(k)}</td>
              <td className="py-1 text-right font-medium">
                {v.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
              </td>
            </tr>
          ))}
          <tr className="font-bold">
            <td className="pt-1">รวม</td>
            <td className="pt-1 text-right">{total.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
