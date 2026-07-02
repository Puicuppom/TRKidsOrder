import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import RequireAuth from './features/auth/RequireAuth'
import AppLayout from './components/AppLayout'

// โหลดแต่ละหน้าแบบ lazy → หน้าแรกเบา ไลบรารีหนัก (pdf.js/xlsx/OCR) โหลดเฉพาะตอนใช้
const OrdersPage = lazy(() => import('./features/orders/OrdersPage'))
const PackingPage = lazy(() => import('./features/packing/PackingPage'))
const ProductsPage = lazy(() => import('./features/products/ProductsPage'))
const PatternsPage = lazy(() => import('./features/patterns/PatternsPage'))
const PlannerPage = lazy(() => import('./features/planner/PlannerPage'))
const PlanPage = lazy(() => import('./features/plan/PlanPage'))
const ReportsPage = lazy(() => import('./features/reports/ReportsPage'))
const TransportPage = lazy(() => import('./features/transport/TransportPage'))
const AccountingPage = lazy(() => import('./features/accounting/AccountingPage'))

function Loading() {
  return (
    <div className="flex items-center justify-center p-10 text-slate-400">
      กำลังโหลด...
    </div>
  )
}

export default function App() {
  return (
    <RequireAuth>
      <Routes>
        <Route element={<AppLayout />}>
          <Route
            index
            element={
              <Suspense fallback={<Loading />}>
                <OrdersPage />
              </Suspense>
            }
          />
          <Route
            path="packing"
            element={
              <Suspense fallback={<Loading />}>
                <PackingPage />
              </Suspense>
            }
          />
          <Route
            path="products"
            element={
              <Suspense fallback={<Loading />}>
                <ProductsPage />
              </Suspense>
            }
          />
          <Route
            path="patterns"
            element={
              <Suspense fallback={<Loading />}>
                <PatternsPage />
              </Suspense>
            }
          />
          <Route
            path="planner"
            element={
              <Suspense fallback={<Loading />}>
                <PlannerPage />
              </Suspense>
            }
          />
          <Route
            path="plan"
            element={
              <Suspense fallback={<Loading />}>
                <PlanPage />
              </Suspense>
            }
          />
          <Route
            path="reports"
            element={
              <Suspense fallback={<Loading />}>
                <ReportsPage />
              </Suspense>
            }
          />
          <Route
            path="transport"
            element={
              <Suspense fallback={<Loading />}>
                <TransportPage />
              </Suspense>
            }
          />
          <Route
            path="accounting"
            element={
              <Suspense fallback={<Loading />}>
                <AccountingPage />
              </Suspense>
            }
          />
        </Route>
      </Routes>
    </RequireAuth>
  )
}
