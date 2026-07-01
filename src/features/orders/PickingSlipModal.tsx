import { useRef, type CSSProperties } from 'react'
import * as XLSX from 'xlsx'
import html2canvas from 'html2canvas'
import type { PickingData } from './pickingSlip'

interface Props {
  data: PickingData
  onClose: () => void
}

const cellStyle: CSSProperties = {
  border: '1px solid #cbd5e1',
  padding: '4px',
}

export default function PickingSlipModal({ data, onClose }: Props) {
  const printRef = useRef<HTMLDivElement>(null)
  const today = new Date().toLocaleDateString('th-TH')

  async function exportAll() {
    try {
      // 1) PNG
      if (printRef.current) {
        const canvas = await html2canvas(printRef.current, { scale: 3 })
        const a = document.createElement('a')
        a.download = `ใบเบิก_${data.workOrderName}.png`
        a.href = canvas.toDataURL('image/png')
        a.click()
      }
      // 2) XLSX (2 ชีท)
      const wb = XLSX.utils.book_new()
      const main = data.sortedDepts.flatMap((d) => data.deptGroups[d])
      const ws1 = XLSX.utils.aoa_to_sheet([
        ['รหัสทำรายการ', 'รหัสสินค้า', 'รายการสินค้า', 'จุดเก็บ', 'จำนวนเบิก'],
        ...main.map((it) => [it.woName, it.code, it.name, it.location, it.finalQty]),
      ])
      XLSX.utils.book_append_sheet(wb, ws1, 'รายการหยิบสินค้า')
      const ws2 = XLSX.utils.aoa_to_sheet([
        ['รายการอะไหล่', 'จำนวนรวม'],
        ...data.spareList.map((s) => [s.name, s.qty]),
      ])
      XLSX.utils.book_append_sheet(wb, ws2, 'สรุปอะไหล่')
      XLSX.writeFile(wb, `ใบเบิก_${data.workOrderName}.xlsx`)

      // 3) CSV (เต็ม)
      const headers = ['รหัสทำรายการ', 'รหัสสินค้า', 'รายการสินค้า', 'จุดเก็บ', 'จำนวนเบิก']
      const rows = data.fullCsvList.map((it) =>
        [
          `"${it.woName}"`,
          `"${it.code}"`,
          `"${it.name.replace(/"/g, '""')}"`,
          `"${it.location}"`,
          it.finalQty,
        ].join(','),
      )
      const blob = new Blob(['﻿' + [headers.join(','), ...rows].join('\n')], {
        type: 'text/csv;charset=utf-8;',
      })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `ใบเบิก_Full_${data.workOrderName}.csv`
      a.click()
    } catch (e) {
      alert('เกิดข้อผิดพลาดในการ Export: ' + (e as Error).message)
    }
  }

  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h3 className="font-bold text-slate-800">
            ใบเบิก: {data.workOrderName}
          </h3>
          <div className="flex gap-2">
            <button
              onClick={exportAll}
              className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-green-700"
            >
              📥 Export (PNG + Excel + CSV)
            </button>
            <button
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100"
            >
              ปิด
            </button>
          </div>
        </div>

        <div className="overflow-y-auto p-4">
          {/* ใช้ inline style (hex) ทั้งหมด เพื่อให้ html2canvas แคป PNG ได้ (Tailwind v4 ใช้ oklch ที่ไม่รองรับ) */}
          <div
            ref={printRef}
            style={{
              background: '#ffffff',
              padding: '8px',
              fontSize: '13px',
              color: '#1e293b',
              fontFamily: 'Sarabun, sans-serif',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                borderBottom: '2px solid #000',
                paddingBottom: '4px',
                marginBottom: '8px',
                fontWeight: 'bold',
              }}
            >
              <span>ใบเบิกใบงาน: {data.workOrderName}</span>
              <span>วันที่: {today}</span>
            </div>

            {data.sortedDepts.map((dept) => (
              <div key={dept}>
                <h4
                  style={{
                    margin: '12px 0 4px',
                    borderLeft: '4px solid #334155',
                    background: '#f1f5f9',
                    padding: '4px 8px',
                    fontWeight: 600,
                  }}
                >
                  {dept}
                </h4>
                <table
                  style={{
                    width: '100%',
                    tableLayout: 'fixed',
                    borderCollapse: 'collapse',
                    marginBottom: '12px',
                  }}
                >
                  <thead>
                    <tr style={{ background: '#f8fafc' }}>
                      {['จุดเก็บ', 'รหัส', 'รายการ', 'จำนวน'].map((h, i) => (
                        <th
                          key={i}
                          style={{
                            border: '1px solid #cbd5e1',
                            padding: '4px',
                            textAlign: i === 3 ? 'center' : 'left',
                            width: i === 2 ? '40%' : '20%',
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.deptGroups[dept].map((it, i) => (
                      <tr key={i}>
                        <td style={cellStyle}>{it.location}</td>
                        <td style={cellStyle}>{it.code}</td>
                        <td style={cellStyle}>{it.name}</td>
                        <td style={{ ...cellStyle, textAlign: 'center', fontWeight: 'bold' }}>
                          {it.finalQty}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}

            {data.spareList.length > 0 && (
              <>
                <h4 style={{ margin: '12px 0 4px', fontWeight: 600 }}>
                  🔧 รายการอะไหล่รวม
                </h4>
                <table
                  style={{
                    width: '100%',
                    tableLayout: 'fixed',
                    borderCollapse: 'collapse',
                    marginBottom: '12px',
                  }}
                >
                  <thead>
                    <tr style={{ background: '#f8fafc' }}>
                      <th style={{ ...cellStyle, textAlign: 'left' }}>รหัสอะไหล่</th>
                      <th style={{ ...cellStyle, width: '20%' }}>จำนวน</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.spareList.map((s, i) => (
                      <tr key={i}>
                        <td style={cellStyle}>{s.name}</td>
                        <td style={{ ...cellStyle, textAlign: 'center', fontWeight: 'bold' }}>
                          {s.qty}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
