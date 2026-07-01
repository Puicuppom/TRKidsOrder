import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useChannels } from '../../hooks/useMetadata'
import { importBankCsv, autoMatch } from './reconcile'
import type { BankStatement } from '../../types/db'

const ECOM = ['SPTR', 'FSPTR', 'LZTR', 'TTTR']
const fmt = (n: number) =>
  (n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function Reconciliation() {
  const { data: channels = [] } = useChannels()
  const [unmatched, setUnmatched] = useState<BankStatement[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('พร้อมดำเนินการ')
  const [manual, setManual] = useState<Record<number, string>>({})
  const fileRef = useRef<HTMLInputElement>(null)

  const loadUnmatched = useCallback(async () => {
    const { data } = await supabase
      .from('bank_statements')
      .select('*')
      .eq('is_matched', false)
      .not('channel', 'in', `(${ECOM.join(',')})`)
      .order('id', { ascending: true })
    setUnmatched((data as BankStatement[]) ?? [])
  }, [])

  useEffect(() => {
    loadUnmatched()
  }, [loadUnmatched])

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    setStatus('กำลังนำเข้าไฟล์...')
    try {
      const { inserted, account } = await importBankCsv(file, channels)
      if (inserted > 0) alert(`นำเข้าสำเร็จ ${inserted} รายการ (บัญชี: ${account})`)
      else alert('พบรายการซ้ำทั้งหมด')
      await loadUnmatched()
    } catch (err) {
      alert('เกิดข้อผิดพลาด: ' + (err as Error).message)
    } finally {
      setBusy(false)
      setStatus('พร้อมดำเนินการ')
    }
  }

  async function runMatch() {
    if (selected.size === 0) return alert('กรุณาเลือกช่องทางอย่างน้อย 1 ช่องทาง')
    setBusy(true)
    setStatus('กำลังจับคู่...')
    try {
      const n = await autoMatch([...selected])
      alert(`จับคู่สำเร็จ ${n} รายการ!`)
      await loadUnmatched()
    } catch (err) {
      alert((err as Error).message)
    } finally {
      setBusy(false)
      setStatus('พร้อมดำเนินการ')
    }
  }

  async function saveManual(stmt: BankStatement) {
    const billNo = (manual[stmt.id] || '').trim()
    if (!billNo) return
    const { error } = await supabase
      .from('bank_statements')
      .update({ bill_no: billNo, is_matched: true })
      .eq('id', stmt.id)
    if (error) return alert('บันทึกไม่สำเร็จ: ' + error.message)
    setUnmatched((prev) => prev.filter((s) => s.id !== stmt.id))
  }

  function toggleChannel(code: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="font-bold text-slate-700">กระทบยอดธนาคาร</h2>
        <div className="flex flex-wrap items-center gap-2">
          <button
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            className="rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
          >
            📤 อัปโหลด Statement (CSV)
          </button>
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={onUpload} />
          <span className="text-sm text-slate-500">{status}</span>
        </div>

        <div>
          <p className="mb-1 text-sm text-slate-600">เลือกช่องทางใบงานเพื่อจับคู่อัตโนมัติ:</p>
          <div className="flex flex-wrap gap-2">
            {channels.map((c) => (
              <label
                key={c.channel_code}
                className="flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-sm"
              >
                <input
                  type="checkbox"
                  checked={selected.has(c.channel_code)}
                  onChange={() => toggleChannel(c.channel_code)}
                />
                {c.channel_code}
              </label>
            ))}
          </div>
        </div>
        <button
          disabled={busy}
          onClick={runMatch}
          className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
        >
          🔗 จับคู่อัตโนมัติ (วันที่+เวลา+ยอด)
        </button>
      </div>

      <div className="space-y-2">
        <h3 className="font-semibold text-slate-700">
          รายการค้างจับคู่ ({unmatched.length}) — กรอกเลขบิลเพื่อจับคู่เอง
        </h3>
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-600">
              <tr>
                <th className="p-2 text-left">จับคู่เอง</th>
                <th className="p-2">วันที่</th>
                <th className="p-2">เวลา</th>
                <th className="p-2 text-left">รายการ</th>
                <th className="p-2 text-right">ฝาก</th>
                <th className="p-2">ช่องทาง</th>
                <th className="p-2 text-left">รายละเอียด</th>
              </tr>
            </thead>
            <tbody>
              {unmatched.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">
                    ไม่มีรายการค้างอยู่ (กรองรายการ Ecommerce ออกแล้ว)
                  </td>
                </tr>
              )}
              {unmatched.map((s) => (
                <tr key={s.id} className="border-t border-slate-100">
                  <td className="p-2">
                    <div className="flex gap-1">
                      <input
                        placeholder="เลขบิล"
                        value={manual[s.id] ?? ''}
                        onChange={(e) => setManual((m) => ({ ...m, [s.id]: e.target.value }))}
                        onKeyDown={(e) => e.key === 'Enter' && saveManual(s)}
                        className="w-28 rounded border border-slate-300 px-2 py-1 text-xs"
                      />
                      <button
                        onClick={() => saveManual(s)}
                        className="rounded bg-green-600 px-2 py-1 text-xs text-white"
                      >
                        บันทึก
                      </button>
                    </div>
                  </td>
                  <td className="p-2 text-center">
                    {new Date(s.statement_date).toLocaleDateString('th-TH')}
                  </td>
                  <td className="p-2 text-center">{s.statement_time?.substring(0, 5)}</td>
                  <td className="p-2">{s.description}</td>
                  <td className="p-2 text-right font-medium">{fmt(s.deposit_amount)}</td>
                  <td className="p-2 text-center">{s.channel}</td>
                  <td className="p-2">{s.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
