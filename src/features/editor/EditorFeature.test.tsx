import { afterEach, describe, expect, it } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/preact'
import { useState } from 'preact/hooks'
import { EditorFeature } from './EditorFeature'

/**
 * Thin harness reproducing how `EditorFeature` is actually consumed (a
 * controlled `content`/`onContentChange` pair owned by a parent), so the
 * test exercises the real "type in editor → preview updates" data flow
 * instead of a hook-less snapshot of a single render.
 */
function Harness() {
  const [content, setContent] = useState('')
  return <EditorFeature content={content} onContentChange={setContent} />
}

describe('EditorFeature', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders sanitized preview HTML derived from what the user types in the editor', () => {
    render(<Harness />)

    const textarea = screen.getByPlaceholderText(
      /Comece a escrever em Markdown/,
    ) as HTMLTextAreaElement
    fireEvent.input(textarea, { target: { value: '# Hello world' } })

    expect(textarea.value).toBe('# Hello world')

    // The preview is only actually parsed+sanitized once the preview pane
    // is visible (a perf fix: rendering markdown while the pane is hidden
    // in edit view was pure wasted work on every keystroke) — switch to
    // the "Resultado" tab to observe it.
    fireEvent.click(screen.getByRole('button', { name: 'Resultado' }))

    const preview = document.getElementById('preview')
    expect(preview).not.toBeNull()
    expect(preview?.innerHTML).toContain('<h1>Hello world</h1>')
  })

  it('does not parse/sanitize the content while the preview pane is hidden (edit view)', () => {
    render(<Harness />)

    const textarea = screen.getByPlaceholderText(
      /Comece a escrever em Markdown/,
    ) as HTMLTextAreaElement
    fireEvent.input(textarea, { target: { value: '# Hello world' } })

    const preview = document.getElementById('preview')
    expect(preview?.innerHTML).toBe('')
  })
})
