import type { ParserId } from '@/parsers/types'

export function detectParser(filename: string, textHead: string): ParserId | null {
  const lower = filename.toLowerCase()
  if (/^nu[_-]/i.test(filename) || /nubank/i.test(textHead.slice(0, 800))) {
    return 'nubank_extrato_v1'
  }
  if (/itau|itaú/i.test(lower) || /banco itaú/i.test(textHead.slice(0, 2000))) {
    return 'itau_extrato_v1'
  }
  if (lower.endsWith('.csv')) {
    return 'csv_brazil_v1'
  }
  return null
}
