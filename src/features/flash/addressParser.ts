// ตัวแยกชื่อ/ที่อยู่/ไปรษณีย์/เบอร์โทร จากข้อความที่อยู่ไทย
// พอร์ตจาก flash_express_tool.html เดิม (logic เดียวกัน)

export function th2ar(s: string): string {
  if (!s) return ''
  const th = '๐๑๒๓๔๕๖๗๘๙'
  return s.replace(/[๐-๙]/g, (ch) => String(th.indexOf(ch)))
}

export function normalizeInline(s: string): string {
  if (!s) return ''
  return th2ar(s)
    .replace(/\r\n?/g, '\n')
    .replace(/[​-‍﻿]/g, '')
    .replace(/[ \t\f\v]+/g, ' ')
    .trim()
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function fuzzyWord(word: string): string {
  return [...word]
    .map((ch) => ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('[\\s\\W_]*')
}

const PHONE_TOKEN_WORDS = ['โทร', 'เบอร์', 'ติดต่อ', 'tel', 'phone', 'mobile', 'mob', 'call']
const PHONE_TOKEN_START_RE = new RegExp(
  `^\\s*(?:${PHONE_TOKEN_WORDS.map(fuzzyWord).join('|')})[\\s\\W_]*`,
  'i',
)
const PHONE_TOKEN_INLINE_RE = new RegExp(
  `(?:${PHONE_TOKEN_WORDS.map(fuzzyWord).join('|')})[\\s\\W_]*`,
  'ig',
)

function phoneFlexRegex(d: string): RegExp {
  const chunk = (digits: string) =>
    digits.split('').map((ch) => ch + '[\\s\\-()]*').join('')
  const local = chunk(d)
  const intl = '\\+?66[\\s\\-()]*' + chunk(d.slice(1))
  return new RegExp(`(?:${intl}|${local})`, 'g')
}

export function findFirstPhoneIndex(text: string): number {
  const s = th2ar(text)
  const re =
    /\+?66[\s\-()]*\d(?:[\s\-()]*\d){7,9}\b|0[\s\-()]*\d(?:[\s\-()]*\d){8}\b/g
  const m = re.exec(s)
  return m ? m.index : -1
}

export function collectPhones(text: string): string[] {
  const s = th2ar(text)
  const found = new Set<string>()
  const re = /(?<!\d)(?:0(?:[\s\-()]*\d){9,10}|\+66(?:[\s\-()]*\d){8,9})(?!\d)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(s))) {
    let raw = m[0]
    if (raw.startsWith('+66')) raw = '0' + raw.slice(3)
    const dN = raw.replace(/\D/g, '')
    if (/^0\d{8,9}$/.test(dN)) {
      found.add(dN)
      if (found.size >= 2) break
    }
  }
  return Array.from(found).slice(0, 2)
}

