import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import OrderStatusTab from './OrderStatusTab'
import WorkOrdersTab from './WorkOrdersTab'
import OrderForm from './form/OrderForm'
import type { Order } from '../../types/db'

type TabKey =
  | 'create'
  | 'waiting'
  | 'complete'
  | 'work-orders'
  | 'shipped'
  | 'cancelled'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'create', label: '➕ สร้างออร์เดอร์' },
  { key: 'waiting', label: 'รอลงข้อมูล' },
  { key: 'complete', label: 'ลงข้อมูลเสร็จสิ้น' },
  { key: 'work-orders', label: 'ใบงาน (กำลังผลิต)' },
  { key: 'shipped', label: 'จัดส่งแล้ว' },
  { key: 'cancelled', label: 'ยกเลิก' },
]

export default function OrdersPage() {
  const qc = useQueryClient()
  const [tab, setTab] = useState<TabKey>('waiting')
  const [editingOrder, setEditingOrder] = useState<Order | null>(null)

  function handleEdit(order: Order) {
    setEditingOrder(order)
    setTab('create')
  }

  function handleSaved() {
    // รีเฟรชข้อมูลทุกแท็บ แล้วกลับไปหน้ารายการ
    qc.invalidateQueries({ queryKey: ['orders'] })
    setEditingOrder(null)
    setTab('waiting')
  }

  function selectTab(key: TabKey) {
    if (key !== 'create') setEditingOrder(null)
    setTab(key)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => selectTab(t.key)}
            className={`rounded-t-lg px-4 py-2 text-sm transition ${
              tab === t.key
                ? 'border-b-2 border-violet-600 font-semibold text-violet-700'
                : 'text-slate-500 hover:bg-slate-100'
            }`}
          >
            {t.key === 'create' && editingOrder ? '✏️ แก้ไขออร์เดอร์' : t.label}
          </button>
        ))}
      </div>

      {tab === 'create' && (
        <OrderForm
          key={editingOrder?.id ?? 'new'}
          editingOrder={editingOrder}
          onSaved={handleSaved}
          onCancel={editingOrder ? () => selectTab('waiting') : undefined}
        />
      )}
      {tab === 'waiting' && (
        <OrderStatusTab status="รอลงข้อมูล" onEdit={handleEdit} />
      )}
      {tab === 'complete' && (
        <OrderStatusTab
          status="ลงข้อมูลเสร็จสิ้น"
          showChannelSummary
          onEdit={handleEdit}
        />
      )}
      {tab === 'work-orders' && <WorkOrdersTab onEdit={handleEdit} />}
      {tab === 'shipped' && (
        <OrderStatusTab status="จัดส่งแล้ว" onEdit={handleEdit} />
      )}
      {tab === 'cancelled' && (
        <OrderStatusTab status="ยกเลิก" onEdit={handleEdit} />
      )}
    </div>
  )
}
