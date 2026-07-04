import { marked } from 'marked'
import DOMPurify from 'dompurify'

export function renderMarkdown(input: string): string {
  const html = marked.parse(input, { async: false }) as string
  return DOMPurify.sanitize(html)
}
