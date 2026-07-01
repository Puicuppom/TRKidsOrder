import type { Order, Product } from '../../types/db'

export interface PickItem {
  woName: string
  code: string
  name: string
  location: string
  category: string
  dept: string
  qty: number
  finalQty: number
}

export interface SpareItem {
  name: string
  qty: number
}

interface EnrichedItem {
  product_id: number
  product_name: string
  product_code: string
  product_category: string
  storage_location: string
  rubber_code: string | null
}

function deptOf(cat: string, name: string): string {
  if (cat.includes('STAMP')) return 'แผนก Stamp'
  if (cat.includes('LASER')) return 'แผนก Laser'
  if (cat.includes('UV') || cat.includes('SUBLIMATION') || name === 'RLC ไม้บรรทัดใส 18cm')
    return 'แผนก CTT'
  return 'แผนกทั่วไป'
}

function aggregate(items: EnrichedItem[], woName: string): PickItem[] {
  const map: Record<number, PickItem> = {}
  for (const it of items) {
    const cat = (it.product_category || '').toUpperCase()
    const name = (it.product_name || '').trim()
    if (!map[it.product_id]) {
      map[it.product_id] = {
        woName,
        code: it.product_code || 'N/A',
        name: it.product_name,
        location: it.storage_location || 'N/A',
        category: cat,
        dept: deptOf(cat, name),
        qty: 0,
        finalQty: 0,
      }
    }
    map[it.product_id].qty += 1
  }
  return Object.values(map).map((it) => ({
    ...it,
    finalQty: it.category.includes('CONDO STAMP')
      ? Math.ceil(it.qty / 5)
      : it.qty,
  }))
}

export interface PickingData {
  workOrderName: string
  deptGroups: Record<string, PickItem[]>
  sortedDepts: string[]
  spareList: SpareItem[]
  fullCsvList: PickItem[]
}

export function buildPickingData(
  workOrderName: string,
  bills: Order[],
  products: Product[],
): PickingData | null {
  const enriched: EnrichedItem[] = []
  for (const order of bills) {
    if (order.work_order_name !== workOrderName) continue
    for (const item of order.order_items || []) {
      const p = products.find((x) => x.id === item.product_id)
      enriched.push({
        product_id: item.product_id,
        product_name: item.product_name,
        product_code: p?.product_code || 'N/A',
        product_category: p?.product_category || '',
        storage_location: p?.storage_location || 'N/A',
        rubber_code: p?.rubber_code || null,
      })
    }
  }
  if (enriched.length === 0) return null

  // รายการสำหรับแสดง/พิมพ์ — ตัด UV/STK/TUBE (ยกเว้นไม้บรรทัด RLC)
  const excluded = ['UV', 'STK', 'TUBE']
  const display = enriched.filter((it) => {
    const cat = (it.product_category || '').toUpperCase()
    if ((it.product_name || '').trim() === 'RLC ไม้บรรทัดใส 18cm') return true
    return !excluded.some((ex) => cat.includes(ex))
  })

  const displayList = aggregate(display, workOrderName)
  const fullCsvList = aggregate(enriched, workOrderName)

  const deptGroups: Record<string, PickItem[]> = {}
  for (const it of displayList) {
    ;(deptGroups[it.dept] ||= []).push(it)
  }
  const sortedDepts = Object.keys(deptGroups).sort()
  for (const d of sortedDepts)
    deptGroups[d].sort((a, b) => a.location.localeCompare(b.location))

  // อะไหล่
  const spareMap: Record<string, SpareItem> = {}
  for (const it of enriched) {
    if (it.rubber_code) {
      if (!spareMap[it.rubber_code])
        spareMap[it.rubber_code] = { name: ` ${it.rubber_code}`, qty: 0 }
      spareMap[it.rubber_code].qty += 1
    }
  }

  return {
    workOrderName,
    deptGroups,
    sortedDepts,
    spareList: Object.values(spareMap),
    fullCsvList,
  }
}
