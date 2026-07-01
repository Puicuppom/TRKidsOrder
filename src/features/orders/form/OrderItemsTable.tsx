import SearchSelect from '../../../components/SearchSelect'
import type { Option } from '../../../components/SearchSelect'
import type { ItemRowState } from './formTypes'
import type { InkType } from '../../../types/db'

interface Props {
  rows: ItemRowState[]
  productOptions: Option[]
  fonts: string[]
  inkTypes: InkType[]
  disabled?: boolean
  onChangeRow: (uid: string, patch: Partial<ItemRowState>) => void
  onChangeProduct: (uid: string, productId: number | null) => void
  onRemoveRow: (uid: string) => void
}

// ความกว้างแต่ละคอลัมน์ (จบในแถวเดียว เลื่อนแนวนอนได้ถ้าจอแคบ)
const COLS =
  '170px 110px 46px 78px 70px 76px 44px 118px 118px 118px 56px 150px 140px 34px'

const inputCls =
  'h-9 w-full rounded border border-slate-300 px-1 text-[11px] outline-none focus:border-violet-500 disabled:bg-slate-100'

const headers = [
  'ชื่อสินค้า',
  'สีหมึก',
  'ชั้น',
  'ลายการ์ตูน',
  'ปก',
  'ฟอนต์',
  'ไม่รับชื่อ',
  'บรรทัด 1',
  'บรรทัด 2',
  'บรรทัด 3',
  'จำนวน',
  'หมายเหตุ',
  'ไฟล์แนบ',
  '',
]

export default function OrderItemsTable({
  rows,
  productOptions,
  fonts,
  inkTypes,
  disabled,
  onChangeRow,
  onChangeProduct,
  onRemoveRow,
}: Props) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <div className="min-w-max">
        {/* header */}
        <div
          className="grid gap-1 bg-slate-100 px-2 py-1.5 text-[11px] font-semibold text-slate-500"
          style={{ gridTemplateColumns: COLS }}
        >
          {headers.map((h, i) => (
            <div key={i} className="truncate">
              {h}
            </div>
          ))}
        </div>

        {/* rows */}
        {rows.length === 0 && (
          <div className="px-2 py-3 text-center text-sm text-slate-400">
            ยังไม่มีรายการสินค้า
          </div>
        )}
        {rows.map((r) => (
          <div
            key={r.uid}
            className={`grid items-center gap-1 border-t border-slate-100 px-2 py-1.5 ${
              r.isAutoAdded ? 'bg-green-50' : ''
            }`}
            style={{ gridTemplateColumns: COLS }}
          >
            <SearchSelect
              options={productOptions}
              value={r.product_id ? String(r.product_id) : null}
              disabled={disabled}
              placeholder="เลือกสินค้า"
              size="sm"
              onChange={(val) =>
                onChangeProduct(r.uid, val ? Number(val) : null)
              }
            />
            <select
              className={inputCls}
              disabled={disabled}
              value={r.ink_color}
              onChange={(e) => onChangeRow(r.uid, { ink_color: e.target.value })}
            >
              <option value="">--สี--</option>
              {inkTypes.map((ink) => (
                <option key={ink.ink_name} value={ink.ink_name}>
                  {ink.ink_name}
                </option>
              ))}
            </select>
            <select
              className={inputCls}
              disabled={disabled || r.isCondoPart}
              value={r.shelf_location}
              onChange={(e) =>
                onChangeRow(r.uid, { shelf_location: e.target.value })
              }
            >
              <option value="">-</option>
              {['1', '2', '3', '4', '5'].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <input
              className={inputCls}
              disabled={disabled}
              value={r.cartoon_pattern}
              onChange={(e) =>
                onChangeRow(r.uid, { cartoon_pattern: e.target.value })
              }
            />
            <input
              className={inputCls}
              disabled={disabled}
              value={r.line_pattern}
              onChange={(e) =>
                onChangeRow(r.uid, { line_pattern: e.target.value })
              }
            />
            <select
              className={inputCls}
              disabled={disabled}
              value={r.font}
              onChange={(e) => onChangeRow(r.uid, { font: e.target.value })}
            >
              <option value="">--</option>
              {fonts.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
            <div className="flex justify-center">
              <input
                type="checkbox"
                disabled={disabled}
                checked={r.no_name}
                onChange={(e) =>
                  onChangeRow(r.uid, { no_name: e.target.checked })
                }
                className="size-4"
              />
            </div>
            {(['line_1', 'line_2', 'line_3'] as const).map((k) => (
              <input
                key={k}
                className={inputCls}
                disabled={disabled || r.no_name}
                value={r[k]}
                onChange={(e) => onChangeRow(r.uid, { [k]: e.target.value })}
              />
            ))}
            <input
              type="number"
              min={1}
              className={inputCls}
              disabled={disabled || r.qtyReadonly}
              value={r.quantity}
              onChange={(e) =>
                onChangeRow(r.uid, { quantity: parseInt(e.target.value) || 1 })
              }
            />
            <input
              className={inputCls}
              disabled={disabled}
              value={r.notes}
              onChange={(e) => onChangeRow(r.uid, { notes: e.target.value })}
            />
            <input
              className={inputCls}
              disabled={disabled}
              value={r.file_attachment}
              onChange={(e) =>
                onChangeRow(r.uid, { file_attachment: e.target.value })
              }
            />
            <div className="flex justify-center">
              {!disabled && (
                <button
                  type="button"
                  onClick={() => onRemoveRow(r.uid)}
                  title="ลบรายการ"
                  className="rounded bg-red-500 px-1.5 py-1 text-xs text-white hover:bg-red-600"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
