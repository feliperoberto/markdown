import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/preact'
import { FileRow } from './FileRow'
import type { ProjectFile } from './types'

// FileRow itself doesn't decide when the "..." trigger is visible — that's
// a CSS rule keyed off `.file-menu-trigger`/`.active` (see global.css and
// e2e/file-row-actions.spec.ts, which asserts the actual visibility since
// jsdom never applies the stylesheet). This file only locks the JSX/state
// half: the trigger carries the CSS hook, and the row carries `active`
// only when it actually is, so that CSS rule has something correct to key
// off of in the first place.
afterEach(() => {
  cleanup()
})

function makeFile(overrides: Partial<ProjectFile> = {}): ProjectFile {
  return {
    name: 'notes',
    content: '',
    size: 0,
    timestamp: new Date().toISOString(),
    ...overrides,
  }
}

function renderRow(overrides: Partial<Parameters<typeof FileRow>[0]> = {}) {
  return render(
    <FileRow
      projectName="Project"
      file={makeFile()}
      isActive={false}
      isSelected={false}
      isArchived={false}
      fileNames={['notes']}
      visibleFileNames={['notes']}
      onSelectFile={vi.fn()}
      isMenuOpen={false}
      onOpenMenu={vi.fn()}
      onCloseMenu={vi.fn()}
      onToggleSelected={vi.fn()}
      onRenameFile={vi.fn()}
      onDeleteFile={vi.fn()}
      {...overrides}
    />,
  )
}

// The row's accessible name is computed from its descendants' content
// (checkbox label, filename, timestamp), so it isn't a stable "notes"
// match — the row is selected by its own class instead.
function getRow(container: Element): HTMLElement {
  const row = container.querySelector('.file-item')
  if (!row) throw new Error('.file-item not found')
  return row as HTMLElement
}

describe('FileRow', () => {
  it('the "..." trigger carries the file-menu-trigger CSS hook', () => {
    renderRow()
    const trigger = screen.getByRole('button', { name: 'Mais opções do arquivo notes' })
    expect(trigger.className).toContain('file-menu-trigger')
  })

  it('the row carries "active" only when it is the active file', () => {
    const { container, rerender } = renderRow({ isActive: false })
    expect(getRow(container).classList.contains('active')).toBe(false)

    rerender(
      <FileRow
        projectName="Project"
        file={makeFile()}
        isActive={true}
        isSelected={false}
        isArchived={false}
        fileNames={['notes']}
        visibleFileNames={['notes']}
        onSelectFile={vi.fn()}
        isMenuOpen={false}
        onOpenMenu={vi.fn()}
        onCloseMenu={vi.fn()}
        onToggleSelected={vi.fn()}
        onRenameFile={vi.fn()}
        onDeleteFile={vi.fn()}
      />,
    )
    expect(getRow(container).classList.contains('active')).toBe(true)
  })

  it('clicking the row opens the file', () => {
    const onSelectFile = vi.fn()
    const { container } = renderRow({ onSelectFile })
    fireEvent.click(getRow(container))
    expect(onSelectFile).toHaveBeenCalledWith('Project', 'notes')
  })
})
