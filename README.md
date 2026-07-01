# ระบบจัดการออร์เดอร์ (Order App)

เว็บแอปจัดการออร์เดอร์หลังบ้าน — เขียนใหม่จากไฟล์ HTML เดี่ยว 3 ไฟล์ เป็นโปรเจค React ที่จัดการง่าย

## Stack

- **Vite + React + TypeScript** — โครงโปรเจคและ build
- **Supabase** — ฐานข้อมูล + auth + storage (ใช้โปรเจคเดิม)
- **TanStack Query** — cache ข้อมูล ลดการยิงซ้ำไป Supabase
- **React Router** — แยกหน้า (lazy-loaded ทุกหน้า)
- **Tailwind CSS v4** — จัดสไตล์
- ไลบรารีเฉพาะทาง: xlsx, html2canvas, pdfjs-dist, @zxing/library, tesseract.js, pdf-lib (โหลดเฉพาะตอนใช้)

## เริ่มใช้งาน

```bash
npm install        # ติดตั้งครั้งแรก
npm run dev        # รัน dev server (http://localhost:5173)
npm run build      # build ขึ้นจริง → โฟลเดอร์ dist/
npm run preview    # ลองดูผล build
```

## ค่า config (.env.local)

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

> anon key เปิดเผยฝั่ง browser ได้ตามการออกแบบ — ความปลอดภัยจริงอยู่ที่ Row Level Security (RLS)
> ซึ่งเปิด + ตั้ง policy ไว้แล้ว. อัปโหลดรูปสินค้า/ลายใช้ Supabase Storage bucket `product-images`
> (ต้องตั้ง policy ให้ผู้ใช้ที่ login อัปโหลด/อ่านได้)

## Deploy

build เป็น static site (โฟลเดอร์ `dist/`) โฮสต์ที่ไหนก็ได้ — ต้องตั้ง **SPA fallback** (ทุก path → index.html)
เพราะใช้ client-side routing:

- **Netlify / Cloudflare Pages**: ใช้ไฟล์ `public/_redirects` (มีให้แล้ว) — build command `npm run build`, publish dir `dist`
- **Vercel**: ใช้ไฟล์ `vercel.json` (มีให้แล้ว)
- อย่าลืมตั้ง env `VITE_SUPABASE_URL` และ `VITE_SUPABASE_ANON_KEY` ในหน้า settings ของโฮสต์

## โครงสร้างไฟล์

```
src/
├─ lib/            supabase client, storage, beep, constants
├─ hooks/          TanStack Query hooks (useOrders, useMetadata)
├─ types/db.ts     โมเดลข้อมูลทั้งหมด
├─ components/     layout, SearchSelect ฯลฯ
├─ features/
│  ├─ auth/        login + session/role
│  ├─ orders/      ออร์เดอร์ (แท็บ, ฟอร์ม, ใบงาน, export/import)
│  ├─ packing/     แพ็ค/สแกน
│  ├─ products/    สินค้า
│  ├─ patterns/    ลายการ์ตูน
│  ├─ planner/     วางแผนผลิต (realtime)
│  ├─ reports/     รายงานยอดขาย/เคลม
│  ├─ transport/   ขนส่ง (ทวนสอบพัสดุ)
│  ├─ accounting/  บัญชี + กระทบยอดธนาคาร
│  └─ flash/       Flash ใบปะหน้า (แยกที่อยู่ไทย)
├─ App.tsx         routes (lazy)
└─ main.tsx        providers (Query, Router, Auth)
```

## สถานะการย้าย (migration) — เสร็จครบทุกโมดูลแล้ว ✅

ย้ายครบทั้ง `index.html` (7,156 บรรทัด) + `accounting.html` + `flash_express_tool.html`
มาเป็นโปรเจค React นี้ทั้งหมด ไฟล์ HTML เดิมเก็บไว้ที่ `../` (เลิกใช้ได้)
