import type { JSX } from 'preact/jsx-runtime'
import { IconButton } from '@/components'

export interface FontSizeButtonProps {
  onCycle: () => void
}

/** Header "Aa" button that cycles the editor font size (issue #18). */
export function FontSizeButton({ onCycle }: FontSizeButtonProps): JSX.Element {
  return (
    <IconButton
      icon="Aa"
      label="Alternar tamanho do texto do editor"
      title="Tamanho do texto"
      onClick={(event) => {
        event.stopPropagation()
        onCycle()
      }}
    />
  )
}
