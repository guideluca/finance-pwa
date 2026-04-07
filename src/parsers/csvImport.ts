import { parseAmountToCentsForCsv, parseBrazilianDate } from '@/lib/currency'
import Papa from 'papaparse'
import type { ParseResult } from '@/parsers/types'

export type CsvProfileId = 'generic_br' | 'nubank_csv'

export interface CsvProfile {
  id: CsvProfileId
  label: string
  delimiter: string
  dateColumn: string
  descriptionColumn: string
  amountColumn: string
  kindColumn?: string
  creditValue?: string
}

export const CSV_PROFILES: CsvProfile[] = [
  {
    id: 'generic_br',
    label: 'Genérico BR (data;descrição;valor)',
    delimiter: ';',
    dateColumn: 'data',
    descriptionColumn: 'descricao',
    amountColumn: 'valor',
    kindColumn: 'tipo',
    creditValue: 'C',
  },
  /** Exportação CSV do Nubank / planilha: Data, Valor (-75.98), Identificador, Descrição — vírgula */
  {
    id: 'nubank_csv',
    label: 'Nubank — CSV (Data, Valor, Descrição)',
    delimiter: ',',
    dateColumn: 'data',
    descriptionColumn: 'descricao',
    amountColumn: 'valor',
  },
]

let idSeq = 0
function nextId() {
  idSeq += 1
  return `csv-${idSeq}`
}

function normKey(s: string) {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
}

function rowMap(headers: string[], row: string[]) {
  const m = new Map<string, string>()
  headers.forEach((h, i) => {
    m.set(normKey(h), (row[i] ?? '').trim())
  })
  return m
}

export function parseCsvBrazil(content: string, profile: CsvProfile): ParseResult {
  idSeq = 0
  const warnings: string[] = []
  const parsed = Papa.parse<string[]>(content, {
    delimiter: profile.delimiter,
    skipEmptyLines: true,
  })
  if (parsed.errors.length) {
    warnings.push(...parsed.errors.map((e) => e.message))
  }
  const rows = parsed.data
  if (rows.length < 2) {
    return { drafts: [], warnings: [...warnings, 'CSV vazio ou sem cabeçalho.'] }
  }
  const headerList = rows[0]
  const drafts: ParseResult['drafts'] = []

  for (let i = 1; i < rows.length; i++) {
    const r = rowMap(headerList, rows[i])
    const dRaw =
      r.get(normKey(profile.dateColumn)) ?? r.get('data') ?? ''
    const desc =
      r.get(normKey(profile.descriptionColumn)) ??
      r.get('descricao') ??
      r.get('historico') ??
      ''
    const amtRaw =
      r.get(normKey(profile.amountColumn)) ?? r.get('valor') ?? ''

    if (!dRaw && !amtRaw) continue

    const iso = parseBrazilianDate(dRaw) ?? dRaw.match(/^\d{4}-\d{2}-\d{2}$/)?.[0]
    if (!iso) {
      warnings.push(`Linha ${i + 1}: data inválida "${dRaw}"`)
      continue
    }

    const cents = parseAmountToCentsForCsv(amtRaw.replace(/^R\$\s*/i, ''))
    if (cents == null) {
      warnings.push(`Linha ${i + 1}: valor inválido "${amtRaw}"`)
      continue
    }

    let kind: 'debit' | 'credit' = cents < 0 ? 'debit' : 'credit'
    if (profile.kindColumn) {
      const t =
        r.get(normKey(profile.kindColumn)) ??
        r.get(normKey('tipo')) ??
        ''
      if (profile.creditValue && t.toUpperCase() === profile.creditValue.toUpperCase()) {
        kind = 'credit'
      } else if (t) kind = 'debit'
    }

    const amountCents = Math.abs(cents)
    const descriptionRaw = (desc || 'Lançamento importado').slice(0, 500)

    drafts.push({
      tempId: nextId(),
      date: iso,
      amountCents,
      kind,
      descriptionRaw,
    })
  }

  return { drafts, warnings }
}
