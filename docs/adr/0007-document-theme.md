# 7. One document theme for preview and print, built on semiotic registers

## Status

Accepted. Amends the page geometry of
[ADR-0006](./0006-browser-native-pdf-export.md) (see "Page furniture").

## Context

ADR-0006 gave "Exportar PDF" a working print path, but its stylesheet only
carried over the preview's colors and fonts. Rendering a document that uses
every element `renderMarkdown()` can produce showed that the preview itself
was thin, and that paper lost content outright:

- **Content lost.** Task list items lost their state: marked renders
  `- [x]` as a disabled `<input>`, which the sanitizer strips
  (`FORBID_TAGS`), so done and pending items looked the same. A collapsed
  `<details>` printed only its summary. GitHub alerts (`> [!NOTE]`) printed
  as a literal `[!NOTE]`.
- **Meaning lost.** GFM column alignment was ignored (a blanket
  `text-align: left` overrode the `align` attribute). `h5`/`h6` fell back
  to browser defaults, smaller than the body text, so the hierarchy
  collapsed below `h3`. `<mark>` used the browser's pure yellow, and
  `kbd`, `dl`, `del` and `abbr` had no styling. Code blocks were
  double-spaced by their inherited line height (the `<pre>` strut).
- **No parity.** The preview spanned the whole pane (about 180 characters
  per line on a laptop), while the A4 PDF held about 100. Line breaks,
  and so the look of every paragraph, differed between screen and paper.
- **No page layout.** No page numbers and no running head. A
  `break-inside: avoid` on tables and code longer than a page pushed them,
  with their heading, onto the next page, leaving an almost empty page
  behind.

## Decision

### One stylesheet, two media

`src/styles/document.css` styles the rendered document everywhere it
appears: `.preview-content` on screen and `.preview-content.print-document`
in the print root. `global.css` keeps only the app chrome (the sheet, the
desk, the tab) and the print plumbing (hiding the shell). The `@media
print` layer at the end of `document.css` adapts only what paper needs
differently. That is page geometry, page furniture, and what paper cannot
do: be clicked (`<details>` print open), be hovered (abbreviations are
spelled out) or be followed (link destinations are disclosed).

### Three registers

The product's premise, "você marca com a mão, a máquina lê a estrutura",
becomes the rule for choosing every sign. Each mark belongs to one
register, which sets its typeface and color:

| Register | Signs                                                                                                                                                        | Means                                                                                              |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Hand     | h1 marker stroke, highlighter (`mark`), hand tick in task boxes, strike-through, the brand chip on `h2` and `hr`, the epigraph's opening quote, the end mark | Caveat, the coral accent, marks a few degrees off-square (the `.brand-chip` rotation)              |
| Machine  | code blocks and their language tab, `kbd`, `h5`/`h6`, table headings, callout types, "FIG. n", the checklist tally, running head and page numbers            | Courier Prime, uppercase letterspaced labels (as `.sidebar-title`/`.footer-stat`), `--ground-deep` |
| Paper    | body text, `h2`–`h4`, quotations                                                                                                                             | Lora to read, Fraunces to display                                                                  |

Hierarchy is carried by register and style, not size alone: `h1` is
handwritten, `h2`–`h4` are display serif (`h4` in italic), and `h5`/`h6`
become machine labels.

### Color derived from tokens

No new color literals. Roles are derived from the existing tokens with
`color-mix(in oklab, …)`. Mixing a hue with `--ink` darkens it on light
paper and lightens it on dark paper, so one formula serves both
`[data-theme]` palettes. The mix ratios were calibrated for WCAG AA:
callout labels at 40% tone (at least 4.9:1 light, 7.5:1 dark), links at
85% `--link` (at least 4.9:1 on every surface, tinted panels included).
An audit of every text run in a document using all elements found none
below 4.5:1 in either theme. The highlighter is the only per-theme value:
55% on light paper, 35% on dark, where light ink over a stronger mark
would fall to 3.3:1.

### Composite components in the renderer

`renderMarkdown()` (`src/lib/markdown.ts`) now uses its own `Marked`
instance with renderer overrides. Each override emits a semantic structure
for a pattern made of several markdown elements, or returns `false` to
fall back to marked's default. All output still goes through DOMPurify.

