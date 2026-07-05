import { describe, expect, it } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/preact'
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
  it('renders sanitized preview HTML derived from what the user types in the editor', () => {
    render(<Harness />)

    const textarea = screen.getByPlaceholderText(
      /Comece a escrever em Markdown/,
    ) as HTMLTextAreaElement
    fireEvent.input(textarea, { target: { value: '# Hello world' } })

    expect(textarea.value).toBe('# Hello world')

    const preview = document.getElementById('preview')
    expect(preview).not.toBeNull()
    expect(preview?.innerHTML).toContain('<h1>Hello world</h1>')
  })
})
