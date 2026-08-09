import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/preact'
import { useSidebarDnd, type SidebarDndOptions } from './useSidebarDnd'
import type { DropZone } from './dnd'

// jsdom (as configured by this project's vitest environment) provides a
// real `PointerEvent` constructor and `requestAnimationFrame`, but not
// `Element.setPointerCapture` — the production code already guards that
// call (typeof check + try/catch), which is what keeps this hook testable
// here without a prototype patch.
function pointerEvent(
  type: string,
  init: {
    pointerId?: number
    pointerType?: string
    clientX?: number
    clientY?: number
    isPrimary?: boolean
    button?: number
  } = {},
): PointerEvent {
  return new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    pointerId: init.pointerId ?? 1,
    pointerType: init.pointerType ?? 'mouse',
    isPrimary: init.isPrimary ?? true,
    clientX: init.clientX ?? 0,
    clientY: init.clientY ?? 0,
    button: init.button ?? 0,
  })
}

afterEach(() => {
  cleanup()
  document.body.querySelectorAll('.drag-ghost').forEach((el) => el.remove())
  delete document.body.dataset.dragging
})

// Fixed rects, injected via `measureZones` — the whole point of that
// option, since jsdom has no layout and getBoundingClientRect() always
// returns zeros. Row A occupies y:[0,20), row B y:[20,40), both inside the
// group's y:[0,200). The hook calls this with the mounted root element
// itself, so it queries live from there rather than needing its own ref.
function measureZones(root: HTMLElement): DropZone[] {
  const fileA = root.querySelector('[data-dnd-file="a"]') as HTMLElement
  const fileB = root.querySelector('[data-dnd-file="b"]') as HTMLElement
  const group = root.querySelector('[data-dnd-group="P"]') as HTMLElement
  return [
    {
      kind: 'file',
      project: 'P',
      file: 'a',
      rect: { top: 0, left: 0, right: 100, bottom: 20 },
      el: fileA,
    },
    {
      kind: 'file',
      project: 'P',
      file: 'b',
      rect: { top: 20, left: 0, right: 100, bottom: 40 },
      el: fileB,
    },
    {
      kind: 'group',
      project: 'P',
      archived: false,
      rect: { top: 0, left: 0, right: 100, bottom: 200 },
      el: group,
    },
  ] as unknown as DropZone[]
}

function Harness({
  onMoveFile,
  onMoveProject,
  onDragStart,
  onTap,
  onRowClick,
}: Partial<SidebarDndOptions> & { onRowClick?: () => void }) {
  const { rootRef } = useSidebarDnd({ onMoveFile, onMoveProject, onDragStart, onTap, measureZones })

  return (
    // A <nav>, not a <div>, to match ProjectsSidebar's real root element —
    // its ref type is plain HTMLElement (there's no HTMLNavElement in the
    // DOM spec), same as what useSidebarDnd's rootRef expects.
    <nav ref={rootRef}>
      <div data-dnd-group="P">
        <div className="project-header">
          <span data-dnd-handle="project">handle-project</span>
        </div>
      </div>
      <div
        data-dnd-file="a"
        data-dnd-file-project="P"
        role="button"
        tabIndex={0}
        onClick={onRowClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') onRowClick?.()
        }}
      >
        <span data-dnd-handle="file">handle-a</span>
        row-a
      </div>
      <div data-dnd-file="b" data-dnd-file-project="P">
        <span data-dnd-handle="file">handle-b</span>
        row-b
      </div>
    </nav>
  )
}

function renderHarness(props: Partial<SidebarDndOptions> & { onRowClick?: () => void } = {}) {
  return render(<Harness {...props} />)
}

