## Why

The markdown-rendering domain (markdown to sanitized HTML, heading slugs, fragment-link resolution, name sanitizing) has no OpenSpec baseline. This change records what the code does today so later changes can be written as deltas.

## What Changes

- Brownfield baseline only: no source code is changed.
- Documents `renderMarkdown`, the sanitizer configuration, the document-theme renderers (callouts, attributed quotes, figures, task lists, code blocks), heading ids, fragment resolution, preview click handling and name sanitizing.
- Gaps and suspected defects are recorded as `TODO:` requirements instead of being fixed.

## Capabilities

### New Capabilities
- `markdown-rendering`: markdown to sanitized preview HTML, heading anchors and in-document link navigation.

### Modified Capabilities
- None.

## Impact

- Sources: `src/lib/{markdown,sanitize,slugify,fragment}.ts`, `src/features/import-export/sanitize.ts` (re-export), `src/features/editor/useMarkdownPreview.ts`.
- Related, not owned: `PreviewPane.tsx` click handling, `print-export` reuse of `renderMarkdown`.
- Tests mapped: unit tests in `src/lib`, `PreviewPane.test.tsx`, `EditorFeature.test.tsx`, `e2e/preview-anchor-links.spec.ts`.
