import type { ParserId } from '@/parsers/types'

export function detectParser(filename: string, textHead: string): ParserId | null {
  const lower = filename.toLowerCase()
  const head = textHead.slice(0, 4000)
  if (
    /controle\s+de\s+gastos/i.test(lower) ||
    (/controle\s+de\s+gastos/i.test(head) && /histórico|historico/i.test(head) && /mês\/ano|mes\/ano/i.test(head))
  ) {
    return 'controle_gastos_pdf_v1'
  }
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
