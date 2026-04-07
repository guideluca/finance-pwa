/** Groq Cloud (OpenAI-compatible). Tier gratuito — chave em https://console.groq.com/keys */

export function isGroqConfigured(): boolean {
  return Boolean(import.meta.env.VITE_GROQ_API_KEY?.trim())
}

function groqModel(): string {
  return import.meta.env.VITE_GROQ_MODEL?.trim() || 'llama-3.3-70b-versatile'
}

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

type GroqChatResponse = {
  choices?: Array<{ message?: { content?: string } }>
  error?: { message?: string }
}

async function groqChat(body: Record<string, unknown>): Promise<string> {
  const key = import.meta.env.VITE_GROQ_API_KEY?.trim()
  if (!key) throw new Error('Chave Groq não configurada (VITE_GROQ_API_KEY).')

  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
  })

  const data = (await res.json()) as GroqChatResponse
  if (!res.ok) {
    const msg = data.error?.message ?? res.statusText
    throw new Error(msg || 'Falha na API Groq.')
  }

  const text = data.choices?.[0]?.message?.content?.trim()
  if (!text) throw new Error('Resposta vazia da Groq.')
  return text
}

export async function groqGenerateText(prompt: string): Promise<string> {
  return groqChat({
    model: groqModel(),
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.45,
    max_tokens: 8192,
  })
}

export async function groqGenerateJson<T>(prompt: string): Promise<T> {
  const content = await groqChat({
    model: groqModel(),
    messages: [
      {
        role: 'user',
        content: `${prompt}\n\nResponde apenas com um único objeto JSON válido, sem texto antes ou depois, sem markdown.`,
      },
    ],
    temperature: 0.2,
    max_tokens: 8192,
    response_format: { type: 'json_object' },
  })

  try {
    return JSON.parse(content) as T
  } catch {
    const match = content.match(/\{[\s\S]*\}/)
    if (match) return JSON.parse(match[0]) as T
    throw new Error('A Groq não devolveu JSON válido.')
  }
}
