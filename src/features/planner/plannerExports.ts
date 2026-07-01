import { supabase } from '../../lib/supabase'
import type { Product, PlanJob } from '../../types/db'

function downloadCsv(filename: string, rows: string[]) {
  const blob = new Blob(['﻿' + rows.join('\n')], {
    type: 'text/csv;charset=utf-8;',
  })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = filename
  link.click()
}

async function fetchItemsByWorkOrders(
  woNames: string[],
): Promise<{ orderToWo: Record<number, string>; items: { order_id: number; product_id: number; product_name: string }[] }> {
  const { data: orders, error: oErr } = await supabase
    .from('orders')
    .select('id, work_order_name')
    .in('work_order_name', woNames)
  if (oErr) throw oErr
  const orderToWo: Record<number, string> = {}
  ;(orders ?? []).forEach((o) => (orderToWo[o.id] = o.work_order_name))
  const ids = (orders ?? []).map((o) => o.id)
  if (ids.length === 0) return { orderToWo, items: [] }

  const items: { order_id: number; product_id: number; product_name: string }[] = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('order_items')
      .select('order_id, product_id, product_name')
      .in('order_id', ids)
      .range(from, from + 999)
    if (error) throw error
    items.push(...(data as typeof items))
    if (!data || data.length < 1000) break
    from += 1000
  }
  return { orderToWo, items }
}

// CSV เบิกของใบงานเดียว
export async function exportPickingCsv(woName: string, products: Product[]) {
  const { items } = await fetchItemsByWorkOrders([woName])
  if (items.length === 0) throw new Error('ไม่พบข้อมูลออร์เดอร์ในใบงานนี้')
  const map: Record<number, { code: string; name: string; loc: string; cat: string; qty: number }> = {}
  for (const it of items) {
    if (!map[it.product_id]) {
      const p = products.find((x) => x.id === it.product_id)
      map[it.product_id] = {
        code: p?.product_code ?? 'N/A',
        name: it.product_name,
        loc: p?.storage_location ?? 'N/A',
        cat: (p?.product_category ?? '').toUpperCase(),
        qty: 0,
      }
    }
    map[it.product_id].qty++
  }
  const rows = ['รหัสทำรายการ,รหัสสินค้า,รายการสินค้า,จุดเก็บ,จำนวนเบิก']
  Object.values(map)
    .sort((a, b) => a.loc.localeCompare(b.loc))
    .forEach((i) => {
      const qty = i.cat.includes('CONDO STAMP') ? Math.ceil(i.qty / 5) : i.qty
      rows.push(
        [`"${woName}"`, `"${i.code}"`, `"${i.name.replace(/"/g, '""')}"`, `"${i.loc}"`, qty].join(','),
      )
    })
  downloadCsv(`เบิกสินค้า_${woName}.csv`, rows)
}

// CSV สรุปเบิกรายวัน เรียงตามเวลาตัดรอบ
export async function exportDailySummaryCsv(
  date: string,
  jobs: PlanJob[],
  products: Product[],
) {
  const daily = jobs.filter((j) => j.date === date)
  if (daily.length === 0) throw new Error('ไม่พบใบงานในวันที่เลือก')
  const cutLookup: Record<string, string> = {}
  daily.forEach((j) => (cutLookup[j.name] = j.cut || '00:00'))
  const woNames = daily.map((j) => j.name)

  const { orderToWo, items } = await fetchItemsByWorkOrders(woNames)
  const map: Record<string, { woName: string; cutTime: string; code: string; name: string; loc: string; cat: string; qty: number }> = {}
  for (const it of items) {
    const woName = orderToWo[it.order_id]
    const key = `${woName}_${it.product_id}`
    if (!map[key]) {
      const p = products.find((x) => x.id === it.product_id)
      map[key] = {
        woName,
        cutTime: cutLookup[woName] || '00:00',
        code: p?.product_code ?? 'N/A',
        name: it.product_name,
        loc: p?.storage_location ?? 'N/A',
        cat: (p?.product_category ?? '').toUpperCase(),
        qty: 0,
      }
    }
    map[key].qty++
  }
  const rows = ['เวลาตัด,รหัสทำรายการ,รหัสสินค้า,รายการสินค้า,จุดเก็บ,จำนวนเบิก']
  Object.values(map)
    .sort(
      (a, b) =>
        a.cutTime.localeCompare(b.cutTime) ||
        a.woName.localeCompare(b.woName) ||
        a.loc.localeCompare(b.loc),
    )
    .forEach((i) => {
      const qty = i.cat.includes('CONDO STAMP') ? Math.ceil(i.qty / 5) : i.qty
      rows.push(
        [`"${i.cutTime}"`, `"${i.woName}"`, `"${i.code}"`, `"${i.name.replace(/"/g, '""')}"`, `"${i.loc}"`, qty].join(','),
      )
    })
  downloadCsv(`สรุปเบิกสินค้า_เรียงตามเวลาตัดรอบ_${date}.csv`, rows)
}
