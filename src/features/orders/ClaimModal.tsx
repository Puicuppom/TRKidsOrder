import { useEffect, useState } from 'react'
import { fetchClaimTypes } from './claimActions'
import type { Order } from '../../types/db'

interface Props {
  order: Order
  onClose: () => void
  onSubmit: (claimType: string, claimDetails: string) => void
  busy: boolean
}

export default function ClaimModal({ order, onClose, onSubmit, busy }: Props) {
  const [types, setTypes] = useState<string[]>([])
  const [selected, setSelected] = useState('')
  const [newType, setNewType] = useState('')
  const [details, setDetails] = useState('')

  const originalBillNo = order.bill_no.replace(/^C\d*-/, '')

  useEffect(() => {
    fetchClaimTypes().then(setTypes)
  }, [])

  function submit() {
    const claimType = selected === 'new' ? newType.trim() : selected
    if (!claimType) {
      alert('กรุณาเลือกหรือระบุประเภทการเคลม')
      return
    }
    onSubmit(claimType, details.trim())
  }

  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md space-y-3 rounded-xl bg-white p-5">
        <h3 className="text-lg font-bold text-slate-800">
          ระบุรายละเอียดเคลมสำหรับ: {originalBillNo}
        </h3>

        <label className="block text-sm text-slate-600">
          ประเภทเคลม
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-violet-500"
          >
            <option value="" disabled>
              -- เลือกประเภท --
            </option>
            {types.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
            <option value="new">-- พิมพ์ใหม่ --</option>
          </select>
        </label>

        {selected === 'new' && (
          <input
            placeholder="พิมพ์ประเภทเคลมใหม่"
            value={newType}
            onChange={(e) => setNewType(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-violet-500"
          />
        )}

        <label className="block text-sm text-slate-600">
          รายละเอียดเคลม
          <textarea
            rows={3}
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-violet-500"
          />
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm"
          >
            ยกเลิก
          </button>
          <button
            onClick={submit}
            disabled={busy}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {busy ? 'กำลังสร้าง...' : 'สร้างบิลเคลม'}
          </button>
        </div>
      </div>
    </div>
  )
}