function stripPhoneTokensResidual(s: string): string {
  return s
    .replace(PHONE_TOKEN_INLINE_RE, ' ')
    .replace(/[ \t]+$/gm, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

export function stripPhonesFromText(text: string, phones: string[]): string {
  if (!phones || !phones.length) return stripPhoneTokensResidual(text)
  let s = text
  for (const d of phones) s = s.replace(phoneFlexRegex(d), ' ')
  return stripPhoneTokensResidual(s)
}

const POSTCODE_TOKENS = [
  'รหัสไปรษณีย์', 'รหัส ปณ.', 'รหัส ปณ', 'ปณ.', 'ปณ', 'ไปรษณีย์',
  'post office', 'postcode', 'zip', 'zipcode', 'zip code',
]
export function findFirstPostcodeIndex(text: string): number {
  const m = /\b\d{5}\b/.exec(th2ar(text))
  return m ? m.index : -1
}
export function stripPostcodeTokens(s: string): string {
  let out = s
  for (const tok of POSTCODE_TOKENS) {
    out = out.replace(new RegExp(escapeRe(tok) + '\\s*:?', 'ig'), ' ')
  }
  return out
}
export function stripSpecificPostcode(out: string, postcode: string): string {
  if (!postcode) return out
  const reTail = new RegExp(`\\b${postcode}\\b(?=\\s*$)`)
  const reAny = new RegExp(`\\b${postcode}\\b(?!.*\\d)`)
  if (reTail.test(out)) return out.replace(reTail, ' ')
  return out.replace(reAny, ' ')
}

const CUE_LITERALS = [
  'ร้าน','ห้าง','ห้างร้าน','ศูนย์การค้า','ห้างสรรพสินค้า','เดอะมอลล์','เซ็นทรัล','โรบินสัน','โลตัส','Tesco','บิ๊กซี','Big C','แม็คโคร','Makro','เทอร์มินอล 21','Terminal 21','Plaza','พลาซ่า','มอลล์','มาร์เก็ต','Market','ตลาด','ไนท์บาซาร์','Bazaar','คอนโด','คอนโดฯ','คอนโดมิเนียม','อาคารชุด','Condo','Condominium','Apartment','อพาร์ตเมนต์','อพาร์ทเม้นท์','Mansion','แมนชั่น','ศาล','หอพัก','รีสอร์ท','Resort','โรงแรม','Hotel','โรงพยาบาล','รพ.','Hospital','คลินิก','Clinic','อาคาร','ตึก','บิสซิเนสเซ็นเตอร์','อาคารพาณิชย์','Office','ออฟฟิศ','ทาวเวอร์','Tower','Building','บิลดิ้ง','ศูนย์ราชการ','Government Complex','ศาลากลาง','โครงการ','หมู่บ้าน','หมู่บ้านจัดสรร','มบ.','หมู่ที่','หมู่','ม.','ชุมชน','ทาวน์โฮม','ทาวน์เฮ้าส์','บ้าน','ห้อง','Room','Unit','ยูนิต','ชั้น','Floor','Fl.','เลขที่','บ้านเลขที่','No.','House No.','บล็อก','บล๊อค','Block','แยก','ถนน','ถ.','Road','Rd.','Rama','พระราม','ศรีนครินทร์','เพชรบุรี','สุขุมวิท','วิภาวดี','งามวงศ์วาน','พหลโยธิน','รัชดา','ราชพฤกษ์','Bangna','บางนา','Sukhumvit','Ratchadaphisek','Ratchada','Srinakarin','ซอย','ซ.','Soi','ตรอก','สะพาน','วงแหวน','ทางด่วน','ด่วน','ดอนเมืองโทลล์เวย์','ด่วนศรีรัช','แขวง','เขต','ตำบล','ต.','อำเภอ','อ.','จังหวัด','จ.','กรุงเทพ','กทม','Bangkok','BKK','Province','District','Subdistrict','โรงเรียน','มหาวิทยาลัย','วิทยาลัย','คณะ','วัด','มัสยิด','โบสถ์','โกดัง','คลังสินค้า','คลัง','Warehouse','โรงงาน','Factory','นิคมอุตสาหกรรม','นิคม','Industrial Estate','สถานี','Station','ท่าเรือ','Pier','Port','สนามบิน','ท่าอากาศยาน','Airport','เทอร์มินอล','Terminal','เอสพลานาด','Esplanade','Fortune','เอ็มควอเทียร์','EmQuartier','เอ็มโพเรียม','Emporium','Iconsiam','ไอคอนสยาม','Siam Paragon','พารากอน','MBK','มาบุญครอง','Union Mall','ยูเนียนมอลล์',
]
const CUE_LITERAL_RES = CUE_LITERALS.map((lit) => new RegExp(escapeRe(lit), 'i'))
const HOUSE_RE = /\b\d{1,5}(?:\s*\/\s*\d{1,5})?\b/

const COMPANY_AS_ADDRESS_RE =
  /^\s*(?:บ\.|บจก\.|บจ\.|หจก\.|ห้างหุ้นส่วน|บริษัท|ร้าน)\s+.+จำกัด\b/i
const PERSON_TITLES_RE =
  /^(หม่อมหลวง|หม่อมราชวงศ์|หม่อมเจ้า|ม\.ล\.|ม\.ร\.ว\.|ม\.จ\.|อาจารย์|อ\.|ดร\.|ศาสตราจารย์|รองศาสตราจารย์|ผู้ช่วยศาสตราจารย์|ศ\.|รศ\.|ผศ\.|ศ\.ดร\.|รศ\.ดร\.|ผศ\.ดร\.|คุณ|นาย|นาง|น\.ส\.|นางสาว|ด\.ช\.|ด\.ญ\.|นพ\.|พญ\.|ทพ\.|ทพญ\.|สพ\.|สพญ\.|พล\.[อทต]\.[อทต]?\.|พ\.[อต]\.[อทต]?\.|ร\.[อต]\.[อทต]?\.|ด\.ต\.|จ\.ส\.[อทต]\.|ส\.[อต]\.[อต]?\.|ว่าที่\s*ร\.ต\.|ร\.อ\.|ร\.ท\.|ร\.ต\.|พ\.อ\.|พ\.ท\.|พ\.ต\.|พันเอก|พันโท|พันตรี|ร้อยเอก|ร้อยโท|ร้อยตรี)(\s*หญิง)?/i
const NAME_PREFIX_TRASH = [
  /^ที่อยู่\s*:?\s*/i, /^address\s*:?\s*/i, /^addr\.?\s*/i, /^add\.?\s*/i,
  /^จัดส่ง\s*:?\s*/i, /^โปรด\s*จัดส่ง\s*/i, /^กรุณา\s*ส่ง\s*/i,
  /^รบกวน\s*ส่ง.*(ที่อยู่|ตามที่อยู่)/i, /^ส่งถึง\s*:?\s*/i, /^ถึง\s*:?\s*/i,
  /^ส่งมาตามที่อยู่\s*/i, /^การจัดส่ง\s*/i, /^โปรด\s*ส่ง\s*/i,
  /^ship\s*to\s*:?\s*/i, /^deliver\s*to\s*:?\s*/i, /^to\s*:?\s*/i,
]

function looksLikePersonName(s: string): boolean {
  if (!s) return false
  if (COMPANY_AS_ADDRESS_RE.test(s)) return false
  if (PERSON_TITLES_RE.test(s)) return true
  if (/\d/.test(s)) return /^[ก-๛A-Za-z .'\-]+$/.test(s.split(/\s+\d/)[0] || '')
  return s.split(/\s+/).length <= 6
}

function cutAtFirstCue(line: string): string {
  if (!line) return ''
  const rankM = line.match(PERSON_TITLES_RE)
  const safeZone = rankM ? rankM[0].length : 0
  let idx = -1
  for (const re of CUE_LITERAL_RES) {
    const m = re.exec(line)
    if (m && m.index >= safeZone)
      idx = idx === -1 ? m.index : Math.min(idx, m.index)
  }
  const mHouse = line.match(HOUSE_RE)
  if (mHouse && mHouse.index! >= safeZone)
    idx = idx === -1 ? mHouse.index! : Math.min(idx, mHouse.index!)
  return idx > -1 ? line.slice(0, idx).trim() : line.trim()
}

function cleanName(n: string): string {
  let s = n || ''
  for (const re of NAME_PREFIX_TRASH) s = s.replace(re, '')
  const phones = collectPhones(s)
  for (const p of phones) s = s.replace(phoneFlexRegex(p), ' ')
  s = s
    .replace(
      new RegExp(
        `(?:${PHONE_TOKEN_WORDS.map(fuzzyWord).join('|')})[\\s\\W_]*.*$`,
        'i',
      ),
      '',
    )
    .replace(/[ ,;:|\-]+$/, '')
    .trim()
  return cutAtFirstCue(s)
}

export interface ParsedAddress {
  name: string
  address: string
  postcode: string
}

export function extractNameAndAddressSmart(text: string): ParsedAddress {
  const s = normalizeInline(text)
  let lines = s.split('\n').map((t) => t.trim()).filter(Boolean)
  if (!lines.length) return { name: '', address: '', postcode: '' }

  while (lines.length && cleanName(lines[0]) === '') lines.shift()
  if (!lines.length) return { name: '', address: '', postcode: '' }

  const first = lines[0]
  let name = ''
  let addrStart = 0
  const rankM = first.match(PERSON_TITLES_RE)
  const safeZone = rankM ? rankM[0].length : 0

  let splitIdx = -1
  CUE_LITERAL_RES.forEach((re) => {
    const m = re.exec(first)
    if (m && m.index >= safeZone)
      splitIdx = splitIdx === -1 ? m.index : Math.min(splitIdx, m.index)
  })
  const mHouse = first.match(HOUSE_RE)
  if (mHouse && mHouse.index! >= safeZone)
    splitIdx = splitIdx === -1 ? mHouse.index! : Math.min(splitIdx, mHouse.index!)

  if (splitIdx > 0) {
    name = cleanName(first.slice(0, splitIdx))
    lines[0] = first.slice(splitIdx).trim()
    addrStart = 0
  } else if (looksLikePersonName(first)) {
    name = cleanName(first)
    addrStart = 1
  }

  const isPhoneOnlyLine = (t: string) => {
    const st = th2ar(t)
    const hasPhone =
      /\+?66[\s\-()]*\d(?:[\s\-()]*\d){7,9}\b|0[\s\-()]*\d(?:[\s\-()]*\d){8}\b/.test(
        st,
      )
    const noRealWords =
      st.replace(/[0-9+\s\-()]/g, '').trim() === '' ||
      PHONE_TOKEN_START_RE.test(st)
    return hasPhone && noRealWords
  }

  const addrLines = lines.slice(addrStart)
  while (addrLines.length && isPhoneOnlyLine(addrLines[0])) addrLines.shift()

  let address = addrLines.join('\n')
  const phones = collectPhones(s)
  const pIdx = findFirstPhoneIndex(address)
  const pcIdx = findFirstPostcodeIndex(address)
  let end = address.length
  if (pIdx >= 0) end = Math.min(end, pIdx)
  if (pcIdx >= 0) end = Math.min(end, pcIdx)
  address = address.slice(0, end)

  address = stripPhonesFromText(address, phones)
  const all5 = [...th2ar(s).matchAll(/\b(\d{5})\b/g)]
  const postcode = all5.length ? all5[all5.length - 1][1] : ''

  address = stripPostcodeTokens(address)
  address = stripSpecificPostcode(address, postcode)
  address = address
    .replace(/[ ,;:|\-]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return { name, address, postcode }
}
