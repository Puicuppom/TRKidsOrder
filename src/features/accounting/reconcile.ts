import { supabase } from '../../lib/supabase'
import type { Channel, BankStatement } from '../../types/db'

export function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (const char of line.trim()) {
    if (char === '"') {
      inQuotes = !inQuotes
      continue
    }
    if (char === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else current += char
  }
  result.push(current.trim())
  return result
}

// นำเข้าไฟล์ statement CSV ของธนาคาร (เข้ารหัส TIS-620/windows-874)
export async function importBankCsv(
  file: File,
  channels: Channel[],
): Promise<{ inserted: number; account: string }> {
  const buf = await file.arrayBuffer()
  const text = new TextDecoder('windows-874').decode(buf)
  const lines = text.split('\n').filter((l) => l.trim() !== '')

  // 1) เลขบัญชีดิบ
  let rawAccount = ''
  for (const line of lines) {
    if (line.includes('เลขที่บัญชีเงินฝาก')) {
      const cols = parseCSVLine(line)
      rawAccount = cols.find((c) => /\d+-\d+-\d+-\d+/.test(c)) || ''
      break
    }
  }
  // 2) ชื่อบัญชีเต็มจาก channels
  let fullAccount = rawAccount
  for (const ch of channels) {
    if (ch.bank_account && rawAccount && ch.bank_account.includes(rawAccount)) {
      fullAccount = ch.bank_account
      break
    }
  }

  const headerIdx = lines.findIndex((l) => l.includes('วันที่') && l.includes('รายการ'))
  if (headerIdx === -1) throw new Error('ไม่พบหัวตารางในไฟล์ CSV')

  const newStatements: Omit<BankStatement, 'id'>[] = []
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i])
    if (cols.length < 7) continue
    const deposit = parseFloat((cols[6] || '0').replace(/,/g, '')) || 0
    if (deposit <= 0) continue

    const datePart = cols[1].replace(/[/.]/g, '-')
    const dm = datePart.split('-')
    const statement_date = `${dm[2].length === 2 ? '20' + dm[2] : dm[2]}-${dm[1].padStart(2, '0')}-${dm[0].padStart(2, '0')}`
    const statement_time = (cols[2] || '00:00') + ':00'
    const description = cols[3] || ''
    const balance = parseFloat((cols[8] || '0').replace(/,/g, '')) || 0
    const rawHash = `${statement_date}${statement_time}${deposit}${balance}${description}`
    const unique_hash = btoa(unescape(encodeURIComponent(rawHash)))

    newStatements.push({
      statement_date,
      statement_time,
      description,
      deposit_amount: deposit,
      balance,
      channel: cols[10] || '',
      details: cols[12] || '',
      withdrawal_amount: 0,
      is_matched: false,
      unique_hash,
      bank_account: fullAccount,
    })
  }

  // กันซ้ำด้วย unique_hash
  const hashes = newStatements.map((s) => s.unique_hash!)
  const { data: existing } = await supabase
    .from('bank_statements')
    .select('unique_hash')
    .in('unique_hash', hashes)
  const existSet = new Set((existing ?? []).map((r) => r.unique_hash))
  const toInsert = newStatements.filter((s) => !existSet.has(s.unique_hash!))

  if (toInsert.length > 0) {
    const { error } = await supabase.from('bank_statements').insert(toInsert)
    if (error) throw error
  }
  return { inserted: toInsert.length, account: fullAccount }
}

// จับคู่อัตโนมัติ: วันที่ + เวลา(HH:mm) + ยอดเงิน
export async function autoMatch(selectedChannels: string[]): Promise<number> {
  const { data: unmatched, error } = await supabase
    .from('bank_statements')
    .select('*')
    .eq('is_matched', false)
  if (error) throw error
  if (!unmatched || unmatched.length === 0)
    throw new Error('ไม่มีรายการ Statement ที่ค้างการจับคู่')

  const dates = unmatched.map((s) => new Date(s.statement_date).getTime())
  const minDate = new Date(Math.min(...dates)).toISOString().split('T')[0]
  const maxDate = new Date(Math.max(...dates)).toISOString().split('T')[0]

  const { data: orders, error: oErr } = await supabase
    .from('orders')
    .select('bill_no, payment_date, payment_time, total_amount, channel_code, payment_details')
    .gte('payment_date', minDate)
    .lte('payment_date', maxDate)
    .in('channel_code', selectedChannels)
    .neq('status', 'ยกเลิก')
  if (oErr) throw oErr

  let matchCount = 0
  for (const stmt of unmatched as BankStatement[]) {
    const stmtTime = stmt.statement_time.substring(0, 5)
    const stmtAmount = Number(stmt.deposit_amount).toFixed(2)

    const matched = (orders ?? []).find((order) => {
      const details = (order.payment_details as { amount: number; date: string; time: string }[]) || []
      if (Array.isArray(details) && details.length > 0) {
        return details.some(
          (p) =>
            p.date === stmt.statement_date &&
            (p.time ? p.time.substring(0, 5) : '') === stmtTime &&
            Number(p.amount).toFixed(2) === stmtAmount,
        )
      }
      const orderTime = order.payment_time ? order.payment_time.substring(0, 5) : ''
      return (
        order.payment_date === stmt.statement_date &&
        orderTime === stmtTime &&
        Number(order.total_amount).toFixed(2) === stmtAmount
      )
    })

    if (matched) {
      const { error: upErr } = await supabase
        .from('bank_statements')
        .update({ bill_no: matched.bill_no, is_matched: true })
        .eq('id', stmt.id)
      if (!upErr) matchCount++
    }
  }
  return matchCount
}
