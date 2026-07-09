import { afterEach, describe, expect, it } from 'vitest'
import { fireEvent, screen } from '@testing-library/preact'
import { showConfirmDialog, showPromptDialog } from './dialogs'

// mountDialog() (dialogs.tsx) portals each dialog into its own <div>
// appended directly to document.body, outside any Preact root that
// @testing-library/preact's cleanup() would know to tear down. Both the
// dialog's own mount effects and its `setTimeout(unmount, 0)` teardown
// need a real macrotask tick to settle — a plain timer wait proved more
// reliable here than testing-library's `waitFor` polling, which raced
// against Preact's own effect-flush timing.
function tick(ms = 20) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

describe('showPromptDialog', () => {
  afterEach(async () => {
    await tick()
  })

  // Regression test: PromptModal's <input> re-renders on every keystroke
  // (handleInput -> setValue), and Modal's onClose prop was previously an
  // inline arrow passed fresh every render — since Modal's focus-trap
  // useEffect depended on `onClose`, every keystroke re-ran the effect and
  // re-focused focusable[0], visibly yanking focus out of the input mid-word.
  it('keeps focus in the input across multiple keystrokes typed one at a time', async () => {
    const resultPromise = showPromptDialog({ title: 'Novo arquivo', label: 'Nome do arquivo' })

    const input = (await screen.findByLabelText('Nome do arquivo')) as HTMLInputElement

    // Let Modal's own initial-mount focus effect settle first (a one-time,
    // legitimate focus() call on open — not the bug) before taking over
    // focus ourselves, simulating the user clicking/tabbing into the field.
    await tick()
    input.focus()
    expect(document.activeElement).toBe(input)

    for (const char of 'teste') {
      fireEvent.input(input, { target: { value: input.value + char } })
      expect(document.activeElement).toBe(input)
    }

    expect(input.value).toBe('teste')

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(await resultPromise).toBeNull()
  })

  it('renders Cancelar on the left and the confirm action on the right', async () => {
    const resultPromise = showPromptDialog({
      title: 'Novo arquivo',
      label: 'Nome do arquivo',
      confirmLabel: 'Criar',
    })

    await screen.findByLabelText('Nome do arquivo')
    const dialogEl = screen.getByRole('dialog')
    const buttons = Array.from(dialogEl.querySelectorAll('button')).filter(
      (btn) => btn.textContent !== '✕',
    )
    const labels = buttons.map((btn) => btn.textContent)

    expect(labels).toEqual(['Cancelar', 'Criar'])

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    await resultPromise
  })
})

describe('showConfirmDialog', () => {
  afterEach(async () => {
    await tick()
  })

  it('renders Cancelar on the left and the confirm/danger action on the right', async () => {
    const resultPromise = showConfirmDialog({
      title: 'Excluir projeto',
      message: 'Tem certeza?',
      confirmLabel: 'Excluir',
    })

    await screen.findByText('Tem certeza?')
    const dialogEl = screen.getByRole('dialog')
    const buttons = Array.from(dialogEl.querySelectorAll('button')).filter(
      (btn) => btn.textContent !== '✕',
    )
    const labels = buttons.map((btn) => btn.textContent)

    expect(labels).toEqual(['Cancelar', 'Excluir'])

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    await resultPromise
  })
})
