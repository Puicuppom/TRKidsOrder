import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { uploadImage, productImagePath } from '../../lib/storage'
import type { Product } from '../../types/db'

interface Props {
  product: Product | null
  onClose: () => void
  onSaved: () => void
}

const field =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-violet-500'

export default function ProductModal({ product, onClose, onSaved }: Props) {
  const isEdit = !!product
  const [code, setCode] = useState(product?.product_code ?? '')
  const [name, setName] = useState(product?.product_name ?? '')
  const [category, setCategory] = useState(product?.product_category ?? '')
  const [type, setType] = useState(product?.product_type ?? '')
  const [rubber, setRubber] = useState(product?.rubber_code ?? '')
  const [storage, setStorage] = useState(product?.storage_location ?? '')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState(product?.image_url ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    if (!code.trim() || !name.trim()) {
      setError('กรุณากรอกรหัสและชื่อสินค้า')
      return
    }
    setBusy(true)
    setError('')
    try {
      let imageUrl = product?.image_url ?? null
      if (file) imageUrl = await uploadImage(file, productImagePath(code.trim(), file))
      const data: Record<string, unknown> = {
        product_code: code.trim(),
        product_name: name.trim(),
        product_category: category.trim() || null,
        product_type: type.trim() || null,
        rubber_code: rubber.trim() || null,
        storage_location: storage.trim() || null,
        image_url: imageUrl,
      }
      if (!isEdit) data.is_active = true
      const { error } = await supabase
        .from('products')
        .upsert(data, { onConflict: 'product_code' })
      if (error) throw error
      onSaved()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md space-y-3 rounded-xl bg-white p-5">
        <h3 className="text-lg font-bold text-slate-800">
          {isEdit ? 'แก้ไขข้อมูลสินค้า' : 'เพิ่มสินค้าใหม่'}
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
          รหัสสินค้า
          <input
            className={field}
            value={code}
            readOnly={isEdit}
            onChange={(e) => setCode(e.target.value)}
          />
        </label>
        <label className="block text-sm text-slate-600">
          ชื่อสินค้า
          <input className={field} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-sm text-slate-600">
            หมวดหมู่
            <input className={field} value={category} onChange={(e) => setCategory(e.target.value)} />
          </label>
          <label className="block text-sm text-slate-600">
            ประเภท
            <input className={field} value={type} onChange={(e) => setType(e.target.value)} />
          </label>
          <label className="block text-sm text-slate-600">
            รหัสยาง/อะไหล่
            <input className={field} value={rubber} onChange={(e) => setRubber(e.target.value)} />
          </label>
          <label className="block text-sm text-slate-600">
            ที่จัดเก็บ
            <input className={field} value={storage} onChange={(e) => setStorage(e.target.value)} />
          </label>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">
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
  )
}