describe('useSidebarDnd', () => {
  it('press handle, move past the threshold, release over another row: commits the move', async () => {
    const onMoveFile = vi.fn()
    const { container } = renderHarness({ onMoveFile })
    const handleA = container.querySelector('[data-dnd-file="a"] [data-dnd-handle]') as HTMLElement

    fireEvent(handleA, pointerEvent('pointerdown', { clientX: 10, clientY: 10 }))
    fireEvent(handleA, pointerEvent('pointermove', { clientX: 10, clientY: 30 })) // into row B
    fireEvent(handleA, pointerEvent('pointerup', { clientX: 10, clientY: 30 }))

    expect(onMoveFile).toHaveBeenCalledExactlyOnceWith('P', 'a', 'b')
  })

  it('a sub-threshold move never activates: no move is committed', () => {
    const onMoveFile = vi.fn()
    const onDragStart = vi.fn()
    const { container } = renderHarness({ onMoveFile, onDragStart })
    const handleA = container.querySelector('[data-dnd-file="a"] [data-dnd-handle]') as HTMLElement

    fireEvent(handleA, pointerEvent('pointerdown', { clientX: 10, clientY: 10 }))
    fireEvent(handleA, pointerEvent('pointermove', { clientX: 12, clientY: 10 })) // 2px, below threshold
    fireEvent(handleA, pointerEvent('pointerup', { clientX: 12, clientY: 10 }))

    expect(onMoveFile).not.toHaveBeenCalled()
    expect(onDragStart).not.toHaveBeenCalled()
    expect(document.body.dataset.dragging).toBeUndefined()
  })

  it('a subsequent click on the row is suppressed after a committed drag', async () => {
    const onMoveFile = vi.fn()
    const onRowClick = vi.fn()
    const { container } = renderHarness({ onMoveFile, onRowClick })
    const handleA = container.querySelector('[data-dnd-file="a"] [data-dnd-handle]') as HTMLElement
    const rowA = container.querySelector('[data-dnd-file="a"]') as HTMLElement

    fireEvent(handleA, pointerEvent('pointerdown', { clientX: 10, clientY: 10 }))
    fireEvent(handleA, pointerEvent('pointermove', { clientX: 10, clientY: 30 }))
    fireEvent(handleA, pointerEvent('pointerup', { clientX: 10, clientY: 30 }))
    expect(onMoveFile).toHaveBeenCalledOnce()

    fireEvent.click(rowA)
    expect(onRowClick).not.toHaveBeenCalled()
  })

  // Regression note: this predates onTap's addition, when a plain tap truly
  // had no meaning. Now that onTap exists (pick mode's entry point), a tap
  // DOES suppress the following click — see the dedicated onTap tests below,
  // which supersede this one's original assumption. Kept, updated, since a
  // subsequent click still shouldn't ALSO open the file once pick mode is
  // wired up — a bubbled-through click on top of a real onTap call would be
  // a double action.
  it('a plain (never-activated) tap suppresses the next click', () => {
    const onRowClick = vi.fn()
    const { container } = renderHarness({ onRowClick, onMoveFile: vi.fn() })
    const handleA = container.querySelector('[data-dnd-file="a"] [data-dnd-handle]') as HTMLElement
    const rowA = container.querySelector('[data-dnd-file="a"]') as HTMLElement

    fireEvent(handleA, pointerEvent('pointerdown', { clientX: 10, clientY: 10 }))
    fireEvent(handleA, pointerEvent('pointerup', { clientX: 10, clientY: 10 }))

    fireEvent.click(rowA)
    expect(onRowClick).not.toHaveBeenCalled()
  })

  describe('onTap', () => {
    it('fires with the tapped source on a genuine tap (down/up, never crossed the threshold)', () => {
      const onTap = vi.fn()
      const { container } = renderHarness({ onTap, onMoveFile: vi.fn() })
      const handleA = container.querySelector(
        '[data-dnd-file="a"] [data-dnd-handle]',
      ) as HTMLElement

      fireEvent(handleA, pointerEvent('pointerdown', { clientX: 10, clientY: 10 }))
      fireEvent(handleA, pointerEvent('pointerup', { clientX: 10, clientY: 10 }))

      expect(onTap).toHaveBeenCalledExactlyOnceWith({ kind: 'file', project: 'P', file: 'a' })
    })

    it('does not fire when the gesture became a real drag and committed', () => {
      const onTap = vi.fn()
      const { container } = renderHarness({ onTap, onMoveFile: vi.fn() })
      const handleA = container.querySelector(
        '[data-dnd-file="a"] [data-dnd-handle]',
      ) as HTMLElement

      fireEvent(handleA, pointerEvent('pointerdown', { clientX: 10, clientY: 10 }))
      fireEvent(handleA, pointerEvent('pointermove', { clientX: 10, clientY: 30 }))
      fireEvent(handleA, pointerEvent('pointerup', { clientX: 10, clientY: 30 }))

      expect(onTap).not.toHaveBeenCalled()
    })

    it('does not fire on pointercancel (neither pre-activation nor mid-drag)', async () => {
      const onTap = vi.fn()
      const { container } = renderHarness({ onTap, onMoveFile: vi.fn() })
      const handleA = container.querySelector(
        '[data-dnd-file="a"] [data-dnd-handle]',
      ) as HTMLElement

      // Cancel before ever crossing the threshold.
      fireEvent(handleA, pointerEvent('pointerdown', { clientX: 10, clientY: 10 }))
      fireEvent(handleA, pointerEvent('pointercancel', { clientX: 10, clientY: 10 }))
      expect(onTap).not.toHaveBeenCalled()

      // Cancel mid-drag.
      fireEvent(handleA, pointerEvent('pointerdown', { clientX: 10, clientY: 10 }))
      fireEvent(handleA, pointerEvent('pointermove', { clientX: 10, clientY: 30 }))
      await waitFor(() => expect(document.body.dataset.dragging).toBe('true'))
      fireEvent(handleA, pointerEvent('pointercancel', { clientX: 10, clientY: 30 }))
      expect(onTap).not.toHaveBeenCalled()
    })

    it('fires for a tap on the project handle too, with a project-kind source', () => {
      const onTap = vi.fn()
      const { container } = renderHarness({ onTap, onMoveProject: vi.fn() })
      const handleProject = container.querySelector('[data-dnd-handle="project"]') as HTMLElement

      fireEvent(handleProject, pointerEvent('pointerdown', { clientX: 10, clientY: 10 }))
      fireEvent(handleProject, pointerEvent('pointerup', { clientX: 10, clientY: 10 }))

      expect(onTap).toHaveBeenCalledExactlyOnceWith({ kind: 'project', project: 'P' })
    })
  })

  it('pointercancel mid-drag aborts: no move, no leftover dragging state or ghost', async () => {
    const onMoveFile = vi.fn()
    const { container } = renderHarness({ onMoveFile })
    const handleA = container.querySelector('[data-dnd-file="a"] [data-dnd-handle]') as HTMLElement

    fireEvent(handleA, pointerEvent('pointerdown', { clientX: 10, clientY: 10 }))
    fireEvent(handleA, pointerEvent('pointermove', { clientX: 10, clientY: 30 }))
    await waitFor(() => expect(document.body.dataset.dragging).toBe('true'))

    fireEvent(handleA, pointerEvent('pointercancel', { clientX: 10, clientY: 30 }))

    expect(onMoveFile).not.toHaveBeenCalled()
    expect(document.body.dataset.dragging).toBeUndefined()
    expect(document.querySelector('.drag-ghost')).toBeNull()
  })

  // Regression test: the ghost is a cloneNode(true) of the real row, and
  // originally kept its data-dnd-* attributes verbatim — a query for
  // "[data-dnd-file='a']" then matched both the live row (inside
  // `container`) AND the ghost (appended to document.body), a strict-mode
  // violation Playwright caught first in e2e/sidebar-reorder-touch.spec.ts.
  it("the ghost carries none of the source row's data-dnd-* identity attributes", async () => {
    const { container } = renderHarness({ onMoveFile: vi.fn() })
    const handleA = container.querySelector('[data-dnd-file="a"] [data-dnd-handle]') as HTMLElement

    fireEvent(handleA, pointerEvent('pointerdown', { clientX: 10, clientY: 10 }))
    fireEvent(handleA, pointerEvent('pointermove', { clientX: 10, clientY: 30 }))
    await waitFor(() => expect(document.body.dataset.dragging).toBe('true'))

    const ghost = document.querySelector('.drag-ghost')
    expect(ghost).not.toBeNull()
    expect(ghost?.hasAttribute('data-dnd-file')).toBe(false)
    expect(ghost?.hasAttribute('data-dnd-file-project')).toBe(false)
    expect(ghost?.querySelector('[data-dnd-handle]')).toBeNull()
    // The real row must still be the only element matching this query.
    expect(document.querySelectorAll('[data-dnd-file="a"]')).toHaveLength(1)

    fireEvent(handleA, pointerEvent('pointercancel', { clientX: 10, clientY: 30 }))
  })

  it('Escape mid-drag aborts the same way as pointercancel', async () => {
    const onMoveFile = vi.fn()
    const { container } = renderHarness({ onMoveFile })
    const handleA = container.querySelector('[data-dnd-file="a"] [data-dnd-handle]') as HTMLElement

    fireEvent(handleA, pointerEvent('pointerdown', { clientX: 10, clientY: 10 }))
    fireEvent(handleA, pointerEvent('pointermove', { clientX: 10, clientY: 30 }))
    await waitFor(() => expect(document.body.dataset.dragging).toBe('true'))

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onMoveFile).not.toHaveBeenCalled()
    expect(document.body.dataset.dragging).toBeUndefined()
    expect(document.querySelector('.drag-ghost')).toBeNull()
  })

  it('unmounting mid-drag removes the ghost and leaves no dangling state', async () => {
    const onMoveFile = vi.fn()
    const { container, unmount } = renderHarness({ onMoveFile })
    const handleA = container.querySelector('[data-dnd-file="a"] [data-dnd-handle]') as HTMLElement

    fireEvent(handleA, pointerEvent('pointerdown', { clientX: 10, clientY: 10 }))
    fireEvent(handleA, pointerEvent('pointermove', { clientX: 10, clientY: 30 }))
    await waitFor(() => expect(document.body.dataset.dragging).toBe('true'))

    unmount()

    expect(document.body.dataset.dragging).toBeUndefined()
    expect(document.querySelector('.drag-ghost')).toBeNull()
    expect(onMoveFile).not.toHaveBeenCalled()
  })

  it('activating a drag calls onDragStart (closes any open "..." menu)', async () => {
    const onDragStart = vi.fn()
    const { container } = renderHarness({ onMoveFile: vi.fn(), onDragStart })
    const handleA = container.querySelector('[data-dnd-file="a"] [data-dnd-handle]') as HTMLElement

    fireEvent(handleA, pointerEvent('pointerdown', { clientX: 10, clientY: 10 }))
    expect(onDragStart).not.toHaveBeenCalled()
    fireEvent(handleA, pointerEvent('pointermove', { clientX: 10, clientY: 30 }))

    expect(onDragStart).toHaveBeenCalledOnce()
  })

  it('the project handle drag calls onMoveProject, not onMoveFile', () => {
    const onMoveFile = vi.fn()
    const onMoveProject = vi.fn()
    const { container } = renderHarness({ onMoveFile, onMoveProject })
    const handleProject = container.querySelector('[data-dnd-handle="project"]') as HTMLElement

    // Dropped back onto the same group's own zone (the only group present)
    // — kind mismatch (project source over a group hit by a project) still
    // resolves to a project-move intent in dnd.ts's table.
    fireEvent(handleProject, pointerEvent('pointerdown', { clientX: 10, clientY: 10 }))
    fireEvent(handleProject, pointerEvent('pointermove', { clientX: 10, clientY: 150 }))
    fireEvent(handleProject, pointerEvent('pointerup', { clientX: 10, clientY: 150 }))

    expect(onMoveFile).not.toHaveBeenCalled()
    // Dropping a project onto itself resolves to `beforeProject: 'P'` per
    // dnd.ts's table (there's only one project zone in this harness); the
    // model layer (untouched by this hook) is what actually no-ops a
    // project dropped onto itself — this test only asserts the hook wires
    // the call through with the right shape.
    expect(onMoveProject).toHaveBeenCalledExactlyOnceWith('P', 'P')
  })

  it('does not start a gesture when the matching handler was not provided', () => {
    const onMoveProject = vi.fn()
    // onMoveFile omitted — the file handle must not even be tracked.
    const { container } = renderHarness({ onMoveProject })
    const handleA = container.querySelector('[data-dnd-file="a"] [data-dnd-handle]') as HTMLElement

    fireEvent(handleA, pointerEvent('pointerdown', { clientX: 10, clientY: 10 }))
    fireEvent(handleA, pointerEvent('pointermove', { clientX: 10, clientY: 30 }))
    fireEvent(handleA, pointerEvent('pointerup', { clientX: 10, clientY: 30 }))

    expect(document.body.dataset.dragging).toBeUndefined()
  })
})
