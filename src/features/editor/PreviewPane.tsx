import type { JSX } from 'preact/jsx-runtime'

export interface PreviewPaneProps {
  html: string
  hidden: boolean
}

/**
 * Renders the sanitized markdown HTML produced by `renderMarkdown`
 * (issue #18). The sanitize step happens upstream (see `useMarkdownPreview`
 * / `src/lib/markdown.ts`); this component only mounts already-sanitized
 * output, mirroring the prototype's `preview.innerHTML = sanitized` line.
 */
export function PreviewPane({ html, hidden }: PreviewPaneProps): JSX.Element {
  return (
    <div className={`pane preview-pane${hidden ? ' hidden' : ''}`}>
      <div className="preview-wrapper">
        <div className="preview-label">Resultado</div>
        {/* eslint-disable-next-line react/no-danger -- content is sanitized via DOMPurify in renderMarkdown() */}
        <div className="preview-content" id="preview" dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </div>
  )
}
