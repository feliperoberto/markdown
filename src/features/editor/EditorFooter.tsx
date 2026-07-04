import type { JSX } from 'preact/jsx-runtime'
import type { EditorView } from '@/features/editor/types'

export interface EditorFooterProps {
  chars: number
  tokens: number
  view: EditorView
  onSwitchView: (view: EditorView) => void
  onCopy?: () => void
}

/**
 * Footer stats (char/token counters) and the edit/preview view-toggle tabs
 * (issue #18), mirroring the prototype's footer markup 1:1.
 */
export function EditorFooter({ chars, tokens, view, onSwitchView, onCopy }: EditorFooterProps): JSX.Element {
  const isEdit = view === 'edit'

  return (
    <footer>
      <div class="footer-row">
        <div class="footer-left">
          <div class="footer-stat">
            <span>Caracteres</span>
            <span class="footer-stat-value" id="charCount">
              {chars}
            </span>
          </div>
          <div class="footer-stat">
            <span>Tokens</span>
            <span class="footer-stat-value" id="tokenCount">
              {tokens}
            </span>
          </div>
        </div>
        <button class="btn-copy" id="copyBtn" title="Copiar tudo" aria-label="Copiar todo o conteúdo do arquivo" onClick={onCopy}>
          📋
        </button>
      </div>
      <div class="footer-row">
        <div class="footer-tab-group">
          <button
            class={`footer-btn${isEdit ? ' active' : ''}`}
            id="footerEditBtn"
            data-view="edit"
            onClick={() => onSwitchView('edit')}
          >
            Marcar
          </button>
          <button
            class={`footer-btn${isEdit ? '' : ' active'}`}
            id="footerPreviewBtn"
            data-view="preview"
            onClick={() => onSwitchView('preview')}
          >
            Resultado
          </button>
        </div>
      </div>
    </footer>
  )
}
