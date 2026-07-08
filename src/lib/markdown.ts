import { marked } from 'marked'
import DOMPurify from 'dompurify'

// Adds rel="noopener noreferrer" to every link DOMPurify lets through, so
// a same-tab markdown link can't leak a Referer header pointing back at
// this app. Registered once at module scope (not per-render).
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('rel', 'noopener noreferrer')
  }
})

// Forbids form-submission elements. DOMPurify's default config keeps
// <form>/<input>/<button>, which would let a hostile markdown document
// (a shared file, or a tampered Drive backup) render a working
// credential-harvesting form inside the preview pane. See app.html's
// CSP comment (form-action 'self') for the second half of this defense.
const SANITIZE_CONFIG = {
  FORBID_TAGS: ['form', 'input', 'button', 'textarea', 'select'],
}

export function renderMarkdown(input: string): string {
  const html = marked.parse(input, { async: false }) as string
  return DOMPurify.sanitize(html, SANITIZE_CONFIG)
}
