import { supabase } from './supabase'

const BUCKET = 'product-images'

// อัปโหลดรูปไป Supabase Storage แล้วคืน public URL
export async function uploadImage(file: File, path: string): Promise<string> {
  const { error } = await supabase.storage.from(BUCKET).upload(path, file)
  if (error) throw error
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return data.publicUrl
}

export function productImagePath(productCode: string, file: File): string {
  const ext = file.name.split('.').pop()
  return `products/${productCode}-${Date.now()}.${ext}`
}

export function patternImagePath(file: File): string {
  return `patterns/${Date.now()}_${file.name}`
}
