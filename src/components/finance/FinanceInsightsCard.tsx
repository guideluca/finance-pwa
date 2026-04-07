import { Sparkles } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { isFinanceLlmConfigured } from '@/lib/financeLlm'
import { type FinanceInsightsInput, generateFinanceInsights } from '@/lib/geminiFinance'
import { cn } from '@/lib/utils'

function mdLiteToElements(text: string): ReactNode {
  const blocks = text.split(/\n\n+/)
  return (
    <div className="space-y-4 text-sm leading-relaxed">
      {blocks.map((block, i) => {
        const lines = block.split('\n')
        const first = lines[0] ?? ''
        if (first.startsWith('### ')) {
          return (
            <h4 key={i} className="font-semibold text-foreground">
              {first.slice(4)}
            </h4>
          )
        }
        if (first.startsWith('## ')) {
          return (
            <h3 key={i} className="border-b border-border/60 pb-1 text-base font-semibold">
              {first.slice(3)}
            </h3>
          )
        }
        if (lines.some((l) => l.trim().startsWith('- ') || l.trim().startsWith('* '))) {
          return (
            <ul key={i} className="list-inside list-disc space-y-1 text-muted marker:text-accent">
              {lines
                .map((l) => l.trim())
                .filter((l) => l.startsWith('- ') || l.startsWith('* '))
                .map((l, j) => (
                  <li key={j} className="text-foreground">
                    {l.replace(/^[-*]\s+/, '')}
                  </li>
                ))}
            </ul>
          )
        }
        return (
          <p key={i} className="text-foreground/95">
            {block}
          </p>
        )
      })}
    </div>
  )
}

export function FinanceInsightsCard({
  buildInput,
  className,
}: {
  buildInput: () => FinanceInsightsInput
  className?: string
}) {
  const [text, setText] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const configured = isFinanceLlmConfigured()

  const run = async () => {
    setError(null)
    setLoading(true)
    try {
      const out = await generateFinanceInsights(buildInput())
      setText(out)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao gerar análise.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className={cn('border-accent/20 bg-accent-muted/40', className)}>
      <CardHeader className="space-y-1 pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="size-4 text-accent" aria-hidden />
          Dicas com IA
        </CardTitle>
        <p className="text-xs text-muted">
          Usa primeiro <strong className="font-medium text-foreground/90">Gemini</strong> (grátis); se bater em limite
          de quota, tenta automaticamente <strong className="font-medium text-foreground/90">Groq</strong> se tiveres{' '}
          <code className="rounded bg-surface-elevated px-1 py-0.5 text-[10px]">VITE_GROQ_API_KEY</code>. Não há API
          financeira gratuita dedicada — o texto é gerado com o mesmo prompt em ambos os modelos.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {!configured ? (
          <p className="text-sm text-muted">
            Sem chaves: define <code className="text-xs">VITE_GEMINI_API_KEY</code> e/ou{' '}
            <code className="text-xs">VITE_GROQ_API_KEY</code> no .env.
          </p>
        ) : null}
        <Button type="button" size="sm" disabled={!configured || loading} onClick={() => void run()}>
          {loading ? 'A gerar…' : 'Gerar análise personalizada'}
        </Button>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        {text ? (
          <div className="rounded-xl border border-border/80 bg-surface/60 p-4">{mdLiteToElements(text)}</div>
        ) : null}
      </CardContent>
    </Card>
  )
}
