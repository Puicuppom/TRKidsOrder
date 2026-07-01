import { useState } from 'react'
import type { Order } from '../../types/db'
import { useUpdateTracking } from '../../hooks/useOrders'
import {
  getBillingIndicator,
  getPackedInfo,
} from './orderHelpers'

interface Props {
  order: Order
  selected: boolean
  onToggle: (id: number) => void
  onEdit?: (order: Order) => void
}

export default function OrderListItem({
  order,
  selected,
  onToggle,
  onEdit,
}: Props) {
  const updateTracking = useUpdateTracking()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(order.tracking_number ?? '')

  const billing = getBillingIndicator(order)
  const packed = getPackedInfo(order)
  const isClaim =
    order.channel_code === 'CLAIM' && (order.claim_type || order.claim_details)

  async function saveTracking() {
    const trimmed = value.trim()
    if (trimmed !== (order.tracking_number ?? '')) {
      await updateTracking.mutateAsync({ id: order.id, tracking: trimmed })
    }
    setEditing(false)
  }

  return (
    <li className="flex items-center gap-3 border-b border-slate-100 px-3 py-2 hover:bg-slate-50">
      <input
        type="checkbox"
        checked={selected}
        onChange={() => onToggle(order.id)}
        className="size-4 shrink-0"
      />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2">
          {onEdit ? (
            <button
              onClick={() => onEdit(order)}
              className="font-bold text-violet-700 hover:underline"
              title="แก้ไขบิลนี้"
            >
              {order.bill_no || 'N/A'}
            </button>
          ) : (
            <strong className="text-slate-800">{order.bill_no || 'N/A'}</strong>
          )}
          <span className="text-sm text-slate-500">
            {order.customer_name || 'N/A'}
          </span>
          {billing && (
            <span
              className={`rounded px-1.5 py-0.5 text-xs font-bold ${billing.className}`}
            >
              {billing.label}
            </span>
          )}
        </div>

        {isClaim && (
          <div className="text-xs text-red-600">
            เคลม: {order.claim_type && <strong>{order.claim_type}</strong>}
            {order.claim_type && order.claim_details ? ': ' : ''}
            {order.claim_details}
          </div>
        )}

        {packed && (
          <div className="text-xs font-bold text-green-600">{packed}</div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {editing ? (
          <>
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveTracking()
                if (e.key === 'Escape') setEditing(false)
              }}
              className="w-40 rounded border border-slate-300 px-2 py-0.5 text-sm"
            />
            <button
              onClick={saveTracking}
              disabled={updateTracking.isPending}
              className="rounded bg-green-600 px-2 py-0.5 text-xs text-white"
            >
              บันทึก
            </button>
          </>
        ) : (
          <>
            <span
              className={`text-sm ${order.tracking_number ? 'text-slate-600' : 'text-slate-300'}`}
            >
              {order.tracking_number || 'ยังไม่มีเลขพัสดุ'}
            </span>
            <button
              title={order.tracking_number ? 'แก้ไขเลขพัสดุ' : 'เพิ่มเลขพัสดุ'}
              onClick={() => {
                setValue(order.tracking_number ?? '')
                setEditing(true)
              }}
              className="rounded px-1 text-sm hover:bg-slate-200"
            >
              ✏️
            </button>
          </>
        )}
      </div>
    </li>
  )
}
