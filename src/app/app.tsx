import { renderMarkdown } from '@/lib/markdown'
import { JSZip } from '@/features/import-export/zip'

export function App() {
  // Smoke test: exercises the pinned npm bundles (marked + DOMPurify, JSZip)
  // instead of the legacy index.html CDN <script> tags. Remove once real
  // import/export and markdown rendering logic migrates into these modules.
  console.debug(renderMarkdown('# smoke test'), new JSZip())

  return <div>Markdown app shell (Vite + Preact + TypeScript scaffold)</div>
}
