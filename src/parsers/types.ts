export type ParserId =
  | 'nubank_extrato_v1'
  | 'itau_extrato_v1'
  | 'controle_gastos_pdf_v1'
  | 'csv_brazil_v1'
  | 'csv_finance_pwa_v1'
  | 'csv_nubank_v1'
  | 'csv_nubank_planilha_v1'
  | 'csv_itau_v1'
  | 'csv_mercadopago_v1'

export interface TransactionDraft {
  tempId: string
  date: string
  amountCents: number
  kind: 'debit' | 'credit'
  descriptionRaw: string
  categoryId?: string | null
  /** Texto da coluna Categoria em exports / planilhas — resolvido para id na UI */
  categoryHint?: string | null
  /** Coluna Conta / banco no CSV Finance PWA — sobrescreve o rótulo por ficheiro ao gravar */
  accountHint?: string | null
  /** Ex.: coluna Identificador do CSV Nubank — dedup forte */
  sourceId?: string | null
}

export interface ParseResult {
  drafts: TransactionDraft[]
  warnings: string[]
}
