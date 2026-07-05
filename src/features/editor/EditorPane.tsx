import type { JSX } from 'preact/jsx-runtime'

export interface EditorPaneProps {
  content: string
  hidden: boolean
  placeholder?: string
  onChange: (content: string) => void
}

/**
 * The raw-markdown `<textarea>` pane (issue #18). Visibility is controlled
 * by `hidden` rather than unmounting, matching the prototype's `hidden`
 * class toggle so editor scroll position/selection survive view switches.
 */
export function EditorPane({
  content,
  hidden,
  placeholder,
  onChange,
}: EditorPaneProps): JSX.Element {
  return (
    <div className={`pane editor-pane${hidden ? ' hidden' : ''}`}>
      <span className="editor-label">Markdown</span>
      <textarea
        id="editor"
        value={content}
        placeholder={placeholder}
        onInput={(event) => onChange((event.target as HTMLTextAreaElement).value)}
      />
    </div>
  )
}
