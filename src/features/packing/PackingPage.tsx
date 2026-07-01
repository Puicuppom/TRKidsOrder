import { useState } from 'react'
import WorkOrderSelection from './WorkOrderSelection'
import PackingMain from './PackingMain'

export default function PackingPage() {
  const [workOrder, setWorkOrder] = useState<string | null>(null)

  if (!workOrder) {
    return <WorkOrderSelection onSelect={setWorkOrder} />
  }
  return (
    <PackingMain workOrderName={workOrder} onBack={() => setWorkOrder(null)} />
  )
}
