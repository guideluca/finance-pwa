import { endOfMonth, format, startOfMonth, subMonths } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/contexts/AuthContext'
import { formatBRLFromCents } from '@/lib/currency'
import { seedDefaultCategoriesIfEmpty } from '@/lib/seedCategories'
import { supabase } from '@/lib/supabase'
import type { Category, Transaction } from '@/types/database'
import { cn } from '@/lib/utils'

const COLORS = ['#10b981', '#34d399', '#6ee7b7', '#059669', '#047857', '#0d9488', '#14b8a6', '#2dd4bf']

type Tx = Transaction & { categories: Pick<Category, 'name'> | null }

function signedAmount(t: Transaction): number {
  return t.kind === 'credit' ? t.amount_cents : -t.amount_cents
}

export function DashboardPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [month, setMonth] = useState(() => startOfMonth(new Date()))
  const [txs, setTxs] = useState<Tx[]>([])
  const [loading, setLoading] = useState(true)
  const [monthlyNet, setMonthlyNet] = useState<{ key: string; label: string; net: number }[]>([])

  useEffect(() => {
    if (!user) return
    void (async () => {
      try {
        await seedDefaultCategoriesIfEmpty(user.id)
      } catch (e) {
        console.error(e)
      }
    })()
  }, [user])

  useEffect(() => {
    if (!user) return
    const start = format(startOfMonth(month), 'yyyy-MM-dd')
    const end = format(endOfMonth(month), 'yyyy-MM-dd')
    void (async () => {
      setLoading(true)
      const { data, error } = await supabase
        .from('transactions')
        .select('*, categories(name)')
        .eq('user_id', user.id)
        .gte('date', start)
        .lte('date', end)
        .order('date', { ascending: false })
      if (!error && data) setTxs(data as Tx[])
      setLoading(false)
    })()
  }, [user, month])

  useEffect(() => {
    if (!user) return
    const months = [4, 3, 2, 1, 0].map((i) => startOfMonth(subMonths(month, i)))
    const from = format(months[0]!, 'yyyy-MM-dd')
    const to = format(endOfMonth(months[months.length - 1]!), 'yyyy-MM-dd')
    void (async () => {
      const { data } = await supabase
        .from('transactions')
        .select('date, amount_cents, kind')
        .eq('user_id', user.id)
        .gte('date', from)
        .lte('date', to)
      const byKey = new Map<string, number>()
      for (const t of data ?? []) {
        const k = t.date.slice(0, 7)
        const s = t.kind === 'credit' ? t.amount_cents : -t.amount_cents
        byKey.set(k, (byKey.get(k) ?? 0) + s)
      }
      setMonthlyNet(
        months.map((m) => {
          const key = format(m, 'yyyy-MM')
          return {
            key,
            label: format(m, 'MMM', { locale: ptBR }),
            net: byKey.get(key) ?? 0,
          }
        }),
      )
    })()
  }, [user, month])

  const stats = useMemo(() => {
    let income = 0
    let expense = 0
    for (const t of txs) {
      if (t.kind === 'credit') income += t.amount_cents
      else expense += t.amount_cents
    }
    return { income, expense, net: income - expense }
  }, [txs])

  const pieData = useMemo(() => {
    const map = new Map<string, number>()
    for (const t of txs) {
      if (t.kind === 'credit') continue
      const label = t.categories?.name ?? 'Sem categoria'
      map.set(label, (map.get(label) ?? 0) + t.amount_cents)
    }
    return [...map.entries()]
      .map(([name, value]) => ({ name, value }))
      .filter((d) => d.value > 0)
      .sort((a, b) => b.value - a.value)
  }, [txs])

  const bankSpend = useMemo(() => {
    const map = new Map<string, number>()
    for (const t of txs) {
      if (t.kind !== 'debit') continue
      const label = t.account?.trim() || 'Não identificado'
      map.set(label, (map.get(label) ?? 0) + t.amount_cents)
    }
    return [...map.entries()]
      .map(([name, value]) => ({ name, value }))
      .filter((d) => d.value > 0)
      .sort((a, b) => b.value - a.value)
  }, [txs])

  if (loading && txs.length === 0) {
    return <div className="pb-24 text-center text-muted">Carregando…</div>
  }

  return (
    <div className="space-y-8 pb-24">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Resumo</h1>
        <p className="text-sm text-muted">Visão mensal das suas finanças</p>
        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            className="rounded-lg border border-border bg-surface-elevated px-3 py-1.5 text-sm"
            onClick={() => setMonth((m) => subMonths(m, 1))}
            aria-label="Mês anterior"
          >
            ‹
          </button>
          <span className="min-w-[10rem] text-center text-sm font-medium capitalize">
            {format(month, 'MMMM yyyy', { locale: ptBR })}
          </span>
          <button
            type="button"
            className="rounded-lg border border-border bg-surface-elevated px-3 py-1.5 text-sm"
            onClick={() => setMonth((m) => subMonths(m, -1))}
            aria-label="Próximo mês"
          >
            ›
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted">Entradas</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-mono text-xl tabular-nums text-emerald-400">
              {formatBRLFromCents(stats.income)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted">Saídas</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-mono text-xl tabular-nums text-red-400">
              {formatBRLFromCents(stats.expense)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted">Saldo do mês</CardTitle>
          </CardHeader>
          <CardContent>
            <p
              className={cn(
                'font-mono text-2xl font-semibold tabular-nums',
                stats.net >= 0 ? 'text-emerald-400' : 'text-red-400',
              )}
            >
              {formatBRLFromCents(Math.abs(stats.net))}
              {stats.net < 0 ? ' (déficit)' : ''}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Gastos por banco</CardTitle>
          <p className="text-xs text-muted">
            Soma de saídas (débitos) no mês, por origem da importação. Lançamentos manuais aparecem
            em “Não identificado”.
          </p>
        </CardHeader>
        <CardContent className="h-72">
          {bankSpend.length === 0 ? (
            <p className="text-sm text-muted">Sem despesas neste mês ou sem banco associado.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart layout="vertical" data={bankSpend} margin={{ left: 8, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#243044" horizontal={false} />
                <XAxis
                  type="number"
                  stroke="#8b9cb5"
                  fontSize={11}
                  tickFormatter={(v) => formatBRLFromCents(Number(v))}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={110}
                  stroke="#8b9cb5"
                  fontSize={11}
                  tickLine={false}
                />
                <Tooltip
                  formatter={(v) => formatBRLFromCents(Number(v ?? 0))}
                  contentStyle={{
                    background: '#111827',
                    border: '1px solid #243044',
                    borderRadius: 12,
                  }}
                />
                <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                  {bankSpend.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} opacity={0.9} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Despesas por categoria</CardTitle>
        </CardHeader>
        <CardContent className="h-64">
          {pieData.length === 0 ? (
            <p className="text-sm text-muted">Sem despesas categorizadas neste mês.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={48}
                  outerRadius={80}
                  paddingAngle={2}
                  onClick={(_data, idx) => {
                    const name = pieData[idx]?.name
                    if (name) navigate(`/transactions?category=${encodeURIComponent(name)}`)
                  }}
                >
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} stroke="transparent" />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v) => formatBRLFromCents(Number(v ?? 0))}
                  contentStyle={{
                    background: '#111827',
                    border: '1px solid #243044',
                    borderRadius: 12,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Resultado nos últimos meses</CardTitle>
        </CardHeader>
        <CardContent className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthlyNet}>
              <CartesianGrid strokeDasharray="3 3" stroke="#243044" />
              <XAxis dataKey="label" stroke="#8b9cb5" fontSize={11} />
              <YAxis stroke="#8b9cb5" fontSize={11} tickFormatter={(v) => `${Number(v) / 100}`} />
              <Tooltip
                formatter={(v) => formatBRLFromCents(Number(v ?? 0))}
                contentStyle={{
                  background: '#111827',
                  border: '1px solid #243044',
                  borderRadius: 12,
                }}
              />
              <Bar dataKey="net" radius={[6, 6, 0, 0]}>
                {monthlyNet.map((e) => (
                  <Cell
                    key={e.key}
                    fill={e.net >= 0 ? '#10b981' : '#f87171'}
                    opacity={0.85}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Últimos lançamentos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {txs.slice(0, 6).map((t) => (
            <button
              key={t.id}
              type="button"
              className="flex w-full items-start justify-between gap-2 rounded-xl border border-border/60 bg-background/40 px-3 py-2 text-left text-sm"
              onClick={() => navigate('/transactions')}
            >
              <div>
                <p className="line-clamp-2 font-medium">{t.description_raw}</p>
                <p className="text-xs text-muted">
                  {format(new Date(t.date), 'dd MMM', { locale: ptBR })}
                  {t.categories?.name ? ` · ${t.categories.name}` : ''}
                </p>
              </div>
              <span
                className={cn(
                  'shrink-0 font-mono tabular-nums',
                  signedAmount(t) >= 0 ? 'text-emerald-400' : 'text-red-400',
                )}
              >
                {formatBRLFromCents(signedAmount(t))}
              </span>
            </button>
          ))}
          {txs.length === 0 ? (
            <p className="text-sm text-muted">Nenhum lançamento neste mês.</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
