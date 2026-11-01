# editor Specification

## Purpose
Markdown editing surface and live preview: text input, font size, character/token counts and view modes.

## Requirements

### Requirement: Edit and preview views toggle
The editor SHALL show exactly one of two panes at a time, the raw markdown pane ("edit", default) or the rendered pane ("preview"), switched by the footer tabs "Marcar" and "Resultado".

#### Scenario: Starts in edit view
- **WHEN** the editor mounts
- **THEN** the editor pane is visible, the preview pane has the `hidden` class, and the "Marcar" tab is the primary-styled button

Covered by: none (untested)

#### Scenario: Switch to preview and back
- **WHEN** the user clicks "Resultado" and then "Marcar"
- **THEN** the preview pane is shown and then hidden again, and the textarea value is unchanged

Covered by: e2e/editor-golden-path.spec.ts

### Requirement: Hidden pane stays mounted
The editor SHALL hide inactive panes with a `hidden` class instead of unmounting them, so textarea selection and scroll position survive view switches.

#### Scenario: Preview container exists in edit view
- **WHEN** the view is "edit"
- **THEN** the `#preview` element is still in the DOM (empty), and the `#editor` textarea likewise stays mounted when the view is "preview" (the latter half is untested)

Covered by: src/features/editor/EditorFeature.test.tsx

### Requirement: Textarea is a controlled input
The editor pane SHALL render a `#editor` textarea whose value is the `content` prop and SHALL call `onContentChange` with the new value on every input event, without debouncing.

#### Scenario: Typing propagates content
- **WHEN** the user types or fills text into the textarea
- **THEN** `onContentChange` is called with the full textarea value and the textarea shows the new content

Covered by: src/features/editor/EditorFeature.test.tsx

#### Scenario: Placeholder shown when empty
- **WHEN** content is empty
- **THEN** the textarea shows the pt-BR placeholder starting with "Comece a escrever em Markdown"

Covered by: src/features/editor/EditorFeature.test.tsx

### Requirement: Preview renders sanitized markdown
The preview SHALL display HTML produced by `renderMarkdown` (parse then DOMPurify sanitize, see the markdown-rendering domain), recomputed synchronously whenever content changes while the preview is visible.

#### Scenario: Heading rendered with prefixed id
- **WHEN** content is `# Hello world` and the user opens "Resultado"
- **THEN** `#preview` contains `<h1 id="user-content-hello-world">Hello world</h1>`

Covered by: src/features/editor/EditorFeature.test.tsx

#### Scenario: Inline formatting rendered, not echoed
- **WHEN** content contains `**bold**` and the preview is open
- **THEN** `#preview` contains a `strong` element with text "bold"

Covered by: e2e/editor-golden-path.spec.ts

### Requirement: Preview is not computed in edit view
The preview hook SHALL skip parsing and sanitizing while the view is "edit" and return an empty string, and SHALL re-derive the HTML from the current content when the view switches to "preview".

#### Scenario: No render while editing
- **WHEN** the user types in edit view
- **THEN** `#preview` innerHTML is an empty string

Covered by: src/features/editor/EditorFeature.test.tsx

#### Scenario: Render on switch
- **WHEN** content was typed in edit view and the user then clicks "Resultado"
- **THEN** `#preview` contains the rendered HTML of the full content

Covered by: src/features/editor/EditorFeature.test.tsx

### Requirement: Character and token counters
The footer SHALL show the content length in UTF-16 code units as "Caracteres" (`#charCount`) and the token estimate `ceil(chars / 4)` as "Tokens" (`#tokenCount`).

#### Scenario: Estimate rounds up
- **WHEN** content has 5 characters
- **THEN** the counters show 5 characters and 2 tokens

Covered by: none (untested)

#### Scenario: Empty content
- **WHEN** content is empty
- **THEN** both counters show 0

Covered by: none (untested)

### Requirement: Copy-all button
The footer SHALL render a "Copiar tudo" icon button that invokes the optional `onCopy` callback; the button SHALL render even when `onCopy` is not provided. The host (`src/app/app.tsx`) shows a warning toast "Arquivo vazio" for empty content, otherwise copies the active file content to the clipboard and shows a success or error toast.

