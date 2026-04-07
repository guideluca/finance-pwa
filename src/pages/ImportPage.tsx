import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useCallback, useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/contexts/AuthContext'
import { formatBRLFromCents } from '@/lib/currency'
import { suggestCategoryId } from '@/lib/rulesEngine'
import { supabase } from '@/lib/supabase'
import {
  ensureCategoriesForImportHints,
  resolveImportCategoryHint,
} from '@/lib/categoryImportHint'
import { accountLabelFromImport } from '@/lib/importAccount'
import { transactionDedupKey } from '@/lib/dedupKey'
import { CSV_PROFILES, parseCsvBrazil, parseFinancePwaCsv, type CsvProfileId } from '@/parsers/csvImport'
import { detectParser } from '@/parsers/detect'
import { parseControleGastosExtrato } from '@/parsers/controleGastosExtrato'
import { parseItauExtrato } from '@/parsers/itauExtrato'
import { parseNubankExtrato } from '@/parsers/nubankExtrato'
import { extractPdfText } from '@/parsers/pdfText'
import type { ParserId, TransactionDraft } from '@/parsers/types'
import type { Category, ImportBatch, ImportFile, Rule } from '@/types/database'
import { cn } from '@/lib/utils'

const PARSER_OPTIONS: { id: ParserId; label: string }[] = [
  { id: 'controle_gastos_pdf_v1', label: 'Controle de Gastos — PDF (export planilha)' },
  { id: 'nubank_extrato_v1', label: 'Nubank — extrato PDF' },
  { id: 'csv_finance_pwa_v1', label: 'Finance PWA — CSV (lançamentos + categorias)' },
  { id: 'csv_nubank_v1', label: 'Nubank — CSV' },
  { id: 'csv_nubank_planilha_v1', label: 'Nubank — planilha (TSV / Excel colar)' },
  { id: 'itau_extrato_v1', label: 'Itaú — extrato PDF' },
  { id: 'csv_itau_v1', label: 'Itaú — CSV (;)' },
  { id: 'csv_mercadopago_v1', label: 'Mercado Pago — CSV (,)' },
  { id: 'csv_brazil_v1', label: 'CSV — genérico BR (;)' },
]

function csvProfileFor(parserId: ParserId): (typeof CSV_PROFILES)[number] {
  const map: Partial<Record<ParserId, CsvProfileId>> = {
    csv_finance_pwa_v1: 'finance_pwa_csv',
    csv_nubank_v1: 'nubank_csv',
    csv_nubank_planilha_v1: 'nubank_planilha_tsv',
    csv_itau_v1: 'itau_csv',
    csv_mercadopago_v1: 'mercadopago_csv',
    csv_brazil_v1: 'generic_br',
  }
  const pid = map[parserId] ?? 'generic_br'
  return CSV_PROFILES.find((p) => p.id === pid) ?? CSV_PROFILES[0]!
}

type ImportListRow = {
  file: ImportFile
  batch: ImportBatch
  txCount: number
}

async function deleteImportDocument(userId: string, fileId: string): Promise<{ deletedTx: number }> {
  const { data: txs, error: selErr } = await supabase
    .from('transactions')
    .select('id')
    .eq('user_id', userId)
    .eq('import_file_id', fileId)
  if (selErr) throw selErr
  const ids = (txs ?? []).map((t) => t.id)
  if (ids.length > 0) {
    const { error: delTxErr } = await supabase.from('transactions').delete().eq('user_id', userId).in('id', ids)
    if (delTxErr) throw delTxErr
  }

  const { data: fileRow, error: fSelErr } = await supabase
    .from('import_files')
    .select('batch_id')
    .eq('id', fileId)
    .maybeSingle()
  if (fSelErr) throw fSelErr

  const { error: delFileErr } = await supabase.from('import_files').delete().eq('id', fileId)
  if (delFileErr) throw delFileErr

  const batchId = fileRow?.batch_id
  if (batchId) {
    const { count, error: cErr } = await supabase
      .from('import_files')
      .select('id', { count: 'exact', head: true })
      .eq('batch_id', batchId)
    if (cErr) throw cErr
    if ((count ?? 0) === 0) {
      const { error: bErr } = await supabase.from('import_batches').delete().eq('id', batchId).eq('user_id', userId)
      if (bErr) throw bErr
    }
  }

  return { deletedTx: ids.length }
}

function parserLabel(parserId: string): string {
  return PARSER_OPTIONS.find((p) => p.id === parserId)?.label ?? parserId
}

