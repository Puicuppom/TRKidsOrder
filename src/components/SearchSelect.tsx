import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export interface Option {
  value: string
  label: string
}

interface Props {
  options: Option[]
  value: string | null
  onChange: (value: string | null) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  size?: 'sm' | 'md' // sm = ตารางสินค้า (เตี้ย), md = ฟอร์มทั่วไป
}

// Dropdown ค้นหาได้ (แทน select2) — เมนูเปิดผ่าน portal เพื่อไม่ให้โดน overflow ตัด
export default function SearchSelect({
  options,
  value,
  onChange,
  placeholder = 'เลือก',
  disabled,
  className = '',
  size = 'md',
}: Props) {
  const heightCls =
    size === 'sm' ? 'h-9 px-1.5 text-[11px]' : 'h-10 px-3 text-[13px]'
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [rect, setRect] = useState<DOMRect | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const selected = options.find((o) => o.value === value)

  function reposition() {
    if (btnRef.current) setRect(btnRef.current.getBoundingClientRect())
  }

  useLayoutEffect(() => {
    if (open) reposition()
  }, [open])

  useEffect(() => {
    if (!open) return
    function onScrollResize() {
      reposition()
    }
    function onDoc(e: MouseEvent) {
      const t = e.target as Node
      if (
        btnRef.current?.contains(t) ||
        menuRef.current?.contains(t)
      )
        return
      setOpen(false)
      setQuery('')
    }
    window.addEventListener('scroll', onScrollResize, true)
    window.addEventListener('resize', onScrollResize)
    document.addEventListener('mousedown', onDoc)
    return () => {
      window.removeEventListener('scroll', onScrollResize, true)
      window.removeEventListener('resize', onScrollResize)
      document.removeEventListener('mousedown', onDoc)
    }
  }, [open])

  const filtered = query
    ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : options

  function choose(v: string | null) {
    onChange(v)
    setOpen(false)
    setQuery('')
  }

  return (
    <div className={`relative ${className}`}>
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center justify-between rounded border border-slate-300 bg-white text-left disabled:bg-slate-100 ${heightCls} ${
          selected ? 'text-slate-800' : 'text-slate-400'
        }`}
      >
        <span className="truncate">{selected ? selected.label : placeholder}</span>
        <span className="ml-1 shrink-0 text-slate-400">▾</span>
      </button>

      {open &&
        !disabled &&
        rect &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              position: 'fixed',
              top: rect.bottom + 2,
              left: rect.left,
              width: Math.max(rect.width, 220),
              zIndex: 1000,
            }}
            className="max-h-72 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl"
          >
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="พิมพ์เพื่อค้นหา..."
              className="w-full border-b border-slate-100 px-2 py-1.5 text-sm outline-none"
            />
            <ul className="max-h-60 overflow-y-auto">
              {value && (
                <li>
                  <button
                    type="button"
                    onClick={() => choose(null)}
                    className="block w-full px-2 py-1.5 text-left text-sm text-slate-400 hover:bg-slate-50"
                  >
                    — ล้างค่า —
                  </button>
                </li>
              )}
              {filtered.length === 0 && (
                <li className="px-2 py-2 text-sm text-slate-400">ไม่พบรายการ</li>
              )}
              {filtered.map((o) => (
                <li key={o.value}>
                  <button
                    type="button"
                    onClick={() => choose(o.value)}
                    className={`block w-full px-2 py-1.5 text-left text-sm hover:bg-violet-50 ${
                      o.value === value ? 'bg-violet-100 font-medium' : ''
                    }`}
                  >
                    {o.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>,
          document.body,
        )}
    </div>
  )
}
