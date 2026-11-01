# markdown-rendering Specification

## Purpose
Pipeline that turns markdown into sanitized HTML, plus slug and URL-fragment helpers.

## Requirements

### Requirement: Markdown renders to sanitized HTML
The system SHALL convert markdown to HTML with `renderMarkdown`, treating single newlines as `<br>` and blank lines as paragraph breaks, and SHALL return an empty string for empty input.

#### Scenario: Basic formatting
- **WHEN** the input is `# Title\n\nSome **bold** text.`
- **THEN** the output contains an `<h1>` and `<strong>bold</strong>`

Covered by: src/lib/markdown.test.ts

#### Scenario: Single newline becomes a line break
- **WHEN** a paragraph contains a single newline
- **THEN** the output contains a `<br>` inside one paragraph, while a blank line still starts a new paragraph

Covered by: src/lib/markdown.test.ts

#### Scenario: Empty input
- **WHEN** the input is an empty string
- **THEN** the output is an empty string

Covered by: src/lib/markdown.test.ts

### Requirement: Active content is stripped from rendered output
The system SHALL pass all generated HTML through DOMPurify so that scripts, event-handler attributes, `javascript:` URLs, iframes and SVG-based payloads never reach the preview, while plain text content is preserved.

#### Scenario: Script and handler removal
- **WHEN** the markdown embeds `<script>` or an `onerror` attribute
- **THEN** the script tag and the handler are absent from the output

Covered by: src/lib/markdown.test.ts

#### Scenario: Dangerous URLs and elements
- **WHEN** a link or image uses a `javascript:` URL, or the markdown embeds an iframe or a hostile SVG
- **THEN** the URL, iframe and executable SVG parts are removed and surrounding text remains

Covered by: src/lib/markdown.test.ts

### Requirement: Form elements are forbidden
The system SHALL remove `form`, `input`, `button`, `textarea` and `select` elements from rendered output so a hostile document cannot show a working form (the CSP `form-action` rule is the second layer).

#### Scenario: Form markup in a document
- **WHEN** the markdown embeds a `<form>` with inputs and a button
- **THEN** none of those tags appear in the output

Covered by: src/lib/markdown.test.ts

### Requirement: Links get rel noopener noreferrer
The system SHALL set `rel="noopener noreferrer"` on every anchor that survives sanitizing, via a DOMPurify `afterSanitizeAttributes` hook registered once at module load.

#### Scenario: Link attributes
- **WHEN** the markdown contains links
- **THEN** every `<a>` in the output has `rel="noopener noreferrer"`

Covered by: src/lib/markdown.test.ts

### Requirement: Author ids are kept unless they clobber the document
The system SHALL keep author-supplied ids and ARIA/SVG references (`url(#g)`, `aria-labelledby`) as written, and SHALL drop ids that collide with document properties (DOMPurify `SANITIZE_DOM`).

#### Scenario: Reference attributes preserved
- **WHEN** the markdown embeds an SVG gradient referenced by `fill="url(#g)"`, or an `aria-labelledby` target
- **THEN** the ids and references are unchanged

Covered by: src/lib/markdown.test.ts

#### Scenario: DOM clobbering id
- **WHEN** the markdown embeds `<a id="cookie">`
- **THEN** the `id` attribute is removed

Covered by: src/lib/markdown.test.ts

### Requirement: Callouts from GitHub-style alerts
The system SHALL render a blockquote whose first line is `[!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]` or `[!CAUTION]` (case-insensitive) as a `div.md-callout` with `data-callout` and `role="note"`, a pt-BR type label (Nota, Dica, Importante, Aviso, Cuidado), and the remaining blocks as the body.

#### Scenario: Each alert type
- **WHEN** a blockquote starts with a supported marker followed by body lines
- **THEN** a callout with the matching `data-callout` and label is produced and no `blockquote` or literal `[!` remains

Covered by: src/lib/markdown.test.ts

#### Scenario: Custom title keeps the label
- **WHEN** text follows the marker on the same line
- **THEN** the title shows the type label followed by that text, and later lines become body

Covered by: src/lib/markdown.test.ts

#### Scenario: Marker without body and unknown markers
- **WHEN** the blockquote has only a marker, or an unsupported marker such as `[!FOO]`
- **THEN** a marker-only quote is a title-only callout and an unknown marker stays a plain blockquote

Covered by: src/lib/markdown.test.ts

#### Scenario: Callout content is sanitized
- **WHEN** callout content contains hostile markup
- **THEN** it is sanitized like any other markdown

