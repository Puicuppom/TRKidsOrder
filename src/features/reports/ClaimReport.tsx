import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../../lib/supabase'
import type { Order } from '../../types/db'

interface ClaimRow extends Order {
  original_date: string
  original_admin: string
}

const today = () => new Date().toISOString().split('T')[0]

export default function ClaimReport() {
  const [start, setStart] = useState(today())
  const [end, setEnd] = useState(today())
  const [rows, setRows] = useState<ClaimRow[]>([])
  const [admins, setAdmins] = useState<string[]>([])
  const [adminFilter, setAdminFilter] = useState('all')
  const [busy, setBusy] = useState(false)
  const [ran, setRan] = useState(false)

  useEffect(() => {
    supabase
      .from('users')
      .select('username')
      .order('username')
      .then(({ data }) => setAdmins((data ?? []).map((u) => u.username)))
  }, [])

  async function generate() {
    if (!start || !end) return alert('กรุณาเลือกวันที่เริ่มและสิ้นสุด')
    setBusy(true)
    try {
      // 1) บิลปกติ (ไม่ใช่ CLAIM) ในช่วงวันที่
      const originals: { bill_no: string; entry_date: string; admin_user: string }[] = []
      let from = 0
      while (true) {
        const { data, error } = await supabase
          .from('orders')
          .select('bill_no, entry_date, admin_user')
          .neq('channel_code', 'CLAIM')
          .gte('entry_date', start)
          .lte('entry_date', end)
          .range(from, from + 999)
        if (error) throw error
        originals.push(...(data as typeof originals))
        if (!data || data.length < 1000) break
        from += 1000
      }
      if (originals.length === 0) {
        setRows([])
        setRan(true)
        return
      }

      // 2) บิลเคลมทั้งหมด
      const claims: Order[] = []
      from = 0
      while (true) {
        const { data, error } = await supabase
          .from('orders')
          .select('*')
          .eq('channel_code', 'CLAIM')
          .range(from, from + 999)
        if (error) throw error
        claims.push(...(data as Order[]))
        if (!data || data.length < 1000) break
        from += 1000
      }

      // 3) จับคู่ bill เคลม (bill_no ลงท้ายด้วย -<บิลต้นฉบับ>)
      const matched: ClaimRow[] = []
      for (const orig of originals) {
        for (const claim of claims) {
          if (claim.bill_no.endsWith(`-${orig.bill_no}`)) {
            matched.push({
              ...claim,
              original_date: orig.entry_date,
              original_admin: orig.admin_user,
            })
          }
        }
      }
      matched.sort((a, b) => a.original_date.localeCompare(b.original_date))
      setRows(matched)
      setRan(true)
    } catch (e) {
      alert('เกิดข้อผิดพลาด: ' + (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const filtered = useMemo(
    () => rows.filter((r) => adminFilter === 'all' || r.original_admin === adminFilter),
    [rows, adminFilter],
  )

  function exportExcel() {
    const headers = [
      ['วันที่ลงใบงาน', 'แอดมินคนเดิม', 'เลขบิลเคลม', 'ชื่อลูกค้า', 'ประเภทการเคลม', 'รายละเอียดการเคลม'],
    ]
    const data = filtered.map((d) => [
      d.original_date,
      d.original_admin,
      d.bill_no,
      d.customer_name,
      d.claim_type,
      d.claim_details,
    ])
    const ws = XLSX.utils.aoa_to_sheet(headers.concat(data as string[][]))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'ClaimReport')
    XLSX.writeFile(wb, `รายงานเคลม_${start}.xlsx`)
  }

  const inp = 'rounded-lg border border-slate-300 px-3 py-1.5 text-sm'

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-sm text-slate-600">
          วันที่เริ่ม
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={inp} />
        </label>
        <label className="flex flex-col gap-1 text-sm text-slate-600">
          ถึงวันที่
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className={inp} />
        </label>
        <button
          onClick={generate}
          disabled={busy}
          className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
        >
          {busy ? 'กำลังดึง...' : 'ค้นหาประวัติเคลม'}
        </button>
        {ran && rows.length > 0 && (
          <button
            onClick={exportExcel}
            className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700"
          >
            📥 Export Excel
          </button>
        )}
      </div>

      {ran && (
        <div className="flex flex-wrap items-center gap-2">
          <select value={adminFilter} onChange={(e) => setAdminFilter(e.target.value)} className={inp}>
            <option value="all">แอดมินทั้งหมด</option>
            {admins.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <span className="text-sm text-slate-500">พบเคลม {filtered.length} รายการ</span>
        </div>
      )}

      {!ran && (
        <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-400">
          เลือกช่วงวันที่ (ของบิลต้นฉบับ) แล้วกด "ค้นหาประวัติเคลม"
        </p>
      )}

      {ran && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-600">
              <tr>
                <th className="p-2">วันที่ลงใบงาน</th>
                <th className="p-2">แอดมินคนเดิม</th>
                <th className="p-2 text-left">เลขบิลเคลม</th>
                <th className="p-2 text-left">ลูกค้า</th>
                <th className="p-2 text-left">ประเภทเคลม</th>
                <th className="p-2 text-left">รายละเอียด</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr key={i} className="border-t border-slate-100">
                  <td className="p-2 text-center">{r.original_date}</td>
                  <td className="p-2 text-center font-bold text-red-500">{r.original_admin}</td>
                  <td className="p-2">{r.bill_no}</td>
                  <td className="p-2">{r.customer_name}</td>
                  <td className="p-2 font-bold text-red-600">{r.claim_type || '-'}</td>
                  <td className="p-2">{r.claim_details || '-'}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-400">
                    ไม่พบประวัติการเคลมในช่วงวันที่เลือก
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
