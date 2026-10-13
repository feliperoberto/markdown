# 8. Ink-saving print variant for the dark ("night") theme

## Status

Proposed. Amends the print colors and typefaces of
[ADR-0007](./0007-document-theme.md) for the dark theme only; page
geometry, pagination and page furniture are unchanged.

## Context

The PDF export follows the active theme (ADR-0006/0007) and forces
`print-color-adjust: exact`. Under `[data-theme='dark']` that prints a
full-bleed `#2a2420` page, a `#08060c` panel behind every code block and
tinted panels behind callouts: the most ink-intensive output the app can
produce, for a theme chosen for reading comfort, not for paper.

Requirements (issue "print night theme"):

1. Black text on white paper; no other color.
2. Remove ornaments only ("firulas": title stroke, section chip, the chip
   on `hr`, rotations). Keep everything that helps identify or read a
   component: padding, margins, borders, rules, icons, labels.
3. Look like raw HTML: one plain reading face, no registers expressed by
   color or hand-drawn marks.
4. A sans-serif tuned for on-screen legibility (the PDF is mostly read on
   screens).
5. Preserve spacing and outlines: the document's overall dimensions.

## Decision

### Trigger and scope

The variant applies when printing with the dark theme active:
`@media print` + `[data-theme='dark']`. The on-screen preview is untouched.
CSS only — no change to `renderMarkdown()`, `preparePrintDocument()` or the
sanitizer. All rules live under one scope selector, so a later opt-in for
the light theme (e.g. a `data-print-variant` flag set by `usePrintExport`)
changes one selector, not the rules.

### Document level (tokens, page, typeface)

