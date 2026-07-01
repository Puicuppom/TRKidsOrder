import { useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../../lib/supabase'
import { useProducts } from '../../hooks/useMetadata'

interface ProductRow {
  code: string
  name: string
  category: string
  channels: Record<string, number>
  total: number
}

const today = () => new Date().toLocaleDateString('en-CA')

export default function SalesReport() {
  const { data: products = [] } = useProducts()
  const [start, setStart] = useState(today())
  const [end, setEnd] = useState(today())
  const [rows, setRows] = useState<ProductRow[]>([])
  const [channels, setChannels] = useState<string[]>([])
  const [category, setCategory] = useState('all')
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [ran, setRan] = useState(false)

  const categories = useMemo(
    () =>
      [...new Set(products.map((p) => p.product_category).filter(Boolean))].sort() as string[],
    [products],
  )

  async function generate() {
    if (!start || !end) return alert('กรุณาเลือกวันที่เริ่มต้นและสิ้นสุด')
    setBusy(true)
    try {
      const all: { channel_code: string; order_items: { product_id: number; product_name: string }[] }[] = []
      let from = 0
      while (true) {
        const { data, error } = await supabase
          .from('orders')
          .select('channel_code, order_items(product_id, product_name)')
          .in('status', ['จัดส่งแล้ว', 'ลงข้อมูลเสร็จสิ้น', 'ใบงาน (กำลังผลิต)'])
          .gte('entry_date', start)
          .lte('entry_date', end)
          .range(from, from + 999)
        if (error) throw error
        all.push(...(data as typeof all))
        if (!data || data.length < 1000) break
        from += 1000
      }

      const map = new Map<number, ProductRow>()
      const channelSet = new Set<string>()
      for (const order of all) {
        const ch = (order.channel_code || 'N/A').toUpperCase()
        channelSet.add(ch)
        for (const item of order.order_items || []) {
          const product = products.find((p) => p.id === item.product_id)
          if (!product) continue
          if (!map.has(item.product_id)) {
            map.set(item.product_id, {
              code: product.product_code ?? 'N/A',
              name: item.product_name,
              category: product.product_category ?? '',
              channels: {},
              total: 0,
            })
          }
          const row = map.get(item.product_id)!
          row.channels[ch] = (row.channels[ch] || 0) + 1
          row.total += 1
        }
      }
      setChannels([...channelSet].sort())
      setRows([...map.values()])
      setRan(true)
    } catch (e) {
      alert('เกิดข้อผิดพลาด: ' + (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const filtered = useMemo(
    () =>
      rows
        .filter(
          (r) =>
            (category === 'all' || r.category === category) &&
            (!search || r.name.toLowerCase().includes(search.toLowerCase())),
        )
        .sort((a, b) => b.total - a.total),
    [rows, category, search],
  )

  const colTotals = useMemo(() => {
    const t: Record<string, number> = {}
    channels.forEach((c) => (t[c] = 0))
    let grand = 0
    filtered.forEach((r) => {
      channels.forEach((c) => (t[c] += r.channels[c] || 0))
      grand += r.total
    })
    return { t, grand }
  }, [filtered, channels])

  function exportExcel() {
    if (filtered.length === 0) return alert('ไม่มีข้อมูลสำหรับ Export')
    const headers = ['รหัสสินค้า', 'ชื่อสินค้า', 'หมวดหมู่', ...channels, 'รวมทั้งหมด']
    const data = filtered.map((r) => [
      r.code,
      r.name,
      r.category,
      ...channels.map((c) => r.channels[c] || 0),
      r.total,
    ])
    data.push([
      '',
      'รวมทั้งหมด',
      '',
      ...channels.map((c) => colTotals.t[c]),
      colTotals.grand,
    ])
    const ws = XLSX.utils.aoa_to_sheet([headers, ...data])
    ws['!cols'] = headers.map((_, i) => ({ wch: i === 1 ? 40 : i === 2 ? 25 : 15 }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Sales Report')
    XLSX.writeFile(wb, `SalesReport_${start}_to_${end}.xlsx`)
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
          {busy ? 'กำลังดึง...' : 'สร้างรายงาน'}
        </button>
        {ran && (
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
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={inp}>
            <option value="all">ทุกหมวดหมู่</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <input
            placeholder="ค้นหาชื่อสินค้า"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={inp + ' w-56'}
          />
          <span className="text-sm text-slate-500">{filtered.length} สินค้า</span>
        </div>
      )}

      {!ran && (
        <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-400">
          เลือกช่วงวันที่แล้วกด "สร้างรายงาน"
        </p>
      )}

      {ran && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-600">
              <tr>
                <th className="p-2 text-left">รหัส</th>
                <th className="p-2 text-left">ชื่อสินค้า</th>
                <th className="p-2 text-left">หมวด</th>
                {channels.map((c) => (
                  <th key={c} className="p-2 text-center">
                    {c}
                  </th>
                ))}
                <th className="bg-slate-200 p-2 text-center">รวม</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr key={i} className="border-t border-slate-100">
                  <td className="p-2">{r.code}</td>
                  <td className="p-2">{r.name}</td>
                  <td className="p-2">{r.category}</td>
                  {channels.map((c) => (
                    <td key={c} className="p-2 text-center">
                      {r.channels[c] ? <b>{r.channels[c]}</b> : <span className="text-slate-300">-</span>}
                    </td>
                  ))}
                  <td className="bg-slate-50 p-2 text-center font-bold">{r.total}</td>
                </tr>
              ))}
              {filtered.length > 0 && (
                <tr className="bg-slate-800 font-bold text-white">
                  <td colSpan={3} className="p-2 text-right">
                    รวมทั้งหมด
                  </td>
                  {channels.map((c) => (
                    <td key={c} className="p-2 text-center">
                      {colTotals.t[c]}
                    </td>
                  ))}
                  <td className="bg-slate-900 p-2 text-center">{colTotals.grand}</td>
                </tr>
              )}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4 + channels.length} className="p-6 text-center text-slate-400">
                    ไม่พบข้อมูล
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
