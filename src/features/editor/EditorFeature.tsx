import type { JSX } from 'preact/jsx-runtime'
import { EditorFooter } from '@/features/editor/EditorFooter'
import { EditorPane } from '@/features/editor/EditorPane'
import { FontSizeButton } from '@/features/editor/FontSizeButton'
import { PreviewPane } from '@/features/editor/PreviewPane'
import { countCharsAndTokens } from '@/features/editor/charTokenCount'
import { useEditorFontSize } from '@/features/editor/useEditorFontSize'
import { useEditorView } from '@/features/editor/useEditorView'
import { useMarkdownPreview } from '@/features/editor/useMarkdownPreview'

const EDITOR_PLACEHOLDER =
  'Comece a escrever em Markdown…\n\n# Um título\n**negrito**, *itálico*, `código`'

export interface EditorFeatureProps {
  content: string
  onContentChange: (content: string) => void
  onCopy?: () => void
}

/**
 * Owns the editor + preview feature end to end (issue #18): the
 * `<textarea>`/preview panes, the markdown render+sanitize call
 * (delegated to `src/lib/markdown.ts`), view-toggle state, font-size
 * state, and the char/token counters. Structural extraction of the
 * prototype's `updatePreview()`/`switchView()`/font-size globals — no
 * new editor behavior was added.
 */
export function EditorFeature({ content, onContentChange, onCopy }: EditorFeatureProps): JSX.Element {
  const { view, switchView } = useEditorView()
  const { cycleFontSize } = useEditorFontSize()
  const previewHtml = useMarkdownPreview(content)
  const { chars, tokens } = countCharsAndTokens(content)

  const isEdit = view === 'edit'

  return (
    <div class="editor-feature">
      <FontSizeButton onCycle={cycleFontSize} />
      <main>
        <EditorPane
          content={content}
          hidden={!isEdit}
          placeholder={EDITOR_PLACEHOLDER}
          onChange={onContentChange}
        />
        <PreviewPane html={previewHtml} hidden={isEdit} />
      </main>
      <EditorFooter chars={chars} tokens={tokens} view={view} onSwitchView={switchView} onCopy={onCopy} />
    </div>
  )
}
