import type { JSX } from 'preact/jsx-runtime'

export interface FontSizeButtonProps {
  onCycle: () => void
}

/** Header "Aa" button that cycles the editor font size (issue #18). */
export function FontSizeButton({ onCycle }: FontSizeButtonProps): JSX.Element {
  return (
    <button
      class="btn-icon"
      id="fontSizeBtn"
      title="Tamanho do texto"
      aria-label="Alternar tamanho do texto do editor"
      onClick={(event) => {
        event.stopPropagation()
        onCycle()
      }}
    >
      Aa
    </button>
  )
}
