import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

GlobalWorkerOptions.workerSrc = pdfWorker

export async function extractPdfText(data: ArrayBuffer): Promise<string> {
  const doc = await getDocument({ data: new Uint8Array(data) }).promise
  const parts: string[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    const lineChunks: { y: number; str: string }[] = []
    for (const item of content.items) {
      if (!('str' in item)) continue
      const tm = item.transform
      const y = tm[5]
      lineChunks.push({ y, str: item.str })
    }
    lineChunks.sort((a, b) => b.y - a.y || a.str.localeCompare(b.str))
    const pageText = lineChunks.map((c) => c.str).join(' ')
    parts.push(pageText)
  }
  return parts.join('\n')
}
