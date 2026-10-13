# 8. Ink-saving print variant for the dark ("night") theme

## Status

Accepted. Amends the print colors and typefaces of
[ADR-0007](./0007-document-theme.md) for the dark theme only; page
geometry, pagination and page furniture are unchanged. The light theme
prints as before.

## Context

The PDF export follows the active theme (ADR-0006/0007) and forces
`print-color-adjust: exact`. Under `[data-theme='dark']` that printed a
full-bleed `#2a2420` page, a `#08060c` panel behind every code block and
tinted panels behind callouts: the most ink-intensive output the app can
produce, for a theme chosen for reading comfort, not for paper.

Requirements (issue "print night theme"):

1. Black text on white paper. Grayscale is allowed for secondary text,
   rules and light panels; no hue.
2. Remove ornaments only ("firulas": title stroke, section chip, the chip
   on `hr`, rotations). Keep everything that helps identify or read a
   component: padding, margins, borders, rules, icons, labels.
3. Look like raw HTML: one plain reading face, no registers expressed by
   color or hand-drawn marks.
4. A sans-serif legible on screen (the PDF is mostly read on screens).
5. Preserve spacing and outlines: the document's overall dimensions.

## Decision

### Trigger and scope

The variant applies only when printing with the dark theme active:
`@media print` + `[data-theme='dark']`, in a dedicated block at the end of
`src/styles/document.css`. The on-screen preview and the light theme's
print are untouched. CSS only: no change to `renderMarkdown()`,
`preparePrintDocument()` or the sanitizer.

### Document level: tokens and typeface

Only primitive tokens are redefined (on `:root[data-theme='dark']`, inside
`@media print`). Every role in the document theme is derived from them
with `color-mix()` (ADR-0007, "Color derived from tokens"), so mixes of
ink and paper now resolve to neutral grays by themselves: no per-role
overrides are needed.

| Token                                     | Print value | Effect                                                                                  |
| ----------------------------------------- | ----------- | --------------------------------------------------------------------------------------- |
| `--paper`                                 | `#fff`      | Page, `@page md-sheet` margins, `html/body`                                             |
| `--ink`, `--cream`, `--link`, `--success` | `#000`      | Body text, code text, links, the task tick                                              |
| `--ink-soft`, `--cream-soft`              | `#555`      | Secondary text (captions, `h6`, `th`, tallies, done tasks, running head, folio): 7.5:1  |
| `--accent`, `--c-*`                       | `#555`      | Markers, quotation bars, callout bars and icons; callout panels resolve to ~`#eee`      |
| `--paper-edge`                            | `#d0d0d0`   | Light rules (table hairlines, `dd`)                                                     |
| `--ground-deep`, `--code-bg`              | `#f2f2f2`   | Code blocks, the language tab, inline code chips, `details` (lighter still)             |
| `--body`, `--serif-display`, `--hand`     | system sans | One reading face for text and headings                                                  |
| `--mono`                                  | unchanged   | Code, `kbd`, machine labels stay monospaced (a functional distinction, not an ornament) |

The one role not derived from ink and paper, the highlighter (`--doc-mark`,
an amber mix), is set to `#ddd` directly.

Light panels are kept rather than replaced by outlines: at 5–7% coverage
they cost little toner, they keep each component identifiable exactly as
on screen, and they keep every box identical.

**Typeface: the system stack** —
`system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial,
sans-serif`. It costs no bytes and nothing to load before a native
Ctrl/Cmd+P, and it is the screen face each platform tunes for legibility.
The trade-off is that metrics differ per OS, so the same file may
paginate differently across machines.

Size and geometry stay as they are: 11pt body, `line-height: 1.6`, the
`@page` margins, the 44em measure, every `em`-based padding and margin.
Box dimensions are therefore preserved. **Line breaks are not**: a
different face has different advance widths, so text reflows inside the
same boxes. That is the accepted cost of requirement 4.

### Element level

**R** = remove (ornament) · **K** = keep shape and dimensions, in the gray
scale · **S** = substitute an equivalent in the same box.

| Element                             | Today                                           | Print under the dark theme                                                             |
| ----------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------- |
| `h1`                                | Caveat, coral stroke (`::after`)                | Sans 700, same size/margins. **R** the stroke, `visibility: hidden` so its space stays |
| `h2`                                | Fraunces, brand chip hanging in the margin      | Sans 600, same size/margins. **R** the chip (absolutely positioned: no layout effect)  |
| `h3`, `h4`                          | Fraunces (h4 italic)                            | Sans; **K** h4 italic (it carries the level)                                           |
| `h5`, `h6`                          | Mono uppercase labels, h6 in `--ink-soft`       | **K**, h6 gray                                                                         |
| `a` + printed URL                   | Blue, 55% underline                             | **K** black with a gray underline; **K** the `(url)` disclosure                        |
| `mark`                              | Amber fill, irregular hand-drawn radii          | Gray fill; **S** irregular radii → plain 2px; **K** padding                            |
| `del`/`s`, `ins`, `u`               | Colored strokes, `del` dimmed                   | **K** strokes and thickness, in gray                                                   |
| Inline `code`, `kbd`                | Tinted chip / keycap                            | **K**, light gray chip / keycap border                                                 |
| `pre` and language tab              | Near-black panel and tab, cream text            | **K** panel, tab, padding and radius, light gray; black text                           |
| `ul`/`ol` markers                   | Coral markers, mono bold numbers                | **K**, gray                                                                            |
| Task box `.md-task-check`           | Rotated −3°, green tick                         | **R** rotation; **K** box and tick (they carry the state), black tick                  |
| Task tally, done items              | Mono label; dimmed text                         | **K**, gray                                                                            |
| `blockquote`, `dd`                  | Coral/rule bars                                 | **K** bars and widths, gray                                                            |
| `figure.md-quote`                   | 3.4em coral “ glyph hanging in the indent       | **S** glyph → a 3px gray bar in the same place; **K** the 2.1em indent and caption     |
| `.md-callout`                       | Tinted fill, colored bar, icon and label        | **K** panel, bar, radii, icon shape and label text (type is not carried by color)      |
| Table                               | Booktabs rules (strong/hairline)                | **K** every rule and width; strong rules dark gray, hairlines light gray               |
| `hr`                                | Dashed perforation + rotated chip at its center | **R** chip; **S** perforation → solid gray rule in the same 2px box                    |
| `details`/`summary`                 | Tinted fill, border, dashed separator           | **K**, gray                                                                            |
| `img`, figures                      | Rounded corners                                 | **K**; image content prints as authored (it is content, not theme)                     |
| Running head, folio                 | Mono, `--ink-soft`                              | **K**, gray                                                                            |
| End mark (`.print-document::after`) | Rotated coral chip after the last line          | **R**                                                                                  |

## Consequences

- **Ink.** No dark fills remain: a white page, black text, and only light
  gray panels and gray rules.
- **The dark-theme PDF no longer mirrors the dark preview.** Parity of
  boxes, measure and page geometry holds (ADR-0007); parity of color,
  typeface and line breaks does not, by design.
- **Pagination may vary by OS** under the dark theme, since the system
  sans-serif differs between platforms.
- **Tested** in `e2e/pdf-export.spec.ts`: under print media, the dark
  theme prints a white page, black text, neutral light panels, no
  ornaments (the title stroke still holding its space), the system face,
  and the same paddings, borders and margins as the light theme's print;
  the light theme keeps its fonts and dark code panel.
