# print-export Specification

## Purpose
Browser-native PDF export through a print-only document, including dark-theme ink saving.

## Requirements

### Requirement: Export button in the toolbar
The system SHALL offer a compact icon button labelled "Exportar PDF do arquivo atual" (title "Exportar PDF (via impressão)", class `toolbar-pdf-btn`) that starts the print export when clicked, placed left of the "Baixar arquivo atual" button with at least 8px between them (ADR-0006).

#### Scenario: Clicking the button requests a print
- **WHEN** the user clicks the export button
- **THEN** the `onPrint` callback is invoked once
- **AND** the button shows the printer icon only

Covered by: src/features/print-export/PdfExportButton.test.tsx

#### Scenario: Layout next to the download button
- **WHEN** a file is open
- **THEN** the export button is left of the download button, at least 8px apart
- **AND** on coarse-pointer devices both keep a hit area of at least 44x44

Covered by: e2e/pdf-export.spec.ts

### Requirement: Export button disabled state
The export button SHALL support a disabled state and the app SHALL disable it when no file is open or the batch download area is shown.

#### Scenario: Disabled prop
- **WHEN** the button is rendered with `disabled`
- **THEN** the underlying button is disabled

Covered by: src/features/print-export/PdfExportButton.test.tsx

#### Scenario: App wiring of the disabled state
- **WHEN** there is no current file entry, or the batch area is visible
- **THEN** the button is disabled (`src/app/app.tsx:404-407`)

Covered by: none (untested)

### Requirement: Button hidden in iOS standalone PWA
The export button MUST NOT render on iOS/iPadOS when the app runs as an installed standalone PWA, because `window.print()` is unreliable there (ADR-0006).

#### Scenario: iOS standalone
- **WHEN** the user agent is iOS and the display mode is standalone
- **THEN** the component renders nothing

Covered by: src/features/print-export/PdfExportButton.test.tsx

#### Scenario: Other contexts
- **WHEN** the device is iOS Safari (not standalone), or standalone on a non-iOS device
- **THEN** the button renders

Covered by: src/features/print-export/PdfExportButton.test.tsx

### Requirement: Dedicated print root under body
The hook SHALL append, on mount, a `div.print-root` directly under `<body>` (outside `#app`) containing one empty `div.preview-content.print-document`, and SHALL remove the print root on unmount.

#### Scenario: Mount
- **WHEN** the hook mounts
- **THEN** `body > .print-root` exists with a single empty `.print-document` child that has no id

Covered by: src/features/print-export/usePrintExport.test.ts

#### Scenario: Unmount
- **WHEN** the component using the hook unmounts
- **THEN** the print root is removed from the document

Covered by: src/features/print-export/usePrintExport.test.ts

### Requirement: Markdown is rendered only at print time
The hook SHALL render the current markdown into the print document only when a print starts (button path or `beforeprint`), never on content changes, and SHALL use the latest content and file name at that moment.

#### Scenario: No render on edit
- **WHEN** the content prop changes and no print has started
- **THEN** the print document stays empty

Covered by: src/features/print-export/usePrintExport.test.ts

#### Scenario: Latest content wins
- **WHEN** the content changed after mount and then `beforeprint` fires
- **THEN** the print document contains the new content only

Covered by: src/features/print-export/usePrintExport.test.ts

### Requirement: Native print is supported
The hook SHALL fill the print document on `beforeprint` using the sanitized output of `renderMarkdown()`, so the browser's own Ctrl/Cmd+P prints the same result from any editor view, and SHALL empty it on `afterprint` (ADR-0006).

#### Scenario: Native print cycle
- **WHEN** `beforeprint` fires for content with a heading and a `<script>` tag
- **THEN** the print document contains the heading and no `<script>`
- **AND** after `afterprint` the print document is empty

Covered by: src/features/print-export/usePrintExport.test.ts

#### Scenario: Print from the edit view
- **WHEN** the user is in the edit view (no on-screen preview) and clicks export
- **THEN** `window.print()` is called once and the print document holds the rendered heading and bold text

Covered by: e2e/pdf-export.spec.ts

### Requirement: Button-initiated print flow
`printDocument()` SHALL fill the print document, swap the page title, wait for assets, then call `window.print()`; cleanup SHALL be left to the `afterprint` listener.

#### Scenario: Button path
- **WHEN** `printDocument()` runs
- **THEN** the print document contains the rendered content and `window.print()` is called once
- **AND** a `beforeprint` fired during `print()` does not swap the title a second time
- **AND** after `afterprint` the title is restored and the print document is empty

Covered by: src/features/print-export/usePrintExport.test.ts

### Requirement: No re-render during the print() beforeprint
The hook MUST NOT re-render the print document on the `beforeprint` event that its own `window.print()` call triggers, so images already decoded keep their nodes.

#### Scenario: Decoded nodes survive
- **WHEN** `print()` dispatches `beforeprint` while the print document holds an image
- **THEN** the same `<img>` node is still in the document afterwards

