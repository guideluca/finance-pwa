import { MessageCircle, Send, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useFinanceAiContext } from '@/contexts/FinanceAiContext'
import { financeLlmGenerateText, isFinanceLlmConfigured } from '@/lib/financeLlm'
import { cn } from '@/lib/utils'

type Msg = { role: 'user' | 'assistant'; content: string }

function buildChatPrompt(history: Msg[], dataContext: string): string {
  const sys = [
    'És um assistente de finanças pessoais. Responde em português do Brasil, de forma clara e curta quando possível.',
    'Não inventes números: se o utilizador perguntar totais e não houver dados no contexto, diz que não tens esses valores e sugere importar/atualizar o extrato.',
    'Não dês aconselhamento jurídico nem recomendações específicas de investimento (ações, cripto); mantém hábitos, orçamento e poupança gerais.',
  ].join('\n')

  const ctx = dataContext.trim()
    ? `\nDados agregados do utilizador (podem estar desatualizados até atualizar o app):\n${dataContext}\n`
    : '\nSem resumo numérico carregado — o utilizador pode precisar abrir Início ou a página Análise.\n'

  const conv = history
    .map((m) => (m.role === 'user' ? `Utilizador: ${m.content}` : `Assistente: ${m.content}`))
    .join('\n')

  return `${sys}${ctx}\nConversa:\n${conv}\nAssistente (responde só à última mensagem do utilizador, sem repetir o prefixo "Assistente:"):`
}

export function FloatingAiChat() {
  const { contextPack } = useFinanceAiContext()
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<Msg[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const scrollDown = useCallback(() => {
    requestAnimationFrame(() => {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
    })
  }, [])

  useEffect(() => {
    if (open) scrollDown()
  }, [open, messages, loading, scrollDown])

  const send = async () => {
    const text = input.trim()
    if (!text || loading) return
    if (!isFinanceLlmConfigured()) {
      setError('Configura VITE_GEMINI_API_KEY ou VITE_GROQ_API_KEY no .env.')
      return
    }
    setError(null)
    setInput('')
    const nextHistory: Msg[] = [...messages, { role: 'user', content: text }]
    setMessages(nextHistory)
    setLoading(true)
    try {
      const prompt = buildChatPrompt(nextHistory, contextPack)
      const reply = await financeLlmGenerateText(prompt)
      setMessages([...nextHistory, { role: 'assistant', content: reply }])
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erro ao responder.'
      setError(msg)
      setMessages([...nextHistory, { role: 'assistant', content: `Não consegui responder: ${msg}` }])
    } finally {
      setLoading(false)
    }
  }

  const bottomOffset = 'calc(5.25rem + env(safe-area-inset-bottom, 0px))'

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'fixed z-[60] flex size-14 items-center justify-center rounded-full border border-border bg-accent text-[#04120c] shadow-[var(--shadow-card)] transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
          open && 'pointer-events-none opacity-0',
        )}
        style={{ right: 'max(1rem, env(safe-area-inset-right))', bottom: bottomOffset }}
        aria-label="Abrir assistente de finanças"
      >
        <MessageCircle className="size-7 opacity-95" strokeWidth={2} />
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[61] flex flex-col justify-end bg-black/45 backdrop-blur-[1px] sm:items-end sm:justify-end sm:bg-black/35 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ai-chat-title"
          onClick={() => setOpen(false)}
        >
          <div
            className="flex max-h-[88dvh] w-full flex-col rounded-t-2xl border border-border bg-surface shadow-[var(--shadow-card)] sm:mb-4 sm:max-h-[min(32rem,82dvh)] sm:w-full sm:max-w-md sm:rounded-2xl"
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
              <div>
                <h2 id="ai-chat-title" className="text-base font-semibold">
                  Assistente
                </h2>
                <p className="text-xs text-muted">Finanças pessoais · Gemini ou Groq</p>
              </div>
              <div className="flex items-center gap-1">
                <Link
                  to="/analysis"
                  className="rounded-lg px-2 py-1.5 text-xs font-medium text-accent hover:underline"
                  onClick={() => setOpen(false)}
                >
                  Análise
                </Link>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="shrink-0 rounded-lg"
                  onClick={() => setOpen(false)}
                  aria-label="Fechar chat"
                >
                  <X className="size-4" />
                </Button>
              </div>
            </div>

            <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
              {messages.length === 0 ? (
                <p className="text-sm text-muted">
                  Pergunta sobre orçamento, hábitos ou sobre os totais do resumo. Envia a primeira mensagem.
                </p>
              ) : (
                messages.map((m, i) => (
                  <div
                    key={i}
                    className={cn(
                      'max-w-[95%] rounded-2xl px-3 py-2 text-sm leading-relaxed',
                      m.role === 'user'
                        ? 'ml-auto bg-accent/20 text-foreground'
                        : 'mr-auto border border-border/80 bg-surface-elevated/60 text-foreground/95',
                    )}
                  >
                    {m.content}
                  </div>
                ))
              )}
              {loading ? (
                <p className="text-xs text-muted" aria-live="polite">
                  A pensar…
                </p>
              ) : null}
              {error && messages.length === 0 ? <p className="text-sm text-danger">{error}</p> : null}
            </div>

            <div className="border-t border-border p-3">
              <div className="flex gap-2">
                <textarea
                  className="min-h-[44px] flex-1 resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  placeholder="Escreve a tua pergunta…"
                  rows={2}
                  value={input}
                  maxLength={4000}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      void send()
                    }
                  }}
                  disabled={loading}
                />
                <Button
                  type="button"
                  size="icon"
                  className="shrink-0 self-end rounded-xl"
                  disabled={loading || !input.trim()}
                  onClick={() => void send()}
                  aria-label="Enviar"
                >
                  <Send className="size-4" />
                </Button>
              </div>
              <button
                type="button"
                className="mt-2 text-xs text-muted hover:text-foreground"
                onClick={() => {
                  setMessages([])
                  setError(null)
                }}
              >
                Limpar conversa
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
