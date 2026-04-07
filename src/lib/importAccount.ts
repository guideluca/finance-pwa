import type { ParserId } from '@/parsers/types'

/** Rótulo mostrado em análises; preenchido no import conforme parser e ficheiro. */
export function accountLabelFromImport(parserId: ParserId, filename: string): string {
  const lower = filename.toLowerCase()
  if (
    parserId === 'nubank_extrato_v1' ||
    parserId === 'csv_nubank_v1' ||
    /^nu[_-]/i.test(filename)
  ) {
    return 'Nubank'
  }
  if (parserId === 'itau_extrato_v1' || /itau|itaú/.test(lower)) {
    return 'Itaú'
  }
  if (parserId === 'csv_brazil_v1') {
    return 'CSV (genérico)'
  }
  return 'Outro'
}