Covered by: src/lib/markdown.test.ts

### Requirement: Attributed quotations become figures
The system SHALL render a blockquote whose last paragraph (or last line) is an attribution beginning with an em dash, horizontal bar, en dash or `--` as `<figure class="md-quote">` with the quote in a `blockquote` and the source in a `figcaption` prefixed with an em dash. An attribution MUST be single-line, at most 120 characters and not end like a sentence.

#### Scenario: Attribution as its own paragraph
- **WHEN** a quote ends with a paragraph `— Autor`
- **THEN** the output is a figure with the quote in the blockquote and `— Autor` in the figcaption

Covered by: src/lib/markdown.test.ts

#### Scenario: Attribution on the last line
- **WHEN** the last line of the quote is `-- Fulano`
- **THEN** the earlier lines stay in the blockquote joined by `<br>` and the figcaption reads `— Fulano`

Covered by: src/lib/markdown.test.ts

### Requirement: Dialogue is not treated as attribution
The system SHALL leave a blockquote as a plain blockquote when it holds dialogue lines opening with a dash, speech introduced by a colon, a lone dash line, a dash with nothing after it, a dash line that ends like a sentence, or an attribution longer than 120 characters.

#### Scenario: Non-attribution dash lines
- **WHEN** the quote is dialogue, colon-introduced speech, a lone `— Autor`, a bare `—`, a sentence-ending dash line or an over-long dash line
- **THEN** no `figure` is produced and a `blockquote` remains

Covered by: src/lib/markdown.test.ts

### Requirement: Standalone images become figures
The system SHALL render a paragraph containing only an image as `<figure class="md-image">`, moving the image title to an escaped `<figcaption>` (and removing it from the `<img>`), while an image sharing its paragraph with other content stays inline.

#### Scenario: Titled image
- **WHEN** the markdown is `![alt](src "Título")` alone in a paragraph
- **THEN** a figure with the image and a figcaption holding the title is produced, and the `<img>` has no title

Covered by: src/lib/markdown.test.ts

#### Scenario: Untitled and inline images
- **WHEN** an image has no title, or shares its paragraph with text
- **THEN** the untitled one is a figure without a caption and the inline one is not wrapped

Covered by: src/lib/markdown.test.ts

#### Scenario: Caption escaping
- **WHEN** the title contains HTML metacharacters
- **THEN** the caption text is escaped

Covered by: src/lib/markdown.test.ts

### Requirement: Task lists keep item state without form controls
The system SHALL render task-list checkboxes as `span.md-task-check` with `role="checkbox"`, `aria-checked` and `aria-disabled="true"`, mark the list `md-task-list` with `role="list"`, and mark each item `md-task` with `data-task` of `done` or `todo`; ordinary lists MUST be unchanged.

#### Scenario: Checked and unchecked items
- **WHEN** the markdown has `- [x]` and `- [ ]` items
- **THEN** items carry `data-task="done"` / `"todo"` and matching `aria-checked` values

Covered by: src/lib/markdown.test.ts

#### Scenario: Ordered and loose task lists, plain lists
- **WHEN** a task list is ordered or loose, or a list has no task items
- **THEN** ordered and loose task lists get the same markup and plain lists get none of it

Covered by: src/lib/markdown.test.ts

### Requirement: Fenced code carries its language
The system SHALL wrap a fenced code block whose first info-string word matches `[\w#+.-]{1,24}` in `div.md-code[data-lang]`, and SHALL leave blocks without a language, or with an unsafe one, as marked's default output.

#### Scenario: Language label
- **WHEN** a fence is opened with a language such as `js`
- **THEN** the `pre` is wrapped in a container with `data-lang="js"`

Covered by: src/lib/markdown.test.ts

#### Scenario: Extra words and unsafe languages
- **WHEN** the info string has extra words, is missing, or fails the pattern
- **THEN** only the first word is used when valid, otherwise no wrapper is added

Covered by: src/lib/markdown.test.ts

### Requirement: Headings get prefixed unique slug ids
The system SHALL give every markdown heading `id="user-content-" + slug`, where the slug is built from the heading's visible text (inline markup ignored, entities decoded, `>` inside attributes ignored), and repeated headings in one document SHALL get `-1`, `-2`... suffixes, restarting for each render.

#### Scenario: PT-BR heading
- **WHEN** the heading is `# Introdução`
- **THEN** the id is `user-content-introdução`

Covered by: src/lib/markdown.test.ts