#### Scenario: Copy non-empty file
- **WHEN** the user clicks "Copiar tudo" with non-empty content
- **THEN** the content is copied and a success toast is shown

Covered by: none (untested)

#### Scenario: Copy empty file
- **WHEN** the user clicks "Copiar tudo" with empty content
- **THEN** nothing is copied and a warning toast "Arquivo vazio" is shown

Covered by: none (untested)

### Requirement: Font scale cycles through fixed steps
The font-size hook SHALL cycle the scale through `1`, `1.5`, `2` in order with wrap-around each time the cycle action is invoked, defaulting to `1`.

#### Scenario: Default scale
- **WHEN** nothing is stored
- **THEN** the scale is `1`

Covered by: src/features/editor/useEditorFontSize.test.tsx

#### Scenario: Cycle with wrap-around
- **WHEN** the cycle action is invoked three times from the default
- **THEN** the scale goes `1.5`, `2`, `1`

Covered by: src/features/editor/useEditorFontSize.test.tsx

### Requirement: Font scale is persisted and applied globally
The font-size hook SHALL write the scale to localStorage key `fontScale` through the storage adapter and set it as the `--font-scale` custom property on the document root, which both the editor textarea and the preview consume.

#### Scenario: Persist and restore
- **WHEN** the user cycles to `1.5` and the hook is mounted again
- **THEN** localStorage `fontScale` is `1.5` and the new mount starts at `1.5`

Covered by: src/features/editor/useEditorFontSize.test.tsx

#### Scenario: CSS variable applied
- **WHEN** the hook mounts
- **THEN** `document.documentElement` has `--font-scale` equal to the current scale

Covered by: src/features/editor/useEditorFontSize.test.tsx

#### Scenario: Invalid stored value ignored
- **WHEN** localStorage `fontScale` holds a value outside the allowed steps (for example `13px`)
- **THEN** the scale falls back to `1`

Covered by: src/features/editor/useEditorFontSize.test.tsx

### Requirement: Font size button
The header "Aa" button SHALL call its `onCycle` handler on click and SHALL stop the click event from propagating to ancestors. It is mounted by `src/app/app.tsx`, not by `EditorFeature`.

#### Scenario: Click cycles without bubbling
- **WHEN** the user clicks the "Aa" button
- **THEN** `onCycle` is called once and the click does not reach parent handlers

Covered by: none (untested)

### Requirement: Fragment links scroll the preview sheet
Clicking an unmodified primary-button in-document `#fragment` link in the preview SHALL cancel navigation and scroll only the `#preview` sheet to the target, resolved at click time by exact id, decoded/case-insensitive heading id, or legacy `<a name>`.

#### Scenario: Scroll to heading
- **WHEN** the user clicks a link whose fragment matches a heading
- **THEN** default navigation is prevented, the sheet scrolls so the target sits at the sheet's top padding, and the target receives focus

Covered by: src/features/editor/PreviewPane.test.tsx

#### Scenario: Top and bare hash
- **WHEN** the user clicks `#top` or `#`
- **THEN** the sheet scrolls to the top

Covered by: src/features/editor/PreviewPane.test.tsx

#### Scenario: Unresolved or malformed fragment
- **WHEN** the fragment matches nothing or is malformed percent-encoding
- **THEN** navigation is still prevented and no scrolling happens

Covered by: src/features/editor/PreviewPane.test.tsx

#### Scenario: Target inside closed details
- **WHEN** the target sits inside a closed `<details>`
- **THEN** the ancestors are opened before scrolling

Covered by: src/features/editor/PreviewPane.test.tsx

#### Scenario: Target without layout box
- **WHEN** the target has no client rects
- **THEN** no scroll happens

Covered by: src/features/editor/PreviewPane.test.tsx

