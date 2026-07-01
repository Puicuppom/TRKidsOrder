import { useMemo, useRef, useState } from 'react'
import {
  MultiFormatReader,
  BinaryBitmap,
  HybridBinarizer,
  HTMLCanvasElementLuminanceSource,
} from '@zxing/library'
import { createWorker } from 'tesseract.js'
import { PDFDocument } from 'pdf-lib'
import { pdfjsLib } from '../../lib/pdfWorker'
import type { Order } from '../../types/db'

// อ่านบาร์โค้ด/QR จาก canvas (core API ของ @zxing) — คืน text หรือ null
function decodeBarcode(canvas: HTMLCanvasElement): string | null {
  try {
    const luminance = new HTMLCanvasElementLuminanceSource(canvas)
    const bitmap = new BinaryBitmap(new HybridBinarizer(luminance))
    return new MultiFormatReader().decode(bitmap).getText()
  } catch {
    return null
  }
}

interface Props {
  workOrderName: string
  bills: Order[]
  onClose: () => void
}

const normText = (s: string) =>
  (s || '').toString().toUpperCase().replace(/[^A-Z0-9]/g, '').trim()
const normOCR = (s: string) =>
  normText(s)
    .replace(/O/g, '0')
    .replace(/I/g, '1')
    .replace(/Z/g, '2')
    .replace(/S/g, '5')
    .replace(/B/g, '8')
    .replace(/G/g, '6')

// ดึงเลขพัสดุของบิลในใบงาน (INFU ใช้ที่อยู่ถ้าไม่มีเลขพัสดุ)
function getTrackingNumbers(bills: Order[]): string[] {
  return bills
    .map((o) => {
      let t = o.tracking_number ? o.tracking_number.trim() : ''
      if (!t && o.channel_code === 'INFU' && o.customer_address) {
        const addr = o.customer_address.trim().toUpperCase()
        if (/^(TH|SPX|LEX|KER|KEX|SHP|88|66)/.test(addr)) t = addr
      }
      return t
    })
    .filter((t) => t !== '')
}