Covered by: src/features/print-export/usePrintExport.test.ts

### Requirement: Bounded wait for fonts and images
Before printing from the button, the system SHALL wait for `document.fonts.ready`, the page furniture font and the decode of every `<img>` in the print document, but for at most `PRINT_ASSET_TIMEOUT_MS` (3000 ms); failures of individual assets MUST NOT block printing.

#### Scenario: Image never decodes
- **WHEN** an image's `decode()` never settles
- **THEN** after 3000 ms `printDocument()` resolves and `window.print()` is called once

Covered by: src/features/print-export/usePrintExport.test.ts

### Requirement: Page title becomes the file name while printing
While a print is in progress the system SHALL set `document.title` to the file name without a trailing `.md` (case-insensitive), so the browser proposes it as the PDF name, and SHALL restore the original title on `afterprint` or unmount. With an empty file name the title MUST stay unchanged.

#### Scenario: Swap and restore
- **WHEN** `beforeprint` fires for file "relatorio.md" and later `afterprint` fires
- **THEN** the title is "relatorio" during the print and the original title afterwards

Covered by: src/features/print-export/usePrintExport.test.ts

#### Scenario: No file name
- **WHEN** `beforeprint` fires with an empty file name
- **THEN** the title is unchanged

Covered by: src/features/print-export/usePrintExport.test.ts

#### Scenario: Unmount while swapped
- **WHEN** the hook unmounts between `beforeprint` and `afterprint`
- **THEN** the original title is restored

Covered by: src/features/print-export/usePrintExport.test.ts

### Requirement: Running head
The system SHALL compute the running head as the whitespace-normalized text of the document's first `<h1>`, falling back to the trimmed file name, truncated to `RUNNING_HEAD_MAX_LENGTH` (72) characters with a trailing "…", and SHALL publish it as a CSS string in the `--print-running-head` property on `<html>` during the print, removing it on `afterprint` and unmount, or when there is nothing to show.

#### Scenario: Head from h1
- **WHEN** the document starts with an `<h1>` containing extra whitespace
- **THEN** the head is its normalized text, and a long title is shortened with an ellipsis

Covered by: src/features/print-export/preparePrintDocument.test.ts

#### Scenario: Fallback and empty
- **WHEN** the document has no `<h1>`
- **THEN** the head is the file name without `.md`, or empty if there is no file name (property removed)

Covered by: src/features/print-export/usePrintExport.test.ts

#### Scenario: Property lifecycle
- **WHEN** `beforeprint` fires and later `afterprint` fires or the hook unmounts
- **THEN** `--print-running-head` is set to the escaped CSS string, then cleared

Covered by: src/features/print-export/usePrintExport.test.ts

#### Scenario: CSS string escaping
- **WHEN** the head contains quotes, backslashes or control characters
- **THEN** quotes and backslashes are escaped and control characters become spaces

Covered by: src/features/print-export/preparePrintDocument.test.ts

### Requirement: Page margin boxes are progressive enhancement
The hook SHALL flag the print root with `data-margin-boxes` and preload the bold `--mono` font only where `CSSMarginRule` exists; elsewhere the zero-margin layout stays (ADR-0007).

#### Scenario: Feature test
- **WHEN** the hook mounts with and without `CSSMarginRule` defined
- **THEN** the attribute is present only when it is defined

Covered by: src/features/print-export/usePrintExport.test.ts

#### Scenario: Paged layout wiring in Chromium
- **WHEN** `beforeprint` fires in Chromium
- **THEN** the root is flagged, `@page md-sheet` has at least two margin rules and the running head property is set, then cleared after `afterprint`

Covered by: e2e/pdf-export.spec.ts

#### Scenario: Font loading never rejects
- **WHEN** the font API or `--mono` token is missing, or loading fails
- **THEN** `loadPageFurnitureFont()` resolves without error

Covered by: src/features/print-export/preparePrintDocument.test.ts

### Requirement: Collapsed content is opened for print
The print copy SHALL have every `<details>` (nested included) open.

#### Scenario: Details open
- **WHEN** the print document is prepared
- **THEN** all `<details>` elements are open, and only the print copy is changed, not the on-screen preview

Covered by: src/features/print-export/preparePrintDocument.test.ts

#### Scenario: Collapsed content visible on paper
- **WHEN** the document has a collapsed `<details>` and the page is in print media
- **THEN** its hidden body text is visible

Covered by: e2e/pdf-export.spec.ts

### Requirement: Link destinations are disclosed
The print copy SHALL mark each `http(s):` or `mailto:` link with `data-print-url` holding the destination (bare address for `mailto:`), unless the link text already equals it after normalization (scheme, `www.`, trailing slashes and case ignored); relative, fragment and other-scheme links get no mark. Any `data-print-url` supplied by the document itself MUST be removed.

#### Scenario: Disclosed and skipped links
- **WHEN** links are prepared
- **THEN** "o exemplo" -> https://example.com/a is marked, an autolink whose text is the URL is not, and `#secao`, `notas.md`, `/relativo`, `ftp://` are not

