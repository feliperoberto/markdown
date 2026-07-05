import type { JSX } from 'preact/jsx-runtime'
import { Button, IconButton } from '@/components'
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
        <IconButton icon="📋" label="Copiar todo o conteúdo do arquivo" title="Copiar tudo" onClick={onCopy} />
      </div>
      <div class="footer-row">
        <div class="footer-tab-group">
          <Button variant={isEdit ? 'primary' : 'default'} onClick={() => onSwitchView('edit')}>
            Marcar
          </Button>
          <Button variant={isEdit ? 'default' : 'primary'} onClick={() => onSwitchView('preview')}>
            Resultado
          </Button>
        </div>
      </div>
    </footer>
  )
}
