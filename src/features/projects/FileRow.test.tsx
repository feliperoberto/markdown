import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/preact'
import { FileRow } from './FileRow'
import type { ProjectFile } from './types'
import type { DragSource } from './dnd'

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
      pickedItem={null}
      onTapHandle={vi.fn()}
      onRowActivateWhilePicked={vi.fn()}
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
        pickedItem={null}
        onTapHandle={vi.fn()}
        onRowActivateWhilePicked={vi.fn()}
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

  describe('drag handle / pick mode', () => {
    function getHandle(container: Element): HTMLElement {
      const handle = container.querySelector('[data-dnd-handle="file"]')
      if (!handle) throw new Error('[data-dnd-handle="file"] not found')
      return handle as HTMLElement
    }

    it('renders no handle when onMoveFile is not provided', () => {
      const { container } = renderRow({ onMoveFile: undefined })
      expect(container.querySelector('[data-dnd-handle="file"]')).toBeNull()
    })

    it('renders a focusable handle with the unpicked aria-label when onMoveFile is provided', () => {
      const { container } = renderRow({ onMoveFile: vi.fn() })
      const handle = getHandle(container)
      expect(handle.getAttribute('role')).toBe('button')
      expect(handle.getAttribute('tabindex')).toBe('0')
      expect(handle.getAttribute('aria-pressed')).toBe('false')
      expect(handle.getAttribute('aria-label')).toBe('Mover arquivo notes')
    })

    it('shows the picked aria-label/aria-pressed when this file is the pickedItem', () => {
      const pickedItem: DragSource = { kind: 'file', project: 'Project', file: 'notes' }
      const { container } = renderRow({ onMoveFile: vi.fn(), pickedItem })
      const handle = getHandle(container)
      expect(handle.getAttribute('aria-pressed')).toBe('true')
      expect(handle.getAttribute('aria-label')).toContain('selecionado para mover')
    })

    it('does not show picked state for a different file', () => {
      const pickedItem: DragSource = { kind: 'file', project: 'Project', file: 'other' }
      const { container } = renderRow({ onMoveFile: vi.fn(), pickedItem })
      const handle = getHandle(container)
      expect(handle.getAttribute('aria-pressed')).toBe('false')
    })

    it('Enter on the handle calls onTapHandle with this file source', () => {
      const onTapHandle = vi.fn()
      const { container } = renderRow({ onMoveFile: vi.fn(), onTapHandle })
      fireEvent.keyDown(getHandle(container), { key: 'Enter' })
      expect(onTapHandle).toHaveBeenCalledWith({ kind: 'file', project: 'Project', file: 'notes' })
    })

    it('Space on the handle calls onTapHandle with this file source', () => {
      const onTapHandle = vi.fn()
      const { container } = renderRow({ onMoveFile: vi.fn(), onTapHandle })
      fireEvent.keyDown(getHandle(container), { key: ' ' })
      expect(onTapHandle).toHaveBeenCalledWith({ kind: 'file', project: 'Project', file: 'notes' })
    })

    it('Arrow Down while picked calls onMoveFile with the next visible file as beforeFile', () => {
      const onMoveFile = vi.fn()
      const pickedItem: DragSource = { kind: 'file', project: 'Project', file: 'notes' }
      const { container } = renderRow({
        onMoveFile,
        pickedItem,
        visibleFileNames: ['notes', 'other'],
        fileNames: ['notes', 'other'],
      })
      fireEvent.keyDown(getHandle(container), { key: 'ArrowDown' })
      expect(onMoveFile).toHaveBeenCalledWith('Project', 'notes', null)
    })

    it('Arrow Up/Down while NOT picked does nothing', () => {
      const onMoveFile = vi.fn()
      const { container } = renderRow({ onMoveFile, pickedItem: null })
      fireEvent.keyDown(getHandle(container), { key: 'ArrowDown' })
      fireEvent.keyDown(getHandle(container), { key: 'ArrowUp' })
      expect(onMoveFile).not.toHaveBeenCalled()
    })

    it('clicking the row while something is picked calls onRowActivateWhilePicked instead of onSelectFile', () => {
      const onSelectFile = vi.fn()
      const onRowActivateWhilePicked = vi.fn()
      const pickedItem: DragSource = { kind: 'file', project: 'Project', file: 'other' }
      const { container } = renderRow({
        onMoveFile: vi.fn(),
        onSelectFile,
        onRowActivateWhilePicked,
        pickedItem,
      })
      fireEvent.click(getRow(container))
      expect(onSelectFile).not.toHaveBeenCalled()
      expect(onRowActivateWhilePicked).toHaveBeenCalledWith({
        kind: 'file',
        project: 'Project',
        file: 'notes',
      })
    })

    it('renders data-drop-target when this row is a legal target for the current pick', () => {
      const pickedItem: DragSource = { kind: 'file', project: 'Project', file: 'other' }
      const { container } = renderRow({ onMoveFile: vi.fn(), pickedItem })
      expect(getRow(container).getAttribute('data-drop-target')).toBe('true')
    })

    it('does not render data-drop-target when nothing is picked', () => {
      const { container } = renderRow({ onMoveFile: vi.fn(), pickedItem: null })
      expect(getRow(container).getAttribute('data-drop-target')).toBeNull()
    })
  })
})