#### Scenario: Inline markup and entities
- **WHEN** a heading contains code, bold, HTML entities or inline HTML with `>` in an attribute
- **THEN** the slug is made from the rendered text only

Covered by: src/lib/markdown.test.ts

#### Scenario: Repeated headings
- **WHEN** two headings share text, in one render and again in a later render
- **THEN** ids are `user-content-a` and `user-content-a-1` each time, and a literal "User-content-foo" heading stays distinct from "Foo"

Covered by: src/lib/markdown.test.ts

### Requirement: Slug generation follows GitHub rules
The system SHALL slugify text by NFC-normalizing, lowercasing, trimming, dropping everything except letters, digits, marks, whitespace, `_` and `-`, and turning each whitespace character into `-`; a slug that is empty SHALL become `secao`.

#### Scenario: Accents and punctuation
- **WHEN** the text has accented letters and punctuation
- **THEN** letters are kept (lowercased) and punctuation dropped

Covered by: src/lib/slugify.test.ts

#### Scenario: Non-breaking space, digits, hyphens and underscores
- **WHEN** the text has a non-breaking space or digits, hyphens, underscores
- **THEN** the space acts as a separator (and is trimmed at the ends) and the other characters are kept

Covered by: src/lib/slugify.test.ts

#### Scenario: No letters at all
- **WHEN** a heading slugifies to an empty string
- **THEN** the placeholder `secao` is used

Covered by: src/lib/slugify.test.ts

### Requirement: Fragment hrefs are recognized like a browser does
The system SHALL treat an `<a>` or `<area>` whose trimmed `href` starts with `#` as a fragment link, and SHALL decode its fragment with `decodeURIComponent`, returning null for malformed encodings or non-fragment hrefs.

#### Scenario: Accepted and rejected links
- **WHEN** an `<a>` or `<area>` has `href=" #x"`, or a link points elsewhere or an element is not a link
- **THEN** the first is accepted and the others are rejected

Covered by: src/lib/fragment.test.ts

#### Scenario: Decoding
- **WHEN** the fragment is percent-encoded, malformed, or the href lacks `#`
- **THEN** the encoded one is decoded and the others yield null

Covered by: src/lib/fragment.test.ts

### Requirement: Fragments resolve inside a root only
The system SHALL resolve a decoded fragment within the given root, in order: exact `id`, then `user-content-` plus the fragment's slug (so case and accents are forgiven), then legacy `<a name>`; the first element wins for repeated ids, and an empty or unknown fragment resolves to nothing.

#### Scenario: Resolution order
- **WHEN** a fragment matches an id, a generated heading id or an anchor name
- **THEN** the exact id wins, then the heading id (case-insensitive), then the name

Covered by: src/lib/fragment.test.ts

#### Scenario: Scoping and duplicates
- **WHEN** the same id exists outside the root or twice inside it
- **THEN** only elements inside the root count and the first one is returned

Covered by: src/lib/fragment.test.ts

#### Scenario: Empty and unknown fragments
- **WHEN** the fragment is empty or unknown, even with empty ids and names present
- **THEN** nothing is returned

Covered by: src/lib/fragment.test.ts

### Requirement: Top-of-document links
The system SHALL resolve `#`, `#top` and any-case `top` to `'top'` when no element answers to that name, and an author-defined `#top` element SHALL take precedence.

#### Scenario: Implicit top
- **WHEN** the fragment is `""` or `Top` and no element matches
- **THEN** the target is `'top'`

Covered by: src/lib/fragment.test.ts

#### Scenario: Author-defined top
- **WHEN** the document defines an element with id `top`
- **THEN** that element is returned

Covered by: src/lib/fragment.test.ts

### Requirement: Preview scrolls to fragment targets
The system SHALL handle a plain left-click on a fragment link inside the preview by cancelling default navigation (so the app URL never changes), scrolling only the preview sheet so the target sits at the sheet's top padding, opening closed `<details>` ancestors, and focusing the target (adding a temporary `tabindex="-1"` when it is not natively focusable, removed on blur). Unresolved and malformed fragments MUST be cancelled without scrolling, and a target with no layout box MUST NOT be scrolled.

#### Scenario: Heading link
- **WHEN** the user clicks `[x](#conclusão)` in the preview
- **THEN** the sheet scrolls to the heading, the heading is focused and the URL is unchanged

Covered by: e2e/preview-anchor-links.spec.ts

#### Scenario: Collapsed details
- **WHEN** the target is inside a closed `<details>`
- **THEN** the details opens and the target is scrolled into view

Covered by: e2e/preview-anchor-links.spec.ts

