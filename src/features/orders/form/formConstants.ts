import type { Product } from '../../../types/db'

export const standardFonts = [
  'F01',
  'F03',
  'F04',
  'F12',
  'F14',
  'TH01',
  'TH02',
  'TH03',
]
export const wyFonts = [
  'fontA',
  'fontB',
  'fontC',
  'fontD',
  'fontE',
  'fontF',
  'fontG',
  'fontH',
]

export const shelfOptions = ['1', '2', '3', '4', '5']

// WY = ช่องทาง WY หรือ CLAIM ที่เลขบิลมี 'WY'
export function isWyContext(channelCode: string, billNo = ''): boolean {
  return (
    channelCode === 'WY' ||
    (channelCode === 'CLAIM' && billNo.includes('WY'))
  )
}

export function getFontsForChannel(channelCode: string, billNo = ''): string[] {
  return isWyContext(channelCode, billNo) ? wyFonts : standardFonts
}

// สินค้าที่เลือกได้ตามช่องทาง: WY→รหัสขึ้นต้น 22 / อื่นๆ→ไม่ขึ้นต้น 22
export function getFilteredProducts(
  products: Product[],
  channelCode: string,
  billNo = '',
): Product[] {
  const wy = isWyContext(channelCode, billNo)
  return products
    .filter((p) => p.is_active !== false && p.product_type === 'FINISHPRODUCT')
    .filter((p) => {
      const code = String(p.product_code || '')
      return wy ? code.startsWith('22') : !code.startsWith('22')
    })
}

export function categoryOf(
  products: Product[],
  productId: number | null,
): string {
  if (!productId) return ''
  const p = products.find((x) => x.id === productId)
  return (p?.product_category || '').trim().toUpperCase()
}
