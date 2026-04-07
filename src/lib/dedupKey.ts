/** Chave única por utilizador para impedir reimportar a mesma linha. */
export async function transactionDedupKey(
  userId: string,
  date: string,
  amountCents: number,
  kind: 'debit' | 'credit',
  descriptionRaw: string,
  externalSourceId?: string | null,
): Promise<string> {
  const ext = externalSourceId?.trim()
  if (ext) {
    return `src:${userId}:${ext.slice(0, 256)}`
  }
  const norm = descriptionRaw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .slice(0, 400)
  const basis = `${userId}|${date}|${amountCents}|${kind}|${norm}`
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(basis))
  return `fp:${Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')}`
}