### Requirement: Fragment target focus management
After scrolling, the preview SHALL focus the target; a target that is not natively focusable SHALL get a temporary `tabindex="-1"` that is removed on blur, and an existing tabindex or natively focusable element SHALL be left unchanged.

#### Scenario: Temporary tabindex
- **WHEN** a heading is targeted and later blurs
- **THEN** it had `tabindex="-1"` while focused and has none afterwards, but a pre-existing `tabindex="0"` is preserved

Covered by: src/features/editor/PreviewPane.test.tsx

### Requirement: Non-fragment and modified clicks are left to the browser
The preview SHALL NOT intercept external links, clicks with Ctrl/Meta/Shift/Alt, non-primary buttons, or already default-prevented events.

#### Scenario: External link
- **WHEN** the user clicks an `https://` link
- **THEN** the click is not prevented and nothing scrolls

Covered by: src/features/editor/PreviewPane.test.tsx

#### Scenario: Modified click
- **WHEN** the user Ctrl-clicks a fragment link
- **THEN** the click is not prevented and nothing scrolls

Covered by: src/features/editor/PreviewPane.test.tsx

### Requirement: Anchor navigation works in a real browser
Fragment links in the preview SHALL behave as described above end to end in the running app.

#### Scenario: Browser anchor navigation
- **WHEN** a user clicks a table-of-contents, mixed-case or collapsed-details fragment link in the rendered preview
- **THEN** the sheet scrolls to the target

Covered by: e2e/preview-anchor-links.spec.ts

### Requirement: Editor reflects a freshly created file
The editor SHALL show the active file's content in `#editor` as soon as a new file is created, with no extra selection step.

#### Scenario: Golden path
- **WHEN** the user creates a project and a file and types markdown
- **THEN** the textarea holds the text, the preview renders it, and returning to "Marcar" keeps the raw text intact

Covered by: e2e/editor-golden-path.spec.ts

### Requirement: Save shortcut is outside the editor feature
The Ctrl+S / Cmd+S shortcut SHALL be handled at app level (`useSaveShortcut` in `src/app/app.tsx`), not by the editor feature; with Drive unconfigured it opens the Drive config panel.

#### Scenario: Shortcut opens Drive config
- **WHEN** the user presses Ctrl/Cmd+S with no Drive client configured
- **THEN** the Drive config panel (`#drive-client-id`) becomes visible

Covered by: e2e/save-shortcut.spec.ts

### Requirement: TODO: Font scale hook lives outside the editor feature
The font-size state SHALL be owned consistently; today `useEditorFontSize` and `FontSizeButton` are exported from the editor feature but instantiated in `src/app/app.tsx` (line 150, 369), and `EditorFeature` itself never reads the scale.

#### Scenario: Ownership documented
- **WHEN** a maintainer reads the editor feature
- **THEN** the font scale ownership is unambiguous (either moved into the feature or documented as an app-level concern)

Evidence: src/features/editor/EditorFeature.tsx:24-28, src/app/app.tsx:150.
Covered by: none (untested)

### Requirement: TODO: Footer and font button lack component tests
The footer (view tabs, counters, copy button), `FontSizeButton`, `EditorPane` onInput wiring and `countCharsAndTokens` SHALL each have direct unit tests; currently they are only exercised indirectly or not at all.

#### Scenario: Direct coverage
- **WHEN** the unit suite runs
- **THEN** token rounding, active-tab styling, copy callback and stopPropagation are asserted

Evidence: no `EditorFooter.test.tsx`, `FontSizeButton.test.tsx` or `charTokenCount.test.ts` in src/features/editor.
Covered by: none (untested)

### Requirement: TODO: Character count uses UTF-16 length
The "Caracteres" counter SHALL count user-perceived characters; today it uses `String.length`, so emoji and astral characters count as 2 and the token estimate (`ceil(length / 4)`) is a rough heuristic preserved from the prototype.

#### Scenario: Astral character
- **WHEN** content is a single emoji
- **THEN** the counter would show 1 character (currently shows 2)

Evidence: src/features/editor/charTokenCount.ts:10-13.
Covered by: none (untested)
