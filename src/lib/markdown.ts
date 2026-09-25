import { Marked, Renderer, type RendererObject, type Token, type Tokens } from 'marked'
import DOMPurify from 'dompurify'
import { escapeHtml } from './sanitize'

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

/**
 * GitHub-style alert types (`> [!NOTE]`), with the PT-BR label each callout
 * shows. Same five types and the same meaning as GitHub's, so a document
 * written for GitHub renders with the intent its author had.
 */
export const CALLOUT_LABELS = {
  note: 'Nota',
  tip: 'Dica',
  important: 'Importante',
  warning: 'Aviso',
  caution: 'Cuidado',
} as const

export type CalloutType = keyof typeof CALLOUT_LABELS

const CALLOUT_MARKER = /^\[!(note|tip|important|warning|caution)\][ \t]*/i
// An attribution line opens with a dash: em dash, horizontal bar, en dash,
// or the "--" people type when their keyboard has no em dash.
const ATTRIBUTION_DASH = /^(?:—|―|–|--)[ \t\u00a0]*/
// ...and, unlike a line of dialogue ("— Onde você vai?"), it doesn't end
// like a sentence. Closing quotes/brackets/emphasis markers are skipped.
const SENTENCE_END = /[.!?…:;]["'”’»)*_]*\s*$/
const ATTRIBUTION_MAX_LENGTH = 120
const CODE_LANG = /^[\w#+.-]{1,24}$/

function textToken(text: string): Tokens.Text {
  return { type: 'text', raw: text, text }
}

function isDashText(token: Token | undefined): boolean {
  return token?.type === 'text' && ATTRIBUTION_DASH.test((token as Tokens.Text).text)
}

/** Whether any line of these inline tokens opens with a dash — i.e. is dialogue. */
function hasDashLine(tokens: Token[]): boolean {
  return tokens.some((token, i) => isDashText(token) && (i === 0 || tokens[i - 1]!.type === 'br'))
}

function lastLineBreak(tokens: Token[]): number {
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (tokens[i]!.type === 'br') return i
  }
  return -1
}

/**
 * Returns the inline tokens of an attribution ("— Autora, *Livro*") with the
 * dash stripped, or null when `tokens` doesn't read as one: no leading dash,
 * nothing after it, more than one line, too long, or ending like a sentence.
 */
function attributionTokens(tokens: Token[]): Token[] | null {
  const [lead, ...rest] = tokens
  if (lead?.type !== 'text') return null
  const text = (lead as Tokens.Text).text
  const dash = ATTRIBUTION_DASH.exec(text)
  if (!dash) return null
  const remainder = text.slice(dash[0].length)
  const attribution = remainder ? [textToken(remainder), ...rest] : rest
  const plain = attribution.map((token) => token.raw).join('')
  if (!plain.trim() || plain.length > ATTRIBUTION_MAX_LENGTH || SENTENCE_END.test(plain)) {
    return null
  }
  if (attribution.some((token) => token.type === 'br')) return null
  return attribution
}

/**
 * `> [!TYPE]` → a callout (`role="note"`). Text after the marker on the same
 * line becomes a custom title (Obsidian-style), shown next to the type
 * label rather than replacing it, so the type is never lost.
 */
function renderCallout(renderer: Renderer, token: Tokens.Blockquote): string | null {
  const [first, ...rest] = token.tokens
  if (first?.type !== 'paragraph') return null
  const [lead, ...inline] = (first as Tokens.Paragraph).tokens
  if (lead?.type !== 'text') return null
  const marker = CALLOUT_MARKER.exec((lead as Tokens.Text).text)
  if (!marker) return null

  const type = marker[1]!.toLowerCase() as CalloutType
  const lineBreak = inline.findIndex((t) => t.type === 'br')
  const titleRest = lineBreak === -1 ? inline : inline.slice(0, lineBreak)
  const bodyInline = lineBreak === -1 ? [] : inline.slice(lineBreak + 1)
  const leadRest = (lead as Tokens.Text).text.slice(marker[0].length)
  const titleTokens = leadRest ? [textToken(leadRest), ...titleRest] : titleRest
  const customTitle = renderer.parser.parseInline(titleTokens).trim()

  const label = `<span class="md-callout-label">${CALLOUT_LABELS[type]}</span>`
  const title = customTitle ? `${label} ${customTitle}` : label
  const body =
    (bodyInline.length > 0 ? `<p>${renderer.parser.parseInline(bodyInline)}</p>\n` : '') +
    renderer.parser.parse(rest)
  return `<div class="md-callout" data-callout="${type}" role="note">\n<p class="md-callout-title">${title}</p>\n${body}</div>\n`
}

/**
 * A quotation whose last line is an attribution ("> …\n> — Autora") →
 * `<figure><blockquote/><figcaption/></figure>`, the HTML spec's pattern
 * for a quote and its source (the attribution belongs outside the
 * blockquote: it isn't part of what was said). The attribution can be its
 * own paragraph or the quote's last line. Dialogue — lines that open with
 * a dash, as Portuguese prose writes speech, or a line introduced by a
 * colon ("Ela disse:\n— Vamos") — is left alone.
 */
function renderAttributedQuote(renderer: Renderer, token: Tokens.Blockquote): string | null {
  const blocks = token.tokens.filter((t) => t.type !== 'space')
  const last = blocks[blocks.length - 1]
  if (last?.type !== 'paragraph') return null
  const lastTokens = (last as Tokens.Paragraph).tokens
  const earlier = blocks.slice(0, -1)
  const isDialogue = earlier.some(
    (t) => t.type === 'paragraph' && hasDashLine((t as Tokens.Paragraph).tokens),
  )
  if (isDialogue) return null

  let quote: string | null = null
  let attribution: Token[] | null = null
  if (earlier.length > 0) {
    attribution = attributionTokens(lastTokens)
    if (attribution) quote = renderer.parser.parse(earlier)
  }
  if (!attribution) {
    const lastBreak = lastLineBreak(lastTokens)
    const head = lastTokens.slice(0, lastBreak)
    const introducesSpeech = /:\s*$/.test(head.map((t) => t.raw).join(''))
    if (lastBreak > 0 && !hasDashLine(head) && !introducesSpeech) {
      attribution = attributionTokens(lastTokens.slice(lastBreak + 1))
      if (attribution) {
        quote = renderer.parser.parse(earlier) + `<p>${renderer.parser.parseInline(head)}</p>\n`
      }
    }
  }
  if (!attribution || quote === null) return null

  const source = renderer.parser.parseInline(attribution).trim()
  return `<figure class="md-quote">\n<blockquote>\n${quote}</blockquote>\n<figcaption>— ${source}</figcaption>\n</figure>\n`
}

/**
 * A paragraph holding nothing but an image → `<figure>`, with the image's
 * title (`![alt](src "Título")`) as its `<figcaption>`. The title moves to
 * the caption instead of also staying a tooltip, so it isn't announced
 * twice.
 */
function renderFigure(renderer: Renderer, token: Tokens.Paragraph): string | null {
  const content = token.tokens.filter((t) => !(t.type === 'text' && !t.raw.trim()))
  if (content.length !== 1 || content[0]!.type !== 'image') return null
  const image = content[0] as Tokens.Image
  const img = renderer.image({ ...image, title: null })
  if (!img.startsWith('<img')) return null
  const title = image.title?.trim()
  const caption = title ? `<figcaption>${escapeHtml(title)}</figcaption>\n` : ''
  return `<figure class="md-image">\n${img}\n${caption}</figure>\n`
}

/**
 * Renderer overrides behind the document theme (src/styles/document.css):
 * each one either emits a richer, still-semantic structure for a pattern
 * made of several markdown elements, or returns `false` to fall back to
 * marked's default output.
 */
const renderer: RendererObject = {
  blockquote(token) {
    return renderCallout(this, token) ?? renderAttributedQuote(this, token) ?? false
  },

  paragraph(token) {
    return renderFigure(this, token) ?? false
  },

  // Task lists: marked's default checkbox is a disabled <input>, which the
  // sanitizer strips (FORBID_TAGS), silently losing every item's state. A
  // read-only role="checkbox" span keeps the same semantics without a form
  // control. role="list" keeps list semantics in WebKit, which drops them
  // from lists whose items hide their markers.
  checkbox({ checked }) {
    return `<span class="md-task-check" role="checkbox" aria-checked="${checked}" aria-disabled="true"></span>`
  },

  list(token) {
    const html = Renderer.prototype.list.call(this, token)
    if (!token.items.some((item) => item.task)) return html
    return html.replace(/^<(ul|ol)/, '<$1 class="md-task-list" role="list"')
  },

  listitem(item) {
    const html = Renderer.prototype.listitem.call(this, item)
    if (!item.task) return html
    return html.replace(
      /^<li>/,
      `<li class="md-task" data-task="${item.checked ? 'done' : 'todo'}">`,
    )
  },

  // Fenced code with a language gets a wrapper carrying it as data-lang,
  // which the theme shows as a tab on the block. A wrapper rather than an
  // attribute on <pre>, since the tab sits outside the <pre>'s scroll box.
  code(token) {
    const html = Renderer.prototype.code.call(this, token)
    const lang = token.lang?.trim().split(/\s+/)[0]
    if (!lang || !CODE_LANG.test(lang)) return html
    return `<div class="md-code" data-lang="${lang}">${html.trimEnd()}</div>\n`
  },
}

// A dedicated instance, so these overrides never leak into the global
// `marked` singleton. { breaks: true } treats single newlines as visible
// <br> tags, matching common note-taking WYSIWYG semantics ("press Enter →
// see a break") rather than strict CommonMark (single \n = space, blank
// line = new paragraph).
const markdown = new Marked({ breaks: true, renderer })

export function renderMarkdown(input: string): string {
  // { async: false } guarantees parse() returns a string synchronously
  // (never a Promise), so the typed overload below is sound today — but
  // guard it anyway: if a future marked extension/plugin ever returned a
  // Promise despite this option, DOMPurify.sanitize(promise) would silently
  // stringify it to "[object Promise]" and render that, rather than
  // throwing where the real cause is obvious.
  const html: unknown = markdown.parse(input, { async: false })
  if (typeof html !== 'string') {
    throw new Error('marked.parse() returned a non-string result despite { async: false }')
  }
  return DOMPurify.sanitize(html, SANITIZE_CONFIG)
}