- `> [!NOTE|TIP|IMPORTANT|WARNING|CAUTION]` becomes a callout,
  `<div class="md-callout" data-callout role="note">`, labelled in PT-BR
  ("Nota", "Dica", "Importante", "Aviso", "Cuidado"). The type is carried
  by the label text, the icon's shape and GitHub's tone convention, never
  by color alone. Text after the marker becomes an Obsidian-style custom
  title, shown next to the type label.
- A quotation ending in "— Autor" becomes
  `<figure class="md-quote"><blockquote/><figcaption/></figure>`: the HTML
  spec puts attribution outside the quote. Dialogue is excluded: a line
  opening with a dash (Portuguese speech), or a line introduced by a
  colon, is left alone, and so is a dash line that ends like a sentence.
- A paragraph holding only an image becomes a `<figure>`. The image's
  title becomes its `<figcaption>`, numbered "FIG. n" by a CSS counter.
- A task list keeps its state as
  `<span role="checkbox" aria-checked aria-disabled>` (no form control) on
  a `role="list"`. The theme draws the box by hand and adds a tally,
  "Concluídas 2 de 3", worded so screen readers don't read it as a
  fraction.
- A fence with a language gets a `data-lang` wrapper. The theme shows the
  language as a tab on the block, the same tab the sheet wears
  (`.preview-label`).

### Page parity

The preview's sheet is sized like a page: a 44em measure (about 88
characters of Lora) plus margins, centered on the desk. In print, 11pt on
A4's 170mm text block is the same 44em. Screen and paper therefore break
lines at the same places. The sheet's `em` is the document's body size,
so the measure holds at every "Aa" scale.

### Page furniture: progressive enhancement

Page margin boxes (`@top-left`, `@bottom-right`) can carry a running head
(the document's first `h1`, falling back to the file name, from page two
on) and page numbers ("3 / 7"). Chromium 131+ lays them out, and also
paints `@page { background }` across the margins, which removes the white
frame that made ADR-0006 choose `margin: 0`. The print root is flagged
`data-margin-boxes` only where `CSSMarginRule` exists (it shipped with
margin boxes). There, a named page (`@page md-sheet`) with real,
paper-colored margins takes over. Everywhere else, the ADR-0006 layout
stays: zero page margin, with the spacing in the document's cloned
padding. The running head reaches `@page` through a custom property set on
`<html>` via CSSOM at print time, which `style-src 'self'` allows. The
mono face it's set in is loaded explicitly, because a plain-prose document
might never request it.

### Pagination

Headings stay with what follows them, and figures, callouts and table
rows stay whole. Tables, code and quotes may break: a table repeats its
header row, and code keeps at least three lines on each side of a break
and gets its padding and corners on every page.

## Consequences

- **Content survives the trip to paper.** Task state, collapsed content,
  alert types, column alignment and link destinations all reach the PDF.
- **Screen and paper look like the same document**, with the same line
  breaks, instead of the PDF being a recolored reflow.
- **The preview is narrower on wide screens.** That is intentional
  (readable measure, parity), and it is a single rule in `global.css` to
  revisit.
- **Richer markup means more markup to keep safe.** Every composite is
  emitted before DOMPurify, uses only allowlisted tags and attributes
  (`role`, `aria-*`, `data-*`, `figure`), and is covered by unit tests,
  including sanitization of callout content. Print-time link disclosure
  ignores any `data-print-url` the document brings itself.
- **Heuristics can misfire.** Attribution detection could still read an
  unpunctuated dash line as a source. The guards (dialogue, colon, sentence
  end, length) cover the patterns Portuguese prose actually uses, and a
  misfire only changes styling, never content.
- **Page furniture is Chromium-only for now.** Firefox and WebKit print the
  same document without running head and page numbers, and without the
  white-frame risk. Named pages alone, without margin boxes, would bring
  that risk back, which is why the flag gates on `CSSMarginRule` and not on
  `page` support.
- **No new dependencies.** Alerts, quotes, figures, tasks and code tabs
  are renderer overrides in `src/lib/markdown.ts`, not marked plugins.

## Not done (candidates)

- **Footnotes** (`[^1]`) are not part of marked's GFM. Supporting them
  needs an inline and a block tokenizer, plus ids unique across the
  preview and the print root, which both hold a render of the document
  during printing.
- **Syntax highlighting** would need a highlighter dependency.
