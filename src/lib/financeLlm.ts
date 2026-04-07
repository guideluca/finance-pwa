/**
 * Ordem: Gemini → Groq em erros de quota / limite / sobrecarga.
 * Não existe API “financeira” gratuita dedicada; o prompt orienta o modelo genérico.
 */
import { geminiGenerateJson, geminiGenerateText, isGeminiConfigured } from '@/lib/gemini'
import { groqGenerateJson, groqGenerateText, isGroqConfigured } from '@/lib/groq'

export function isFinanceLlmConfigured(): boolean {
  return isGeminiConfigured() || isGroqConfigured()
}

function isRetryablePrimaryError(e: unknown): boolean {
  const msg = (e instanceof Error ? e.message : String(e)).toLowerCase()
  return (
    msg.includes('429') ||
    msg.includes('quota') ||
    msg.includes('resource_exhausted') ||
    msg.includes('resource exhausted') ||
    msg.includes('rate limit') ||
    msg.includes('too many requests') ||
    msg.includes('limite') ||
    msg.includes('exhausted') ||
    msg.includes('503') ||
    msg.includes('overloaded') ||
    msg.includes('unavailable') ||
    msg.includes('try again later')
  )
}

export async function financeLlmGenerateText(prompt: string): Promise<string> {
  const canGroq = isGroqConfigured()
  const canGemini = isGeminiConfigured()

  if (!canGemini && !canGroq) {
    throw new Error(
      'Nenhuma IA configurada. Define VITE_GEMINI_API_KEY e/ou VITE_GROQ_API_KEY no .env.',
    )
  }

  if (canGemini) {
    try {
      return await geminiGenerateText(prompt)
    } catch (e) {
      if (canGroq && isRetryablePrimaryError(e)) {
        return groqGenerateText(prompt)
      }
      throw e
    }
  }

  return groqGenerateText(prompt)
}

export async function financeLlmGenerateJson<T>(prompt: string): Promise<T> {
  const canGroq = isGroqConfigured()
  const canGemini = isGeminiConfigured()

  if (!canGemini && !canGroq) {
    throw new Error(
      'Nenhuma IA configurada. Define VITE_GEMINI_API_KEY e/ou VITE_GROQ_API_KEY no .env.',
    )
  }

  if (canGemini) {
    try {
      return await geminiGenerateJson<T>(prompt)
    } catch (e) {
      if (canGroq && isRetryablePrimaryError(e)) {
        return groqGenerateJson<T>(prompt)
      }
      throw e
    }
  }

  return groqGenerateJson<T>(prompt)
}
