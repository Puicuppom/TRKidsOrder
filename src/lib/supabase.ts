import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error(
    'ไม่พบค่า VITE_SUPABASE_URL หรือ VITE_SUPABASE_ANON_KEY — ตรวจสอบไฟล์ .env.local',
  )
}

// สร้าง client ที่เดียวสำหรับทั้งแอป
export const supabase = createClient(url, anonKey)
