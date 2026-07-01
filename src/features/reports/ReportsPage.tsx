import { useState } from 'react'
import SalesReport from './SalesReport'
import ClaimReport from './ClaimReport'

export default function ReportsPage() {
  const [tab, setTab] = useState<'sales' | 'claim'>('sales')
  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-slate-200">
        <button
          onClick={() => setTab('sales')}
          className={`rounded-t-lg px-4 py-2 text-sm ${
            tab === 'sales'
              ? 'border-b-2 border-violet-600 font-semibold text-violet-700'
              : 'text-slate-500 hover:bg-slate-100'
          }`}
        >
          📈 รายงานยอดขาย
        </button>
        <button
          onClick={() => setTab('claim')}
          className={`rounded-t-lg px-4 py-2 text-sm ${
            tab === 'claim'
              ? 'border-b-2 border-violet-600 font-semibold text-violet-700'
              : 'text-slate-500 hover:bg-slate-100'
          }`}
        >
          🚩 รายงานเคลม
        </button>
      </div>
      {tab === 'sales' ? <SalesReport /> : <ClaimReport />}
    </div>
  )
}