Covered by: src/features/print-export/preparePrintDocument.test.ts

#### Scenario: Forged attribute
- **WHEN** raw HTML carries its own `data-print-url`
- **THEN** the attribute is ignored or replaced by the computed value

Covered by: src/features/print-export/preparePrintDocument.test.ts

#### Scenario: Rendered in print media
- **WHEN** the page prints a link with text different from its URL and an autolink
- **THEN** the first shows its URL through `::after` content and the second shows none

Covered by: e2e/pdf-export.spec.ts

### Requirement: In-document links target the print copy
The print copy SHALL re-point each resolvable `#fragment` link (including `#`, `#top`, case-insensitive ids and legacy `<a name>`) at an id prefixed `print-` that exists only in the print copy, with collision-free numbering and a shared id for links to one target; ids that nothing links to MUST be kept, unresolved links MUST be left alone, and the print root never receives an id.

#### Scenario: Re-pointing
- **WHEN** the print document and the hidden preview contain the same heading ids
- **THEN** each fragment link resolves to an element inside the print document

Covered by: src/features/print-export/preparePrintDocument.test.ts

#### Scenario: Edge cases
- **WHEN** links are unresolved, malformed, have an unencodable id (lone surrogate), or the document already uses a `print-` id
- **THEN** no error is thrown, unresolved links are unchanged and ids do not collide

Covered by: src/features/print-export/preparePrintDocument.test.ts

#### Scenario: PDF carries working links
- **WHEN** a document with three fragment links is saved as PDF in Chromium
- **THEN** the PDF has three link annotations whose destinations are defined

Covered by: e2e/pdf-export.spec.ts

### Requirement: Print media shows only the document
Under print media the app shell SHALL leave layout entirely (`display: none`, body overflow visible) so only the print document shows and it can paginate (ADR-0006).

#### Scenario: Shell hidden
- **WHEN** print media is emulated after `beforeprint`
- **THEN** toolbar, sidebar, footer and editor are hidden and every non-print-root body child has `display: none`

Covered by: e2e/pdf-export.spec.ts

#### Scenario: Long document
- **WHEN** a 200-paragraph document is saved as PDF in Chromium
- **THEN** the PDF has more than one page

Covered by: e2e/pdf-export.spec.ts

### Requirement: Screen-only semantics survive printing
The print copy SHALL keep task list state, rendered through the `renderMarkdown()` markup (ADR-0007).

#### Scenario: Task state
- **WHEN** a list has one done and one pending item
- **THEN** the print document has one `.md-task-check` with `aria-checked="true"` and one with `"false"`

Covered by: e2e/pdf-export.spec.ts

### Requirement: Ink-saving print under the dark theme
When printing with the dark theme active, the document SHALL print black text on a white page with grayscale panels, the system sans-serif face, no hand-drawn ornaments (title stroke hidden but keeping its space, h2 chip, hr chip, end mark) and unchanged paddings, borders and margins; the light theme MUST keep its print styling (ADR-0008).

#### Scenario: Dark versus light
- **WHEN** the same print render is measured under both themes
- **THEN** dark has a white page, black text, neutral panels at or above 230 per channel, no Caveat/Fraunces/Lora, and the same box metrics as light

Covered by: e2e/pdf-export.spec.ts

### Requirement: Preview sheet is page-sized
On wide screens the on-screen preview sheet SHALL be narrower than the pane and centered, for line-break parity with paper (ADR-0007).

#### Scenario: Wide screen
- **WHEN** the preview is shown on a non-mobile viewport
- **THEN** the sheet is at least 100px narrower than the pane and centered within 2px

Covered by: e2e/pdf-export.spec.ts

### Requirement: TODO: Cleanup when window.print() throws
If `window.print()` throws, the system SHALL clean up the print document, the swapped title and the running head.

Evidence: `src/features/print-export/usePrintExport.ts:170-175` only resets the skip flag in `finally`; cleanup depends on an `afterprint` that may never fire, and the exception propagates to the click handler (`PdfExportButton.tsx:44`, `void onPrint()`).

#### Scenario: print() throws
- **WHEN** `window.print()` throws during `printDocument()`
- **THEN** the title is restored, the print document emptied and the running head removed

Covered by: none (untested)

### Requirement: TODO: Overlapping print requests
A second `printDocument()` call while the first is waiting for assets MUST NOT discard the first call's decoded images.

Evidence: `src/features/print-export/usePrintExport.ts:162-166` calls `fill()` on every invocation with no in-flight guard, replacing the nodes the earlier call is awaiting (the same hazard the skip flag at line 170 avoids for `beforeprint`). The button has no pending state (`PdfExportButton.tsx:36-45`), so a double click within the wait window can trigger it.

#### Scenario: Double click
- **WHEN** the user clicks export twice during the asset wait
- **THEN** only one print is started, with the already decoded nodes

Covered by: none (untested)