Redefine the primitive tokens inside the scope; most of the theme follows
because every role is derived from them (ADR-0007, "Color derived from
tokens").

| Token                                                      | Print value | Effect                                                                                  |
| ---------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------- |
| `--paper`, `--ground-deep`, `--code-bg`                    | `#fff`      | Page, `@page md-sheet` margins, `html/body`, code blocks, chips: white                  |
| `--ink`, `--ink-soft`, `--cream`, `--cream-soft`           | `#000`      | All text, including secondary text (captions, `h6`, tallies, running head, folio)       |
| `--paper-edge`, `--link`, `--accent`, `--success`, `--c-*` | `#000`      | Rules, links, markers, callout tones                                                    |
| `--body`, `--serif-display`, `--hand`                      | sans stack  | One reading face for text and headings                                                  |
| `--mono`                                                   | unchanged   | Code, `kbd`, machine labels stay monospaced (a functional distinction, not an ornament) |

Derived roles mix `--ink` with `--paper`, which would now yield grays
(`--doc-rule-strong` at 55%, `--doc-perforation` at 30%, callout
`--doc-surface` at 10% tone). They are pinned explicitly on
`.print-document`: `--doc-rule`, `--doc-rule-strong`, `--doc-perforation`,
`--doc-link`, `--doc-marker`, `--doc-tick` → `#000`; `--doc-surface`,
`--doc-chip` → `#fff`; `--doc-mark` → `transparent`.

Size and geometry stay as they are: 11pt body, `line-height: 1.6`, the
`@page` margins, the 44em measure, every `em`-based padding and margin.
Box dimensions are therefore preserved. **Line breaks are not**: a
different face has different advance widths, so text reflows inside the
same boxes. That is the accepted cost of requirement 4.

**Typeface.** Options:

| Option                                                                                 | Pros                                                                                                                     | Cons                                                                       |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| A. System stack (`system-ui, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`) | Zero bytes, closest to "raw HTML"                                                                                        | Metrics differ per OS: the same file paginates differently on each machine |
| B. Bundled Atkinson Hyperlegible Next (`@fontsource`, 400/400i/700)                    | Designed for legibility (distinct `Il1`, `0O`); deterministic output; `font-src 'self'` and offline precache already fit | Adds a dependency and ~3 woff2 files to the precache                       |
| C. Bundled Inter                                                                       | Excellent screen rendering, broad coverage                                                                               | Same cost as B, less focused on character disambiguation                   |

**Recommended: B**, with A as the fallback in the same `font-family` list.
Determinism serves requirement 5 better than zero bytes, and legibility is
the stated goal. Like the mono face for page furniture
(`loadPageFurnitureFont`), the face must be loaded before printing: the
button path already waits on `document.fonts.ready`; a native Ctrl/Cmd+P
cannot wait, so it is preloaded when the print root mounts under the dark
theme.

`print-color-adjust: exact` stays: with no fills left it costs no ink, and
it keeps borders and the task tick deterministic across engines.

### Element level

**R** = remove (ornament) · **K** = keep shape and dimensions, black on
white · **S** = substitute an equivalent with the same box.

| Element                             | Today                                                     | Proposal                                                                                                          |
| ----------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `h1`                                | Caveat, coral stroke (`::after`)                          | Sans 700, same size/margins. **R** the stroke (`::after { display: none }`)                                       |
| `h2`                                | Fraunces, brand chip hanging in the margin (`::before`)   | Sans 600, same size/margins. **R** the chip                                                                       |
| `h3`, `h4`                          | Fraunces (h4 italic)                                      | Sans; **K** h4 italic (it carries the level)                                                                      |
| `h5`, `h6`                          | Mono uppercase labels, h6 in `--ink-soft`                 | **K** as is (label style carries the level), black                                                                |
| `a` + printed URL                   | `--link` blue, 55% underline                              | **K** solid black underline (marks the link); **K** the `(url)` disclosure                                        |
| `mark`                              | Amber fill, irregular hand-drawn radii                    | **S** fill → 1px black outline (`box-shadow: inset 0 0 0 1px`, no layout effect), plain 2px radius; **K** padding |
| `del`/`s`, `ins`, `u`               | Colored strokes, `del` dimmed                             | **K** strokes and thickness, black                                                                                |
| Inline `code`                       | Tinted chip                                               | **R** fill; **K** padding and mono face (the face alone identifies it, as in raw HTML)                            |
| `kbd`                               | Keycap border, paper fill                                 | **K** border (it is the component), white fill                                                                    |
| `pre`                               | Near-black panel, cream text                              | **S** panel → 1px black outline (inset `box-shadow`); **K** padding and 8px radius; black text                    |
| `.md-code::before` (language tab)   | Dark tab                                                  | **K** tab (identifies the language), **S** fill → 1px outline on top/sides                                        |
| `ul`/`ol` markers                   | Coral markers, mono bold numbers                          | **K** marker types and mono numbers, black                                                                        |
| Task box `.md-task-check`           | Rotated −3°, green tick                                   | **R** rotation; **K** box, border and tick shape (they carry the state), black                                    |
| Done task item                      | Dimmed (`--ink-soft`)                                     | Black; state stays readable through the tick and the tally                                                        |
| Task tally ("Concluídas 2 de 3")    | Mono label                                                | **K**, black                                                                                                      |
| `dd`                                | 2px rule                                                  | **K**, black                                                                                                      |
| `blockquote`                        | 3px coral bar, Fraunces italic                            | **K** bar (black) and italic, sans; **K** nested dashed bar                                                       |
| `figure.md-quote`                   | 3.4em coral “ glyph in the margin                         | **S** glyph → the plain quote's 3px left bar; **K** `padding-left: 2.1em` and the caption                         |
| `.md-callout`                       | Tinted fill, colored bar, colored icon/label, 3/8px radii | **R** fill; **K** bar, radii, icon shape and label text (type stays identifiable without color), black            |
| Table                               | Booktabs rules (strong/hairline), `th` in `--ink-soft`    | **K** every rule and width, black; `th` black                                                                     |
| `hr`                                | Dashed perforation + rotated chip at its center           | **R** chip; **S** perforation → solid 1px rule; **K** the 2px box and `2.2em` margins                             |
| `img`, `figure.md-image`            | Rounded corners                                           | **K** corners; image content is printed as authored (not desaturated: it is content, not theme)                   |
| `figcaption`, "FIG. n"              | `--ink-soft`, mono label                                  | **K**, black                                                                                                      |
| `details`/`summary`                 | Tinted fill, 1px border, dashed separator                 | **R** fill; **K** border, radius, separator, black                                                                |
| Running head, folio                 | Mono, `--ink-soft`                                        | **K**, black                                                                                                      |
| End mark (`.print-document::after`) | Rotated coral chip                                        | **R**                                                                                                             |

Outlines are drawn with an inset `box-shadow` where a fill is replaced, so
no box grows by a border's width and pagination is not affected.

## Consequences

- **Ink.** No fills remain: the page, code blocks, callouts, `details` and
  highlights print only text and hairlines.
- **The dark-theme PDF no longer mirrors the dark preview.** Parity of
  boxes, measure and page geometry holds (ADR-0007); parity of color,
  typeface and line breaks does not, by design.
- **One more font family** under option B (precache grows, no runtime cost
  outside printing).
- **Highlight semantics** move from a fill to an outline; the mark stays
  visible in grayscale and on any printer.
- **Testing.** `e2e/pdf-export.spec.ts` gains a case with the dark theme
  under `page.emulateMedia({ media: 'print' })` asserting: white
  background on page and `pre`, black text, ornament pseudo-elements not
  rendered, and unchanged box sizes for `pre`, callouts and tables
  compared with the light-theme print.

## Open questions

1. Typeface: B (recommended), A or C?
2. Strict `#000` for table hairlines and `dd` rules, or a neutral gray to
   keep booktabs' strong/light contrast (widths alone then carry it)?
3. Should the light theme get the same variant as an explicit option
   later (see "Trigger and scope")?
