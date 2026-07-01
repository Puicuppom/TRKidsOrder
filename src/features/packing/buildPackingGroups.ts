import type { Order, Product, CartoonPattern } from '../../types/db'
import type { PackItem, PackGroup } from './packingTypes'

// เรียงแบบธรรมชาติ (1,2,10 แทน 1,10,2)
export function naturalSortCompare(a: string, b: string): number {
  const re = /(\d+)/g
  const ap = String(a).split(re)
  const bp = String(b).split(re)
  for (let i = 0; i < Math.min(ap.length, bp.length); i++) {
    if (i % 2 === 1) {
      const na = parseInt(ap[i], 10)
      const nb = parseInt(bp[i], 10)
      if (na !== nb) return na - nb
    } else if (ap[i] !== bp[i]) return ap[i].localeCompare(bp[i])
  }
  return ap.length - bp.length
}

// แปลงออร์เดอร์ (ที่มีเลขพัสดุ) เป็นกลุ่มตามเลขพัสดุ พร้อมหารูปสินค้า/ลาย
export function buildPackingGroups(
  orders: Order[],
  products: Product[],
  patterns: CartoonPattern[],
): PackGroup[] {
  const flat: PackItem[] = []

  for (const order of orders) {
    const isShipped = order.status === 'จัดส่งแล้ว'
    const parcelScanned = order.packing_meta?.parcelScanned ?? false
    for (const item of order.order_items || []) {
      const productInfo = products.find((p) => p.id === item.product_id)
      let imageUrl = productInfo?.image_url ?? null

      // ลายการ์ตูน override รูป
      const findPatternImg = (name: string | null) => {
        if (!name) return null
        const key = String(name).trim().toLowerCase()
        const found = patterns.find(
          (p) => String(p.pattern_name).trim().toLowerCase() === key,
        )
        return found?.image_url ?? null
      }
      const cImg = findPatternImg(item.cartoon_pattern)
      if (cImg) imageUrl = cImg
      const lImg = findPatternImg(item.line_pattern)
      if (lImg) imageUrl = lImg

      flat.push({
        tracking_number: order.tracking_number!,
        customer_name: order.customer_name,
        order_id: order.id,
        product_name: item.product_name,
        image_url: imageUrl,
        details: [item.line_1, item.line_2, item.line_3]
          .filter(Boolean)
          .join(' // '),
        ink_color: item.ink_color,
        notes: item.notes,
        shelf_location: item.product_type,
        cartoon_pattern: item.cartoon_pattern,
        line_pattern: item.line_pattern,
        font: item.font,
        item_uid: item.item_uid,
        scanned: item.packing_status === 'สแกนแล้ว',
        parcelScanned,
        isOrderComplete: isShipped,
        needsTaxInvoice: order.billing_details?.request_tax_invoice ?? false,
        needsCashBill: order.billing_details?.request_cash_bill ?? false,
        claim_type: order.claim_type ?? null,
        claim_details: order.claim_details ?? null,
        file_attachment: item.file_attachment,
      })
    }
  }

  // จัดกลุ่มตามเลขพัสดุ (รักษาลำดับที่พบ)
  const grouped: Record<string, PackItem[]> = {}
  const order: string[] = []
  for (const it of flat) {
    if (!grouped[it.tracking_number]) {
      grouped[it.tracking_number] = []
      order.push(it.tracking_number)
    }
    grouped[it.tracking_number].push(it)
  }
  return order.map((t) => grouped[t])
}
