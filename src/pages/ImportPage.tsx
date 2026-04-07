import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/contexts/AuthContext'
import { formatBRLFromCents } from '@/lib/currency'
import { suggestCategoryId } from '@/lib/rulesEngine'
import { supabase } from '@/lib/supabase'
import { accountLabelFromImport } from '@/lib/importAccount'
import { CSV_PROFILES, parseCsvBrazil } from '@/parsers/csvImport'
import { detectParser } from '@/parsers/detect'
import { parseItauExtrato } from '@/parsers/itauExtrato'
import { parseNubankExtrato } from '@/parsers/nubankExtrato'
import { extractPdfText } from '@/parsers/pdfText'
import type { ParserId, TransactionDraft } from '@/parsers/types'
import type { Category, Rule } from '@/types/database'
import { cn } from '@/lib/utils'

const PARSER_OPTIONS: { id: ParserId; label: string }[] = [
  { id: 'nubank_extrato_v1', label: 'Nubank — extrato PDF' },
  { id: 'csv_nubank_v1', label: 'Nubank — CSV (Data, Valor, Descrição)' },
  { id: 'itau_extrato_v1', label: 'Itaú — extrato PDF' },
  { id: 'csv_brazil_v1', label: 'CSV — perfil genérico BR (;)' },
]

function csvProfileFor(parserId: ParserId): (typeof CSV_PROFILES)[number] {
  if (parserId === 'csv_nubank_v1') {
    return CSV_PROFILES.find((p) => p.id === 'nubank_csv') ?? CSV_PROFILES[0]!
  }
  return CSV_PROFILES.find((p) => p.id === 'generic_br') ?? CSV_PROFILES[0]!
}

function runParse(parserId: ParserId, text: string) {
  if (parserId === 'nubank_extrato_v1') return parseNubankExtrato(text)
  if (parserId === 'itau_extrato_v1') return parseItauExtrato(text)
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

  useEffect(() => {
    if (!user) return
    void (async () => {
      const { data: c } = await supabase.from('categories').select('*').eq('user_id', user.id)
      setCategories(c ?? [])
    })()
  }, [user])

  const parseFile = async () => {
    if (!file || !user) return
    setBusy(true)
    setWarnings([])
    try {
      const { data: r } = await supabase.from('rules').select('*').eq('user_id', user.id)
      const ruleRows = (r ?? []) as Rule[]

      let parserId: ParserId = parserFallback
      let text = ''

      if (file.name.toLowerCase().endsWith('.csv')) {
        text = await file.text()
        if (parserFallback === 'csv_nubank_v1' || parserFallback === 'csv_brazil_v1') {
          parserId = parserFallback
        } else if (/^nu[_-]/i.test(file.name)) {
          parserId = 'csv_nubank_v1'
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
      const withRules = result.drafts.map((d) => ({
        ...d,
        categoryId:
          suggestCategoryId(d.descriptionRaw, ruleRows.filter((x) => x.enabled)) ??
          d.categoryId ??
          null,
      }))
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
      const account = accountLabelFromImport(parserId, file.name)

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

      const rows = drafts.map((d) => ({
        user_id: user.id,
        date: d.date,
        amount_cents: d.amountCents,
        description_raw: d.descriptionRaw,
        description_normalized: d.descriptionRaw.toLowerCase(),
        kind: d.kind,
        account,
        category_id: d.categoryId ?? null,
        import_batch_id: batch!.id,
        import_file_id: fileRow!.id,
      }))

      const { error: tErr } = await supabase.from('transactions').insert(rows)
      if (tErr) throw tErr

      setStep('pick')
      setFile(null)
      setDrafts([])
    } catch (e) {
      setWarnings([(e as Error).message])
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6 pb-24">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Importar</h1>
        <p className="text-sm text-muted">PDF (Nubank/Itaú) ou CSV — revise antes de salvar</p>
      </header>

      {step === 'pick' ? (
        <Card>
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
              accept=".pdf,.csv"
              className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-accent file:px-4 file:py-2 file:text-sm file:font-medium file:text-[#04120c]"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <div>
              <Label>Fallback (PDF)</Label>
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
      ) : (
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
      )}
    </div>
  )
}