#### Scenario: Top, unresolved and no layout box
- **WHEN** the link is `#top` or `#`, is unresolved or malformed, or targets an element without a layout box
- **THEN** the sheet scrolls to 0 for top, and the others are cancelled without scrolling

Covered by: src/features/editor/PreviewPane.test.tsx

#### Scenario: Focus handling
- **WHEN** the target is natively focusable, or already has a tabindex
- **THEN** its tabindex is left alone, and only an added one is removed on blur

Covered by: src/features/editor/PreviewPane.test.tsx

### Requirement: Modified and external clicks are left to the browser
The system SHALL NOT intercept clicks that are already default-prevented, non-primary, made with meta/ctrl/shift/alt, or on links that are not fragment links.

#### Scenario: External or modified click
- **WHEN** the user clicks an external link, or ctrl-clicks a fragment link
- **THEN** the preview does not cancel or scroll

Covered by: src/features/editor/PreviewPane.test.tsx

### Requirement: Preview HTML is derived lazily from editor content
The system SHALL compute preview HTML with `useMarkdownPreview(content, skip)` synchronously on each content change, and SHALL return an empty string without parsing while `skip` is true (edit-only view), recomputing when `skip` returns to false.

#### Scenario: Typing updates the preview
- **WHEN** the user types `# Hello world` in a view that shows the preview
- **THEN** the preview contains `<h1 id="user-content-hello-world">Hello world</h1>`

Covered by: src/features/editor/EditorFeature.test.tsx

#### Scenario: Edit view skips rendering
- **WHEN** the view is edit-only and the content changes
- **THEN** the preview element stays empty

Covered by: src/features/editor/EditorFeature.test.tsx

### Requirement: Names from external sources are normalized
The system SHALL provide `sanitizeNameSegment`, which strips ASCII control characters (including NUL and DEL), `/` and `\`, then leading dots, then trims whitespace, and SHALL provide `escapeHtml`, which escapes `& < > " '`; HTML metacharacters are intentionally left in sanitized names. `src/features/import-export/sanitize.ts` SHALL re-export both unchanged. See issue #27 referenced in `src/lib/sanitize.ts`.

#### Scenario: Path traversal and hidden names
- **WHEN** the name is `../../etc/passwd` or `.hidden`
- **THEN** separators and leading dots are removed

Covered by: src/lib/sanitize.test.ts

#### Scenario: Control characters and whitespace
- **WHEN** the name has control characters, internal spaces or surrounding spaces
- **THEN** control characters and outer spaces are removed and internal spaces kept

Covered by: src/lib/sanitize.test.ts

#### Scenario: HTML escaping
- **WHEN** a string contains `<`, `>`, `&` or quotes
- **THEN** `escapeHtml` replaces them with entities and leaves plain text alone

Covered by: src/lib/sanitize.test.ts

### Requirement: TODO: Raw HTML headings are not link targets
Headings written as raw HTML (`<h2>Texto</h2>`) are not given a generated id, because only marked's `heading` renderer adds ids (src/lib/markdown.ts:250), so a table-of-contents link to them does not resolve. Desired: every `h1`-`h6` in the output is addressable by its slug, or the limitation is documented.

#### Scenario: Link to a raw HTML heading
- **WHEN** the document has `<h2>Seção</h2>` and `[ir](#seção)`
- **THEN** the link scrolls to the heading (today nothing is scrolled)

Covered by: none (untested)

### Requirement: TODO: sanitizeNameSegment can return an empty name
`sanitizeNameSegment` returns an empty string for inputs such as `...`, `/` or only control characters (src/lib/sanitize.ts:50) and has no fallback or documented contract for callers. Desired: a defined behaviour for empty results (fallback name or explicit rejection by callers).

#### Scenario: Name made only of stripped characters
- **WHEN** the input is `../..` or `\x00`
- **THEN** the caller receives a defined, non-empty fallback or a clear rejection (today the result is `""`)

Covered by: none (untested)

### Requirement: TODO: Orphaned audit comment in sanitize.ts
The "Audited (issue #27 review, 2026-07)" JSDoc block at src/lib/sanitize.ts:55 is not attached to any declaration, and it states that no caller needs `escapeHtml` although `src/lib/markdown.ts` now uses it for figure captions. Desired: the comment is attached to `escapeHtml` and updated to match current call sites.

#### Scenario: Documentation matches usage
- **WHEN** a maintainer reads the audit note
- **THEN** it reflects that `renderFigure` calls `escapeHtml` (today it says no caller does)

Covered by: none (untested)
