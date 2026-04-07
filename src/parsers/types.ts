export type ParserId =
  | 'nubank_extrato_v1'
  | 'itau_extrato_v1'
  | 'csv_brazil_v1'
  | 'csv_nubank_v1'

export interface TransactionDraft {
  tempId: string
  date: string
  amountCents: number
  kind: 'debit' | 'credit'
  descriptionRaw: string
  categoryId?: string | null
}

export interface ParseResult {
  drafts: TransactionDraft[]
  warnings: string[]
}
