# 6. Browser-native PDF export via `window.print()` and a dedicated print root

## Status

Accepted. Page geometry and the print styling amended by
[ADR-0007](./0007-document-theme.md): the `margin: 0` layout below remains
the fallback, and engines with page margin boxes get real margins, a running
head and page numbers.

## Context

Users wanted to hand someone a PDF of the file they're writing, not only
the raw `.md` the ⬇️ "Baixar arquivo atual" button downloads. The app had no
PDF path at all — the closest thing was the browser's own Ctrl/Cmd+P,
which ran against a print stylesheet built on a `visibility: hidden` hack:
hide everything, then re-show the preview pane. That approach had two
real bugs:

- **Output truncated to one page.** Elements hidden with `visibility` still
  occupy layout, so the preview stayed inside the app shell's
  `overflow: hidden` ancestors. The print engine clipped the document to
  the first viewport-sized page and dropped the rest.
- **Blank page from the edit view.** In edit mode the preview isn't
  mounted, so there was nothing to re-show — printing produced an empty
  sheet.

Any solution also has to respect two standing constraints of this app:
`docs/data-and-privacy.md` promises there is no server and nothing leaves
the device unless Drive sync is turned on, and the app must keep working
offline as an installed PWA.

Options considered:

- **Client-side PDF libraries that rasterize the DOM** (jsPDF +
  html2canvas). Rejected: the output is a picture of the page — text is
  not selectable or searchable, links are dead, file sizes balloon — and
  the two libraries add a heavy chunk to the bundle for a single button.
- **Client-side PDF libraries with their own document model** (pdfmake).
  Rejected: produces real text, but every piece of styling the preview
  already has (headings, code blocks, tables, blockquotes, the paper/ink
  palette, fonts) would have to be re-implemented in pdfmake's own
  definition format and kept in sync with the CSS forever.
- **Server-side rendering** (headless Chromium behind an endpoint).
  Rejected outright: it would send the user's note to a server, breaking
  the privacy model in `docs/data-and-privacy.md`, and it cannot work
  offline.
- **CSS-only, printing the existing DOM** — i.e. fixing the `visibility`
  hack with a better allow-list of what to show. Rejected: the allow-list
  has to track every layout ancestor and its `overflow`/`height` rules,
  so it breaks silently whenever the app shell changes, and it still
  cannot fix the edit-view blank page, because the rendered content
  simply isn't in the DOM there.
- **`window.print()` against a dedicated, print-only container holding a
  fresh render of the current file.** Chosen.

## Decision

Add a 🖨️ "Exportar PDF do arquivo atual" toolbar button
(`src/features/print-export/`) that calls `window.print()`; the user picks
"Save as PDF" (or "Salvar como PDF") as the destination in the browser's
print dialog.

What gets printed is a `.print-root` container appended directly under
`<body>`, filled with the same DOMPurify-sanitized `renderMarkdown()`
output the preview uses — never a raw HTML path. It is filled when the
button is clicked **and** on `beforeprint`, so the browser's native
Ctrl/Cmd+P produces the same result, including from the edit view. It is
emptied on `afterprint`. While printing, `document.title` is temporarily
set to the file name (minus `.md`) so the saved PDF gets a sensible
default filename, and restored afterwards. On the button path, printing
waits for web fonts and images to finish loading, bounded by a timeout
(`PRINT_ASSET_TIMEOUT_MS`) so a slow or broken image can never make the
button look dead.

The print stylesheet (`src/styles/global.css`) replaces the `visibility`
hack with `body > :not(.print-root) { display: none }`, so the app shell
and its `overflow: hidden` ancestors leave layout entirely and the
document flows across as many pages as it needs. It keeps the on-screen
visual identity — paper/ink tokens and fonts, following the active
light/dark theme — with `print-color-adjust: exact` so backgrounds print
regardless of the dialog's "background graphics" setting. The editor
font-scale preference is reset to 1 for print. Page-break rules keep
headings with the following content, avoid splitting code blocks, tables
and images, set orphans/widows, repeat table headers on each page, and
wrap long code lines instead of clipping them.

The button sits left of ⬇️, visually quieter (compact variant, reduced
opacity, a subtle divider, 0.75rem gap), because downloading the Markdown
source remains the primary action. It is hidden on iOS when running as an
installed standalone PWA, where `window.print()` is unreliable.

## Consequences

- **No new dependencies.** The feature is a hook, a button and CSS; the
  bundle does not grow by a PDF library, and the export works offline like
  the rest of the app.
- **Nothing leaves the device.** Rendering and PDF generation happen
  entirely inside the user's browser, consistent with
  `docs/data-and-privacy.md`.
- **Real text in the PDF.** Output is selectable, searchable and keeps
  working links, because it comes from the browser's own print engine
  rather than a rasterized screenshot.
- **Output depends on the browser's print engine.** Pagination, font
  hinting and how the page margin area is coloured can differ between
  Chromium, Firefox and WebKit. Chromium never paints the root
  background into non-zero `@page` margins, so the stylesheet uses
  `@page { margin: 0 }` and moves the page spacing into the document's
  own padding (`box-decoration-break: clone` repeats it on every page).
  This was verified in Chromium; other engines may still differ.
- **One extra step for the user.** The app cannot choose the print
  destination; the user must select "Save as PDF" in the dialog. That is
  the price of using the browser's engine instead of shipping one.
- **iOS standalone PWA users don't get the button.** In that web view
  `window.print()` is often a silent no-op, and a button that might do
  nothing is worse than no button (the same `isRunningStandalone()` guard
  `FullscreenToggle` already uses).
- **The print root is a second render of the document**, done only at
  print time, so it costs nothing while editing — but any future change to
  what the preview renders (a new markdown extension, a sanitizer rule)
  automatically applies to printing too, because both go through
  `renderMarkdown()`.

## Reversal path

If a browser's print engine ever proves unusable for this (e.g. a
regression that can't be worked around in CSS), prefer adding a
client-side, text-preserving PDF generator behind the same button and the
same `renderMarkdown()` output before considering anything server-side —
the no-server, offline-capable constraint is a hard requirement, not a
detail to relitigate.