function runParse(parserId: ParserId, text: string) {
  if (parserId === 'controle_gastos_pdf_v1') return parseControleGastosExtrato(text)
  if (parserId === 'nubank_extrato_v1') return parseNubankExtrato(text)
  if (parserId === 'itau_extrato_v1') return parseItauExtrato(text)
  if (parserId === 'csv_finance_pwa_v1') return parseFinancePwaCsv(text)
  return parseCsvBrazil(text, csvProfileFor(parserId))
}

export function ImportPage() {
  const { user } = useAuth()
  const [file, setFile] = useState<File | null>(null)
  const [parserFallback, setParserFallback] = useState<ParserId>('nubank_extrato_v1')
  const [lastParserId, setLastParserId] = useState<ParserId>('nubank_extrato_v1')
  const [drafts, setDrafts] = useState<TransactionDraft[]>([])
  const [warnings, setWarnings] = useState<string[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [busy, setBusy] = useState(false)
  const [step, setStep] = useState<'pick' | 'review'>('pick')
  const [saveNotice, setSaveNotice] = useState<string | null>(null)
  const [importRows, setImportRows] = useState<ImportListRow[]>([])
  const [importsLoading, setImportsLoading] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const loadImports = useCallback(async () => {
    if (!user) return
    setImportsLoading(true)
    setImportError(null)
    try {
      const { data: files, error: fErr } = await supabase
        .from('import_files')
        .select('*')
        .order('created_at', { ascending: false })
      if (fErr) throw fErr

      const fileList = (files ?? []) as ImportFile[]
      if (fileList.length === 0) {
        setImportRows([])
        return
      }
      const batchIds = [...new Set(fileList.map((f) => f.batch_id))]
      const { data: batches, error: bErr } = await supabase
        .from('import_batches')
        .select('*')
        .eq('user_id', user.id)
        .in('id', batchIds)
      if (bErr) throw bErr
      const batchById = new Map((batches as ImportBatch[]).map((b) => [b.id, b]))

      const { data: txRows, error: tErr } = await supabase
        .from('transactions')
        .select('import_file_id')
        .eq('user_id', user.id)
        .not('import_file_id', 'is', null)
      if (tErr) throw tErr
      const countByFile = new Map<string, number>()
      for (const r of txRows ?? []) {
        const fid = r.import_file_id as string
        countByFile.set(fid, (countByFile.get(fid) ?? 0) + 1)
      }

      const rows: ImportListRow[] = []
      for (const file of fileList) {
        const batch = batchById.get(file.batch_id)
        if (!batch) continue
        rows.push({ file, batch, txCount: countByFile.get(file.id) ?? 0 })
      }
      setImportRows(rows.sort((a, b) => b.file.created_at.localeCompare(a.file.created_at)))
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'Erro ao carregar importações.')
      setImportRows([])
    } finally {
      setImportsLoading(false)
    }
  }, [user])

  useEffect(() => {
    if (!user) return
    void (async () => {
      const { data: c } = await supabase.from('categories').select('*').eq('user_id', user.id)
      setCategories(c ?? [])
    })()
  }, [user])

  useEffect(() => {
    if (!user || step !== 'pick') return
    void loadImports()
  }, [user, step, loadImports])

  const parseFile = async () => {
    if (!file || !user) return
    setBusy(true)
    setWarnings([])
    setSaveNotice(null)
    try {
      const { data: r } = await supabase.from('rules').select('*').eq('user_id', user.id)
      const ruleRows = (r ?? []) as Rule[]

      let parserId: ParserId = parserFallback
      let text = ''

      const { data: catFresh } = await supabase.from('categories').select('*').eq('user_id', user.id)
      const categoryRows = (catFresh ?? []) as Category[]

      const lowerName = file.name.toLowerCase()
      const isTabularText =
        lowerName.endsWith('.csv') ||
        lowerName.endsWith('.tsv') ||
        lowerName.endsWith('.txt')

      if (isTabularText) {
        text = await file.text()
        const head = text.slice(0, 2000).toLowerCase()
        const looksLikeNubankPlanilha =
          /\t/.test(text.slice(0, 500)) &&
          /data\b/.test(head) &&
          (/descri/.test(head) || /historico/.test(head)) &&
          (/entrada/.test(head) || /sa[ií]da/.test(head))

        const csvModes: ParserId[] = [
          'csv_finance_pwa_v1',
          'csv_nubank_v1',
          'csv_nubank_planilha_v1',
          'csv_brazil_v1',
          'csv_itau_v1',
          'csv_mercadopago_v1',
        ]
        if (csvModes.includes(parserFallback)) {
          parserId = parserFallback
        } else if (looksLikeNubankPlanilha) {
          parserId = 'csv_nubank_planilha_v1'
        } else if (/^nu[_-]/i.test(file.name)) {
          parserId = 'csv_nubank_v1'
        } else if (/itau|itaú/i.test(file.name)) {
          parserId = 'csv_itau_v1'
        } else if (/mercado\s*pago|mercadopago|mp[_-]/i.test(file.name)) {
          parserId = 'csv_mercadopago_v1'
        } else {
          parserId = 'csv_brazil_v1'
        }
      } else {
        const buf = await file.arrayBuffer()
        text = await extractPdfText(buf)
        parserId = detectParser(file.name, text) ?? parserFallback
      }

      setLastParserId(parserId)
      const result = runParse(parserId, text)

      let categoryRowsResolved = categoryRows
      if (parserId === 'csv_finance_pwa_v1') {
        const hints = result.drafts.map((d) => d.categoryHint).filter((h): h is string => !!h?.trim())
        categoryRowsResolved = await ensureCategoriesForImportHints(supabase, user.id, hints)
        setCategories(categoryRowsResolved)
      }

      const withRules = result.drafts.map((d) => {
        const fromHint = resolveImportCategoryHint(d.categoryHint, categoryRowsResolved)
        const fromRules = suggestCategoryId(
          d.descriptionRaw,
          ruleRows.filter((x) => x.enabled),
        )
        return {
          ...d,
          categoryId: fromHint ?? fromRules ?? d.categoryId ?? null,
        }
      })
      setWarnings(result.warnings)
      setDrafts(withRules)
      setStep('review')
    } catch (e) {
      setWarnings([(e as Error).message])
      setDrafts([])
    } finally {
      setBusy(false)
    }
  }

  const updateDraft = (tempId: string, patch: Partial<TransactionDraft>) => {
    setDrafts((d) => d.map((x) => (x.tempId === tempId ? { ...x, ...patch } : x)))
  }

  const saveAll = async () => {
    if (!user || !file || drafts.length === 0) return
    setBusy(true)
    try {
      const parserId = lastParserId
      const defaultAccount = accountLabelFromImport(parserId, file.name)

      const { data: batch, error: bErr } = await supabase
        .from('import_batches')
        .insert({
          user_id: user.id,
          parser_id: parserId,
          parser_version: 'v1',
          status: 'completed',
        })
        .select('id')
        .single()
      if (bErr) throw bErr

      const { data: fileRow, error: fErr } = await supabase
        .from('import_files')
        .insert({
          batch_id: batch!.id,
          filename: file.name,
          parser_id: parserId,
        })
        .select('id')
        .single()
      if (fErr) throw fErr

      const rows = await Promise.all(
        drafts.map(async (d) => {
          const dedup_key = await transactionDedupKey(
            user.id,
            d.date,
            d.amountCents,
            d.kind,
            d.descriptionRaw,
            d.sourceId,
          )
          const account = d.accountHint?.trim() || defaultAccount
          return {
            user_id: user.id,
            date: d.date,
            amount_cents: d.amountCents,
            description_raw: d.descriptionRaw,
            description_normalized: d.descriptionRaw.toLowerCase(),
            kind: d.kind,
            account: account || null,
            dedup_key,
            category_id: d.categoryId ?? null,
            import_batch_id: batch!.id,
            import_file_id: fileRow!.id,
          }
        }),
      )

      const keys = rows.map((r) => r.dedup_key)
      const { data: existingRows } = await supabase
        .from('transactions')
        .select('dedup_key')
        .eq('user_id', user.id)
        .in('dedup_key', keys)
      const existing = new Set((existingRows ?? []).map((r) => r.dedup_key))
      const skipped = rows.filter((r) => existing.has(r.dedup_key)).length

      const { error: tErr } = await supabase.from('transactions').upsert(rows, {
        onConflict: 'user_id,dedup_key',
        ignoreDuplicates: true,
      })
      if (tErr) throw tErr

      const inserted = rows.length - skipped
      setSaveNotice(
        skipped > 0
          ? `${inserted} lançamento(s) gravados. ${skipped} ignorado(s) (já existiam — deduplicação).`
          : inserted > 0
            ? `${inserted} lançamento(s) gravados.`
            : null,
      )

      setStep('pick')
      setFile(null)
      setDrafts([])
      void loadImports()
    } catch (e) {
      setWarnings([(e as Error).message])
    } finally {
      setBusy(false)
    }
  }

  const removeImport = async (row: ImportListRow) => {
    if (!user) return
    const n = row.txCount
    if (
      !window.confirm(
        `Apagar o arquivo “${row.file.filename}” e ${n} lançamento(s) ligados a esta importação? Isto não pode ser desfeito.`,
      )
    )
      return
    setDeletingId(row.file.id)
    setImportError(null)
    try {
      const { deletedTx } = await deleteImportDocument(user.id, row.file.id)
      setSaveNotice(
        deletedTx > 0
          ? `Importação removida. ${deletedTx} lançamento(s) apagados do extrato.`
          : 'Registo de importação removido (nenhum lançamento estava ligado a este arquivo).',
      )
      void loadImports()
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'Erro ao apagar.')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-6 pb-24">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Importar</h1>
        <p className="text-sm text-muted">
          PDF, CSV ou TSV. <strong>Finance PWA — CSV</strong>: colunas{' '}
          <code className="text-xs">data</code>, <code className="text-xs">descricao</code>,{' '}
          <code className="text-xs">valor</code>, <code className="text-xs">tipo</code> (C/D ou entrada/saída);
          opcionais <code className="text-xs">categoria</code> (cria categorias em falta) e{' '}
          <code className="text-xs">conta</code>. Separador <strong>,</strong> ou <strong>;</strong> (detetado
          automaticamente). Planilha Nubank: Data, Descrição, Entrada/Saída… Itaú CSV costuma usar{' '}
          <strong>;</strong>.
        </p>
      </header>

      {step === 'pick' ? (
        <Card>
          {saveNotice ? (
            <CardContent className="pb-0 pt-5">
              <p className="rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
                {saveNotice}
              </p>
            </CardContent>
          ) : null}
          <CardHeader>
            <CardTitle className="text-base">Arquivo</CardTitle>
            <CardDescription>
              PDF: o parser é escolhido por detecção (nome + texto). Use o seletor como fallback se
              necessário.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <input
              type="file"
              accept=".pdf,.csv,.tsv,.txt"
              className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-accent file:px-4 file:py-2 file:text-sm file:font-medium file:text-[#04120c]"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <div>
              <Label>Tipo (PDF ou CSV)</Label>
              <select
                className="mt-1 flex h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm"
                value={parserFallback}
                onChange={(e) => setParserFallback(e.target.value as ParserId)}
              >
                {PARSER_OPTIONS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <Button type="button" disabled={!file || busy} onClick={() => void parseFile()}>
              {busy ? 'Lendo…' : 'Analisar arquivo'}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {step === 'pick' ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Arquivos importados</CardTitle>
            <CardDescription>
              Remove o registo do ficheiro e <strong>todos</strong> os lançamentos criados nessa importação
              (os que ficaram de fora por duplicados não são apagados).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {importError ? (
              <p className="text-sm text-danger">{importError}</p>
            ) : null}
            {importsLoading ? (
              <p className="text-sm text-muted">A carregar…</p>
            ) : importRows.length === 0 ? (
              <p className="text-sm text-muted">Ainda não há importações guardadas nesta conta.</p>
            ) : (
              <ul className="space-y-2">
                {importRows.map((row) => (
                  <li
                    key={row.file.id}
                    className="flex flex-col gap-2 rounded-xl border border-border bg-surface-elevated/50 p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{row.file.filename}</p>
                      <p className="text-xs text-muted">
                        {format(parseISO(row.file.created_at), "d MMM yyyy 'às' HH:mm", {
                          locale: ptBR,
                        })}{' '}
                        · {row.txCount} lançamento(s) · {parserLabel(row.batch.parser_id)}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="danger"
                      size="sm"
                      className="shrink-0 gap-1"
                      disabled={deletingId === row.file.id}
                      onClick={() => void removeImport(row)}
                    >
                      <Trash2 className="size-4" />
                      {deletingId === row.file.id ? 'A apagar…' : 'Apagar arquivo e lançamentos'}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : null}

      {step === 'review' ? (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">Revisão</CardTitle>
              <CardDescription>{drafts.length} lançamentos</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={() => setStep('pick')}>
                Voltar
              </Button>
              <Button type="button" disabled={busy} onClick={() => void saveAll()}>
                {busy ? 'Salvando…' : 'Salvar no extrato'}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {warnings.length ? (
              <ul className="list-inside list-disc rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
                {warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            ) : null}
            <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
              {drafts.map((d) => (
                <div
                  key={d.tempId}
                  className="rounded-xl border border-border bg-surface-elevated/60 p-2 text-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs text-muted">{d.date}</span>
                    <span
                      className={cn(
                        'font-mono tabular-nums',
                        d.kind === 'credit' ? 'text-emerald-400' : 'text-red-300',
                      )}
                    >
                      {d.kind === 'credit' ? '+' : '−'}
                      {formatBRLFromCents(d.amountCents)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-snug">{d.descriptionRaw}</p>
                  <select
                    className="mt-2 w-full rounded-lg border border-border bg-background px-2 py-1 text-xs"
                    value={d.categoryId ?? ''}
                    onChange={(e) =>
                      updateDraft(d.tempId, { categoryId: e.target.value || null })
                    }
                  >
                    <option value="">Sem categoria</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
