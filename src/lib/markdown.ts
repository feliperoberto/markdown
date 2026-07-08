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
  // { async: false } guarantees marked.parse() returns a string
  // synchronously (never a Promise), so the cast below is sound today —
  // but guard it anyway: if a future marked extension/plugin ever
  // returned a Promise despite this option, DOMPurify.sanitize(promise)
  // would silently stringify it to "[object Promise]" and render that,
  // rather than throwing where the real cause is obvious.
  const html = marked.parse(input, { async: false })
  if (typeof html !== 'string') {
    throw new Error('marked.parse() returned a non-string result despite { async: false }')
  }
  return DOMPurify.sanitize(html, SANITIZE_CONFIG)
}
