import { useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import * as XLSX from 'xlsx'
import { supabase } from '../../lib/supabase'
import { useProducts } from '../../hooks/useMetadata'
import { uploadImage, productImagePath } from '../../lib/storage'
import ProductModal from './ProductModal'
import type { Product } from '../../types/db'

export default function ProductsPage() {
  const { data: products = [], isLoading } = useProducts()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [editing, setEditing] = useState<Product | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [busy, setBusy] = useState(false)
  const importRef = useRef<HTMLInputElement>(null)
  const bulkImgRef = useRef<HTMLInputElement>(null)

  const refresh = () => qc.invalidateQueries({ queryKey: ['products'] })

  const filtered = useMemo(() => {
    const t = search.toLowerCase()
    return products
      .filter((p) => {
        const matchSearch =
          (p.product_code || '').toLowerCase().includes(t) ||
          (p.product_name || '').toLowerCase().includes(t)
        const isActive = p.is_active !== false
        const matchStatus =
          statusFilter === 'all' ||
          (statusFilter === 'active' && isActive) ||
          (statusFilter === 'inactive' && !isActive)
        return matchSearch && matchStatus
      })
      .sort((a, b) => (a.product_code || '').localeCompare(b.product_code || ''))
  }, [products, search, statusFilter])

  async function toggleStatus(p: Product) {
    const next = p.is_active === false
    if (
      !confirm(next ? `เปิดการขาย "${p.product_code}"?` : `หยุดขาย "${p.product_code}"?`)
    )
      return
    setBusy(true)
    await supabase
      .from('products')
      .update({ is_active: next })
      .eq('product_code', p.product_code)
    await refresh()
    setBusy(false)
  }

  async function remove(p: Product) {
    if (!confirm(`ลบสินค้า "${p.product_code}" ถาวร?\n(แนะนำให้ใช้ปุ่มหยุดขายแทน)`)) return
    setBusy(true)
    await supabase.from('products').delete().eq('product_code', p.product_code)
    await refresh()
    setBusy(false)
  }

  function downloadTemplate() {
    const ws = XLSX.utils.aoa_to_sheet([
      ['product_code', 'product_name', 'product_category', 'product_type', 'rubber_code', 'storage_location'],
      ['P001', 'สติกเกอร์กันน้ำ', 'STK', 'FINISHPRODUCT', '', '3Aชั้น2แถว2'],
    ])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'ProductTemplate')
    XLSX.writeFile(wb, 'Product_Import_Template.xlsx')
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(new Uint8Array(buf), { type: 'array' })
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
        wb.Sheets[wb.SheetNames[0]],
      )
      const toUpsert = rows
        .map((r) => ({
          product_code: String(r.product_code || r['รหัสสินค้า'] || '').trim(),
          product_name: String(r.product_name || r['ชื่อสินค้า'] || '').trim(),
          product_category: String(r.product_category || r['หมวดหมู่'] || '').trim() || null,
          product_type: String(r.product_type || r['ประเภท'] || '').trim() || null,
          rubber_code: String(r.rubber_code || r['รหัสยาง'] || '').trim() || null,
          storage_location: String(r.storage_location || r['ที่จัดเก็บ'] || '').trim() || null,
          is_active: true,
        }))
        .filter((p) => p.product_code && p.product_name)
      const { error } = await supabase
        .from('products')
        .upsert(toUpsert, { onConflict: 'product_code' })
      if (error) throw error
      alert(`นำเข้าเรียบร้อย ${toUpsert.length} รายการ`)
      await refresh()
    } catch (err) {
      alert('Import ผิดพลาด: ' + (err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function handleBulkImages(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    e.target.value = ''
    if (!files || files.length === 0) return
    setBusy(true)
    let ok = 0
    for (const file of Array.from(files)) {
      try {
        const code = file.name.substring(0, file.name.lastIndexOf('.')).trim()
        const url = await uploadImage(file, productImagePath(code, file))
        await supabase.from('products').update({ image_url: url }).eq('product_code', code)
        ok++
      } catch {
        /* ข้ามไฟล์ที่พลาด */
      }
    }
    setBusy(false)
    alert(`อัปเดตรูปสำเร็จ ${ok} รายการ (ชื่อไฟล์ต้องตรงกับรหัสสินค้า)`)
    await refresh()
  }

  const btn = 'rounded-lg px-3 py-1.5 text-sm font-medium'

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-bold text-slate-800">จัดการสินค้า</h1>
        <div className="ml-auto flex flex-wrap gap-2">
          <button
            onClick={() => {
              setEditing(null)
              setShowModal(true)
            }}
            className={btn + ' bg-violet-600 text-white hover:bg-violet-700'}
          >
            + เพิ่มสินค้า
          </button>
          <button onClick={downloadTemplate} className={btn + ' bg-sky-100 text-sky-700'}>
            📥 Template
          </button>
          <button
            disabled={busy}
            onClick={() => importRef.current?.click()}
            className={btn + ' bg-green-600 text-white hover:bg-green-700'}
          >
            📤 Import Excel
          </button>
          <button
            disabled={busy}
            onClick={() => bulkImgRef.current?.click()}
            className={btn + ' bg-amber-500 text-white hover:bg-amber-600'}
          >
            🖼️ อัปโหลดรูปหลายไฟล์
          </button>
          <input ref={importRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImport} />
          <input ref={bulkImgRef} type="file" accept="image/*" multiple className="hidden" onChange={handleBulkImages} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          placeholder="ค้นหา รหัส / ชื่อสินค้า"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
        >
          <option value="all">ทุกสถานะ</option>
          <option value="active">เปิดขาย</option>
          <option value="inactive">หยุดขาย</option>
        </select>
        <span className="text-sm text-slate-500">{filtered.length} รายการ</span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-left text-xs text-slate-600">
            <tr>
              <th className="p-2">รูป</th>
              <th className="p-2">รหัส</th>
              <th className="p-2">ชื่อสินค้า</th>
              <th className="p-2">หมวด</th>
              <th className="p-2">ประเภท</th>
              <th className="p-2">รหัสยาง</th>
              <th className="p-2">ที่จัดเก็บ</th>
              <th className="p-2">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={8} className="p-6 text-center text-slate-400">
                  กำลังโหลด...
                </td>
              </tr>
            )}
            {filtered.map((p) => {
              const inactive = p.is_active === false
              return (
                <tr
                  key={p.product_code}
                  className={`border-t border-slate-100 ${inactive ? 'opacity-60' : ''}`}
                >
                  <td className="p-2">
                    {p.image_url ? (
                      <img
                        src={p.image_url}
                        onClick={() => window.open(p.image_url!, '_blank')}
                        className="size-11 cursor-zoom-in rounded border border-slate-200 object-cover"
                      />
                    ) : (
                      <div className="flex size-11 items-center justify-center rounded border border-slate-200 bg-slate-50 text-[9px] text-slate-300">
                        No Pic
                      </div>
                    )}
                  </td>
                  <td className="p-2 font-bold text-slate-700">{p.product_code}</td>
                  <td className="p-2">{p.product_name}</td>
                  <td className="p-2">
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-xs">
                      {p.product_category}
                    </span>
                  </td>
                  <td className="p-2">{p.product_type}</td>
                  <td className="p-2">{p.rubber_code}</td>
                  <td className="p-2">{p.storage_location}</td>
                  <td className="p-2">
                    <div className="flex gap-1">
                      <button
                        disabled={busy}
                        onClick={() => toggleStatus(p)}
                        className={`rounded px-2 py-1 text-xs text-white ${inactive ? 'bg-green-600' : 'bg-amber-500'}`}
                      >
                        {inactive ? 'เปิด' : 'ปิด'}
                      </button>
                      <button
                        onClick={() => {
                          setEditing(p)
                          setShowModal(true)
                        }}
                        className="rounded bg-blue-600 px-2 py-1 text-xs text-white"
                      >
                        แก้ไข
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => remove(p)}
                        className="rounded bg-red-600 px-2 py-1 text-xs text-white"
                      >
                        ลบ
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {showModal && (
        <ProductModal
          product={editing}
          onClose={() => setShowModal(false)}
          onSaved={async () => {
            setShowModal(false)
            await refresh()
          }}
        />
      )}
    </div>
  )
}