export default function WaybillSorterModal({
  workOrderName,
  bills,
  onClose,
}: Props) {
  const trackingNumbersRaw = useMemo(() => getTrackingNumbers(bills), [bills])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [cropTop, setCropTop] = useState(25)
  const [pdfCount, setPdfCount] = useState<number | string>('--')
  const [foundCount, setFoundCount] = useState<number | string>('--')
  const [progress, setProgress] = useState(0)
  const [log, setLog] = useState('')
  const [running, setRunning] = useState(false)
  const [missing, setMissing] = useState<string[]>([])

  function addLog(msg: string) {
    setLog((prev) => msg + '\n' + prev)
  }

  async function renderPageToCanvas(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    page: any,
    scale = 2.8,
  ): Promise<HTMLCanvasElement> {
    const viewport = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')!
    canvas.width = viewport.width
    canvas.height = viewport.height
    await page.render({ canvasContext: ctx, viewport }).promise
    return canvas
  }

  async function mapTrackingInFile(
    file: File,
    targetsText: Set<string>,
    targetsOCR: Set<string>,
    ocr2text: Map<string, string>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    worker: any,
    cropTopPct: number,
  ) {
    const buf = await file.arrayBuffer()
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise
    const pages: { trackingKeyText: string; pageIndex: number }[] = []

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      let keyText: string | null = null

      // 1) text layer
      const tc = await page.getTextContent()
      const textNorm = normText(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tc.items.map((it: any) => it.str).join(''),
      )
      for (const t of targetsText) {
        if (textNorm.includes(t)) {
          keyText = t
          break
        }
      }

      if (!keyText) {
        const canvas = await renderPageToCanvas(page, 2.8)
        // 2) barcode / QR
        const decoded = decodeBarcode(canvas)
        if (decoded) {
          const bText = normText(decoded)
          if (targetsText.has(bText)) keyText = bText
        }
        // 3) OCR fallback
        if (!keyText) {
          const h = canvas.height
          const w = canvas.width
          const ch = Math.round(h * (cropTopPct / 100))
          const top = document.createElement('canvas')
          top.width = w
          top.height = ch
          top.getContext('2d')!.drawImage(canvas, 0, 0, w, ch, 0, 0, w, ch)
          const topNorm = normOCR((await worker.recognize(top)).data.text)
          for (const k of targetsOCR) {
            if (topNorm.includes(k)) {
              keyText = ocr2text.get(k) ?? null
              break
            }
          }
          if (!keyText) {
            const fullNorm = normOCR((await worker.recognize(canvas)).data.text)
            for (const k of targetsOCR) {
              if (fullNorm.includes(k)) {
                keyText = ocr2text.get(k) ?? null
                break
              }
            }
          }
        }
      }

      if (keyText) pages.push({ trackingKeyText: keyText, pageIndex: i - 1 })
      else addLog(`[หน้า ${i}] ❌ ไม่พบเลขพัสดุในหน้านี้`)
    }
    return { fileArrayBuffer: buf, pages }
  }

  async function processFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    const pdfFiles = Array.from(files).filter((f) =>
      f.name.toLowerCase().endsWith('.pdf'),
    )
    if (pdfFiles.length === 0) return alert('ไม่พบไฟล์ PDF')
    setPdfCount(pdfFiles.length)
    setRunning(true)
    setMissing([])
    setProgress(0)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let worker: any = null
    try {
      const valid = trackingNumbersRaw.filter((t) => t.trim().length > 5)
      const targetsText = new Set(valid.map(normText))
      const targetsOCR = new Set(valid.map(normOCR))
      const ocr2text = new Map<string, string>()
      valid.forEach((t) => ocr2text.set(normOCR(t), normText(t)))

      addLog('⏳ กำลังเริ่มต้นระบบ OCR...')
      worker = await createWorker('eng')
      await worker.setParameters({
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
      })

      addLog(`⏳ เริ่มสแกน ${pdfFiles.length} ไฟล์...`)
      const mapping = new Map<string, { fileIndex: number; pageIndex: number }>()
      const fileBuffers: ArrayBuffer[] = []

      for (let idx = 0; idx < pdfFiles.length; idx++) {
        addLog(`📂 อ่านไฟล์ ${idx + 1}/${pdfFiles.length}: ${pdfFiles[idx].name}`)
        try {
          const { fileArrayBuffer, pages } = await mapTrackingInFile(
            pdfFiles[idx],
            targetsText,
            targetsOCR,
            ocr2text,
            worker,
            cropTop,
          )
          fileBuffers[idx] = fileArrayBuffer
          pages.forEach((p) => {
            if (!mapping.has(p.trackingKeyText))
              mapping.set(p.trackingKeyText, {
                fileIndex: idx,
                pageIndex: p.pageIndex,
              })
          })
        } catch (e) {
          addLog(`❌ ไฟล์ ${pdfFiles[idx].name} มีปัญหา: ${(e as Error).message}`)
        }
        setFoundCount(mapping.size)
        setProgress(((idx + 1) / pdfFiles.length) * 100)
      }

      addLog('📊 กำลังรวมไฟล์ PDF ตามลำดับใบงาน...')
      const merged = await PDFDocument.create()
      const docCache = new Map<number, Awaited<ReturnType<typeof PDFDocument.load>>>()
      const miss: string[] = []

      for (const original of trackingNumbersRaw) {
        const key = normText(original)
        if (mapping.has(key)) {
          const { fileIndex, pageIndex } = mapping.get(key)!
          if (!docCache.has(fileIndex))
            docCache.set(fileIndex, await PDFDocument.load(fileBuffers[fileIndex]))
          const [copied] = await merged.copyPages(docCache.get(fileIndex)!, [
            pageIndex,
          ])
          merged.addPage(copied)
        } else {
          miss.push(original)
        }
      }

      const outBytes = await merged.save()
      const blob = new Blob([outBytes as BlobPart], { type: 'application/pdf' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `Sorted_${workOrderName}.pdf`
      a.click()

      setMissing(miss)
      if (miss.length > 0)
        addLog(`⚠️ เสร็จ! พบ ${mapping.size} รายการ, ไม่พบ ${miss.length} รายการ`)
      else addLog('✅ สำเร็จ! พบใบปะหน้าครบทุกรายการ')
    } catch (e) {
      addLog('❌ เกิดข้อผิดพลาด: ' + (e as Error).message)
    } finally {
      if (worker) await worker.terminate()
      setRunning(false)
    }
  }

  function downloadMissing() {
    const csv = '﻿เลขพัสดุที่ไม่พบ\n' + missing.join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'missing_tracking.csv'
    a.click()
  }

  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div>
            <h3 className="font-bold text-slate-800">เรียงใบปะหน้าตามใบงาน</h3>
            <p className="text-sm text-slate-500">ใบงาน: {workOrderName}</p>
          </div>
          <button
            onClick={onClose}
            disabled={running}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100 disabled:opacity-50"
          >
            ปิด
          </button>
        </div>

        <div className="space-y-3 overflow-y-auto p-4">
          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat label="เลขพัสดุในใบงาน" value={trackingNumbersRaw.length} />
            <Stat label="ไฟล์ PDF" value={pdfCount} />
            <Stat label="พบใบปะหน้า" value={foundCount} />
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-600">
            ครอปด้านบนสำหรับ OCR (%):
            <input
              type="number"
              min={5}
              max={100}
              value={cropTop}
              onChange={(e) => setCropTop(parseInt(e.target.value) || 25)}
              className="w-20 rounded border border-slate-300 px-2 py-1"
            />
          </label>

          <button
            disabled={running || trackingNumbersRaw.length === 0}
            onClick={() => fileInputRef.current?.click()}
            className="w-full rounded-lg bg-violet-600 py-2 font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
          >
            {running ? 'กำลังประมวลผล...' : '📁 เลือกไฟล์ PDF ใบปะหน้า'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            multiple
            className="hidden"
            onChange={(e) => processFiles(e.target.files)}
          />

          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full bg-violet-500 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>

          {missing.length > 0 && (
            <button
              onClick={downloadMissing}
              className="w-full rounded-lg bg-amber-500 py-2 text-sm font-semibold text-white hover:bg-amber-600"
            >
              ⬇️ ดาวน์โหลดรายการที่ไม่พบ ({missing.length})
            </button>
          )}

          <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg bg-slate-900 p-3 text-xs text-green-300">
            {log || 'พร้อมเริ่ม...'}
          </pre>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg bg-slate-100 p-2">
      <div className="text-lg font-bold text-slate-800">{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  )
}
