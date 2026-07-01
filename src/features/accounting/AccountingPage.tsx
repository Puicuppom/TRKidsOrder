import { useState } from 'react'
import AccountingReport from './AccountingReport'
import Reconciliation from './Reconciliation'

export default function AccountingPage() {
  const [tab, setTab] = useState<'report' | 'reconcile'>('report')
  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-slate-200">
        <button
          onClick={() => setTab('report')}
          className={`rounded-t-lg px-4 py-2 text-sm ${
            tab === 'report'
              ? 'border-b-2 border-violet-600 font-semibold text-violet-700'
              : 'text-slate-500 hover:bg-slate-100'
          }`}
        >
          💰 สรุปยอด/บัญชี
        </button>
        <button
          onClick={() => setTab('reconcile')}
          className={`rounded-t-lg px-4 py-2 text-sm ${
            tab === 'reconcile'
              ? 'border-b-2 border-violet-600 font-semibold text-violet-700'
              : 'text-slate-500 hover:bg-slate-100'
          }`}
        >
          🏦 กระทบยอดธนาคาร
        </button>
      </div>
      {tab === 'report' ? <AccountingReport /> : <Reconciliation />}
    </div>
  )
}
