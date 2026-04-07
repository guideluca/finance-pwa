import { endOfMonth, format, startOfMonth, subMonths } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Download, Plus } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/contexts/AuthContext'
import { formatBRLFromCents } from '@/lib/currency'
import { defaultRulePatternFromDescription, suggestCategoryId } from '@/lib/rulesEngine'
import { supabase } from '@/lib/supabase'
import type { Category, Rule, Transaction } from '@/types/database'
import { cn } from '@/lib/utils'

type Tx = Transaction & { categories: Pick<Category, 'name'> | null }

function signedAmount(t: Transaction): number {
  return t.kind === 'credit' ? t.amount_cents : -t.amount_cents
}

function exportCsv(rows: Tx[]) {
  const header = ['data', 'descricao', 'valor_centavos', 'tipo', 'categoria']
  const lines = rows.map((r) =>
    [
      r.date,
      `"${r.description_raw.replace(/"/g, '""')}"`,
      String(signedAmount(r)),
      r.kind,
      r.categories?.name ?? '',
    ].join(';'),
  )
  const blob = new Blob([[header.join(';'), ...lines].join('\n')], {
    type: 'text/csv;charset=utf-8',
  })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `financas-${format(new Date(), 'yyyyMMdd-HHmm')}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}

export function TransactionsPage() {
  const { user } = useAuth()
  const [params] = useSearchParams()
  const categoryFilter = params.get('category')

  const [month, setMonth] = useState(() => startOfMonth(new Date()))
  const [query, setQuery] = useState('')
  const [txs, setTxs] = useState<Tx[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [rules, setRules] = useState<Rule[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    description: '',
    amount: '',
    kind: 'debit' as 'debit' | 'credit',
    categoryId: '' as string,
  })

  const load = useCallback(() => {
    if (!user) return
    const start = format(startOfMonth(month), 'yyyy-MM-dd')
    const end = format(endOfMonth(month), 'yyyy-MM-dd')
    void (async () => {
      setLoading(true)
      const { data } = await supabase
        .from('transactions')
        .select('*, categories(name)')
        .eq('user_id', user.id)
        .gte('date', start)
        .lte('date', end)
        .order('date', { ascending: false })
      setTxs((data as Tx[]) ?? [])
      const { data: cats } = await supabase
        .from('categories')
        .select('*')
        .eq('user_id', user.id)
        .order('sort_order')
        .order('name')
      setCategories(cats ?? [])
      const { data: r } = await supabase
        .from('rules')
        .select('*')
        .eq('user_id', user.id)
        .eq('enabled', true)
      setRules(r ?? [])
      setLoading(false)
    })()
  }, [user, month])

  useEffect(() => {
    load()
  }, [load])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return txs.filter((t) => {
      if (categoryFilter) {
        const name = t.categories?.name ?? 'Sem categoria'
        if (name !== categoryFilter) return false
      }
      if (!q) return true
      return t.description_raw.toLowerCase().includes(q)
    })
  }, [txs, query, categoryFilter])

  const createRuleForTransaction = async (t: Tx, categoryId: string) => {
    if (!user) return
    const pattern = defaultRulePatternFromDescription(t.description_raw)
    await supabase.from('rules').insert({
      user_id: user.id,
      match_type: 'contains' as const,
      pattern,
      category_id: categoryId,
      priority: 10,
      enabled: true,
    })
    void load()
  }

  const onCategoryChange = async (t: Tx, categoryId: string | null) => {
    await supabase
      .from('transactions')
      .update({ category_id: categoryId })
      .eq('id', t.id)
    if (categoryId) await createRuleForTransaction({ ...t, category_id: categoryId }, categoryId)
    void load()
  }

  const addManual = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return
    const raw = form.amount.replace(/\./g, '').replace(',', '.')
    const num = Number(raw)
    if (Number.isNaN(num)) return
    const cents = Math.round(Math.abs(num) * 100)
    await supabase.from('transactions').insert({
      user_id: user.id,
      date: form.date,
      amount_cents: cents,
      description_raw: form.description,
      description_normalized: form.description.toLowerCase(),
      kind: form.kind,
      category_id: form.categoryId || null,
    })
    setShowForm(false)
    setForm({
      date: format(new Date(), 'yyyy-MM-dd'),
      description: '',
      amount: '',
      kind: 'debit',
      categoryId: '',
    })
    void load()
  }

  if (!user) return null

  return (
    <div className="space-y-6 pb-24">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Extrato</h1>
          {categoryFilter ? (
            <p className="text-sm text-muted">Categoria: {categoryFilter}</p>
          ) : (
            <p className="text-sm text-muted">Lançamentos do mês</p>
          )}
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={() => exportCsv(filtered)}>
            <Download className="size-4" />
            CSV
          </Button>
          <Button type="button" size="sm" onClick={() => setShowForm((s) => !s)}>
            <Plus className="size-4" />
            Novo
          </Button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="rounded-lg border border-border bg-surface-elevated px-3 py-1.5 text-sm"
          onClick={() => setMonth((m) => subMonths(m, 1))}
        >
          ‹
        </button>
        <span className="min-w-[9rem] text-center text-sm capitalize">
          {format(month, 'MMM yyyy', { locale: ptBR })}
        </span>
        <button
          type="button"
          className="rounded-lg border border-border bg-surface-elevated px-3 py-1.5 text-sm"
          onClick={() => setMonth((m) => subMonths(m, -1))}
        >
          ›
        </button>
        <Input
          placeholder="Buscar…"
          className="max-w-xs flex-1"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {showForm ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Novo lançamento</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={addManual} className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Data</Label>
                  <Input
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <Label>Tipo</Label>
                  <select
                    className="flex h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm"
                    value={form.kind}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, kind: e.target.value as 'debit' | 'credit' }))
                    }
                  >
                    <option value="debit">Saída</option>
                    <option value="credit">Entrada</option>
                  </select>
                </div>
              </div>
              <div>
                <Label>Descrição</Label>
                <Input
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  required
                />
              </div>
              <div>
                <Label>Valor (ex.: 49,90)</Label>
                <Input
                  inputMode="decimal"
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                  required
                />
              </div>
              <div>
                <Label>Categoria</Label>
                <select
                  className="flex h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm"
                  value={form.categoryId}
                  onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
                >
                  <option value="">—</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <Button type="submit">Salvar</Button>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {loading ? (
        <p className="text-muted">Carregando…</p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((t) => {
            const suggested = suggestCategoryId(t.description_raw, rules)
            return (
              <li
                key={t.id}
                className="rounded-2xl border border-border bg-surface-elevated/70 p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium leading-snug">{t.description_raw}</p>
                    <p className="text-xs text-muted">
                      {format(new Date(t.date), "EEE dd MMM", { locale: ptBR })} ·{' '}
                      {t.kind === 'credit' ? 'Entrada' : 'Saída'}
                    </p>
                  </div>
                  <span
                    className={cn(
                      'font-mono text-sm tabular-nums',
                      signedAmount(t) >= 0 ? 'text-emerald-400' : 'text-red-400',
                    )}
                  >
                    {formatBRLFromCents(signedAmount(t))}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <select
                    className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2 py-1.5 text-xs"
                    value={t.category_id ?? ''}
                    onChange={(e) =>
                      void onCategoryChange(t, e.target.value || null)
                    }
                  >
                    <option value="">{suggested ? '(sugerida)' : 'Sem categoria'}</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  {suggested && !t.category_id ? (
                    <span className="text-[10px] text-muted">Regra pode aplicar</span>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {!loading && filtered.length === 0 ? (
        <p className="text-center text-sm text-muted">Nenhum lançamento encontrado.</p>
      ) : null}
    </div>
  )
}
