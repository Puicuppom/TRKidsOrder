export interface PackItem {
  tracking_number: string
  customer_name: string | null
  order_id: number
  product_name: string
  image_url: string | null
  details: string
  ink_color: string | null
  notes: string | null
  shelf_location: string | null
  cartoon_pattern: string | null
  line_pattern: string | null
  font: string | null
  item_uid: string
  scanned: boolean
  parcelScanned: boolean
  isOrderComplete: boolean
  needsTaxInvoice: boolean
  needsCashBill: boolean
  claim_type: string | null
  claim_details: string | null
  file_attachment: string | null
}

export type PackGroup = PackItem[]
