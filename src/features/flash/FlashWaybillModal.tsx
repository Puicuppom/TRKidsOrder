import { useMemo, useState } from 'react'
import {
  buildFlashRows,
  exportFlashXlsx,
  syncPreviewToExport,
  rowHasMissing,
  PREVIEW_HEADERS,
  type FlashRow,
} from './flashExport'
import type { Order } from '../../types/db'

interface Props {
  workOrderName: string
  bills: Order[]
  onClose: () => void
}

export default function FlashWaybillModal({
  workOrderName,
  bills,
  onClose,
}: Props) {
  const [rows, setRows] = useState<FlashRow[]>(() => buildFlashRows(bills))
  const missingCount = useMemo(
    () => rows.filter(rowHasMissing).length,
    [rows],
  )

  // ความกว้าง + จำนวนบรรทัดต่อคอลัมน์ (index ตรงกับ PREVIEW_HEADERS)
  const colConfig = [
    { width: 220, rows: 0 }, // ที่อยู่ต้นฉบับ (อ่านอย่างเดียว)
    { width: 150, rows: 2 }, // ชื่อผู้รับ
    { width: 320, rows: 4 }, // ที่อยู่ (ใหญ่สุด)
    { width: 90, rows: 1 }, // ไปรษณีย์
    { width: 120, rows: 1 }, // เบอร์ 1
    { width: 120, rows: 1 }, // เบอร์ 2
    { width: 80, rows: 1 }, // COD
  ]

  function editCell(rowIdx: number, colIdx: number, value: string) {
    setRows((prev) => {
      const next = [...prev]
      const row = { ...next[rowIdx] }
      syncPreviewToExport(row, colIdx, value)
      next[rowIdx] = row
      return next
    })
  }

  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[92vh] w-full max-w-6xl flex-col rounded-xl bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div>
            <h3 className="font-bold text-slate-800">
              ตรวจสอบและ Export ใบปะหน้า (Flash)
            </h3>
            <p className="text-sm text-slate-500">
              ใบงาน: {workOrderName} · {rows.length} แถว
              {missingCount > 0 && (
                <span className="ml-2 text-red-600">
                  (ข้อมูลไม่ครบ {missingCount} แถว)
                </span>
              )}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => exportFlashXlsx(rows, workOrderName)}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700"
            >
              📥 Export Excel (.xlsx)
            </button>
            <button
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100"
            >
              ปิด
            </button>
          </div>
        </div>

        <div className="overflow-auto p-3">
          <p className="mb-2 text-xs text-slate-400">
            แก้ไขในตารางได้โดยตรง · คอลัมน์แรกคือที่อยู่ต้นฉบับ · แถวสีแดง = ข้อมูลบังคับไม่ครบ
          </p>
          <table className="border-collapse text-sm" style={{ tableLayout: 'fixed' }}>
            <colgroup>
              {colConfig.map((c, i) => (
                <col key={i} style={{ width: c.width }} />
              ))}
            </colgroup>
            <thead>
              <tr className="bg-slate-100">
                {PREVIEW_HEADERS.map((h, i) => (
                  <th
                    key={i}
                    className="whitespace-pre-line border border-slate-200 p-2 text-left text-xs font-semibold text-slate-600"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => {
                const missing = rowHasMissing(row)
                return (
                  <tr key={ri} className={missing ? 'bg-red-50' : ''}>
                    {PREVIEW_HEADERS.map((h, ci) => (
                      <td
                        key={ci}
                        className="border border-slate-200 p-1 align-top"
                      >
                        {ci === 0 ? (
                          <div className="whitespace-pre-line text-xs text-slate-500">
                            {row[h]}
                          </div>
                        ) : (
                          <textarea
                            value={row[h] ?? ''}
                            onChange={(e) => editCell(ri, ci, e.target.value)}
                            rows={colConfig[ci].rows}
                            className="w-full resize-y rounded border border-transparent bg-amber-50/40 px-1 py-0.5 text-xs leading-snug outline-none focus:border-violet-400"
                          />
                        )}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
