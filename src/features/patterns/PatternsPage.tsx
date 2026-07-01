import { useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useCartoonPatterns } from '../../hooks/useMetadata'
import { uploadImage, patternImagePath } from '../../lib/storage'
import type { CartoonPattern } from '../../types/db'

export default function PatternsPage() {
  const { data: patterns = [], isLoading } = useCartoonPatterns()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const bulkRef = useRef<HTMLInputElement>(null)

  // modal state
  const [open, setOpen] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [name, setName] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState('')
  const [error, setError] = useState('')

  const refresh = () => qc.invalidateQueries({ queryKey: ['cartoon_patterns'] })

  const filtered = useMemo(
    () =>
      patterns.filter((p) =>
        String(p.pattern_name ?? '')
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
    [patterns, search],
  )

  function openAdd() {
    setEditId(null)
    setName('')
    setFile(null)
    setPreview('')
    setError('')
    setOpen(true)
  }
  function openEdit(p: CartoonPattern) {
    setEditId(p.id)
    setName(p.pattern_name ?? '')
    setFile(null)
    setPreview(p.image_url ?? '')
    setError('')
    setOpen(true)
  }

  async function save() {
    if (!name.trim()) {
      setError('กรุณากรอกชื่อลาย')
      return
    }
    setBusy(true)
    setError('')
    try {
      let imageUrl: string | null = null
      if (file) imageUrl = await uploadImage(file, patternImagePath(file))
      if (editId) {
        const data: Record<string, unknown> = { pattern_name: name.trim() }
        if (imageUrl) data.image_url = imageUrl
        const { error } = await supabase
          .from('cartoon_patterns')
          .update(data)
          .eq('id', editId)
        if (error) throw error
      } else {
        if (!imageUrl) throw new Error('กรุณาเลือกรูปภาพ')
        const { error } = await supabase
          .from('cartoon_patterns')
          .insert({ pattern_name: name.trim(), image_url: imageUrl })
        if (error) throw error
      }
      setOpen(false)
      await refresh()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function remove(p: CartoonPattern) {
    if (!confirm('ยืนยันการลบลายนี้?')) return
    setBusy(true)
    await supabase.from('cartoon_patterns').delete().eq('id', p.id)
    await refresh()
    setBusy(false)
  }

  async function handleBulk(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    e.target.value = ''
    if (!files || files.length === 0) return
    setBusy(true)
    let ok = 0
    for (const f of Array.from(files)) {
      try {
        const pname = f.name.substring(0, f.name.lastIndexOf('.'))
        const url = await uploadImage(f, patternImagePath(f))
        await supabase
          .from('cartoon_patterns')
          .upsert({ pattern_name: pname, image_url: url }, { onConflict: 'pattern_name' })
        ok++
      } catch {
        /* ข้าม */
      }
    }
    setBusy(false)
    alert(`อัปโหลดลายสำเร็จ ${ok} รายการ (ชื่อไฟล์ = ชื่อลาย)`)
    await refresh()
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-bold text-slate-800">จัดการลายการ์ตูน</h1>
        <div className="ml-auto flex gap-2">
          <button
            onClick={openAdd}
            className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-700"
          >
            + เพิ่มลาย
          </button>
          <button
            disabled={busy}
            onClick={() => bulkRef.current?.click()}
            className="rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-600"
          >
            🖼️ อัปโหลดหลายไฟล์
          </button>
          <input ref={bulkRef} type="file" accept="image/*" multiple className="hidden" onChange={handleBulk} />
        </div>
      </div>

      <input
        placeholder="ค้นหาชื่อลาย"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-64 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {isLoading && <p className="text-slate-400">กำลังโหลด...</p>}
        {filtered.map((p) => (
          <div key={p.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            {p.image_url ? (
              <img
                src={p.image_url}
                onClick={() => window.open(p.image_url!, '_blank')}
                className="aspect-square w-full cursor-zoom-in object-cover"
              />
            ) : (
              <div className="flex aspect-square items-center justify-center bg-slate-50 text-xs text-slate-300">
                No Pic
              </div>
            )}
            <div className="p-2">
              <div className="truncate text-sm font-medium text-slate-700" title={p.pattern_name ?? ''}>
                {p.pattern_name}
              </div>
              <div className="mt-1 flex gap-1">
                <button
                  onClick={() => openEdit(p)}
                  className="flex-1 rounded bg-blue-600 py-1 text-xs text-white"
                >
                  แก้ไข
                </button>
                <button
                  disabled={busy}
                  onClick={() => remove(p)}
                  className="flex-1 rounded bg-red-600 py-1 text-xs text-white"
                >
                  ลบ
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {open && (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm space-y-3 rounded-xl bg-white p-5">
            <h3 className="text-lg font-bold text-slate-800">
              {editId ? 'แก้ไขลายการ์ตูน' : 'เพิ่มลายการ์ตูน'}
            </h3>
            <div className="flex items-center gap-3">
              {preview ? (
                <img src={preview} className="size-20 rounded-lg border border-slate-200 object-cover" />
              ) : (
                <div className="flex size-20 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-xs text-slate-300">
                  No Pic
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null
                  setFile(f)
                  if (f) setPreview(URL.createObjectURL(f))
                }}
                className="text-sm"
              />
            </div>
            <label className="block text-sm text-slate-600">
              ชื่อลาย
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-violet-500"
              />
            </label>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setOpen(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">
                ยกเลิก
              </button>
              <button
                onClick={save}
                disabled={busy}
                className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
              >
                {busy ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
