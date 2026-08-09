// The DOM/Preact glue for the sidebar's pointer-based drag & drop (issue:
// mobile DnD) — the only file in this rewrite that touches the DOM
// directly. Pure gesture math lives in `src/lib/dragGesture.ts`; pure drop
// semantics live in `./dnd.ts`. This hook wires real pointer events and
// measured element rects into both, and applies the result imperatively
// (never through Preact state) — see the `data-drop-target` note below for
// why that matters.
import { useEffect, useRef } from 'preact/hooks'
import {
  autoScrollDelta,
  gestureReducer,
  type GestureState,
  type Point,
  type Rect,
} from '@/lib/dragGesture'
import {
  applyDropIntent,
  resolveDropIntent,
  type DragSource,
  type DropIntent,
  type DropZone,
} from './dnd'

export interface SidebarDndOptions {
  onMoveFile?: (projectName: string, fileName: string, beforeFile?: string | null) => void
  onMoveProject?: (projectName: string, beforeProject?: string | null) => void
  /** Called the moment a gesture activates (crosses the drag threshold) — closes any open "..." menu, since a floating menu's pre-computed position has nothing to do with an in-progress drag. */
  onDragStart?: () => void
  /** Test seam: the real DOM default reads `getBoundingClientRect()`; a test injects fixed rects instead, since jsdom has no layout. */
  measureZones?: (root: HTMLElement) => DropZone[]
}

export interface SidebarDndControls {
  /** Attach to the sidebar's root element (delegates one `pointerdown` listener). */
  rootRef: { current: HTMLElement | null }
}

type MeasuredZone = DropZone & { el: HTMLElement }

function toRect(domRect: DOMRect): Rect {
  return { top: domRect.top, left: domRect.left, right: domRect.right, bottom: domRect.bottom }
}

function isZeroArea(r: Rect): boolean {
  return r.right <= r.left || r.bottom <= r.top
}

function defaultMeasureZones(root: HTMLElement): MeasuredZone[] {
  // Files-first, then groups — see dnd.ts's resolveDropIntent doc comment
  // on why this order (not plain DOM/document order, which would put a
  // group BEFORE the file rows nested inside it) is what gives a file row
  // priority over its own enclosing group.
  const zones: MeasuredZone[] = []
  for (const el of Array.from(root.querySelectorAll<HTMLElement>('[data-dnd-file]'))) {
    const rect = toRect(el.getBoundingClientRect())
    // A collapsed project's rows are `display: none` and measure to
    // nothing — without this they'd sit at the viewport origin and
    // swallow drops there instead of being invisible to hit-testing.
    if (isZeroArea(rect)) continue
    const project = el.dataset.dndFileProject
    const file = el.dataset.dndFile
    if (!project || !file) continue
    zones.push({ kind: 'file', project, file, rect, el })
  }
  for (const el of Array.from(root.querySelectorAll<HTMLElement>('[data-dnd-group]'))) {
    const rect = toRect(el.getBoundingClientRect())
    if (isZeroArea(rect)) continue
    const project = el.dataset.dndGroup
    if (!project) continue
    zones.push({ kind: 'group', project, archived: el.dataset.dndArchived === '1', rect, el })
  }
  return zones
}

/**
 * Maps a resolved intent back to the zone/element it came from, so the
 * caller knows what to highlight. A file's `DropIntent` no longer carries
 * a target project (moving a file to a different project is a removed
 * feature — see CHANGELOG; the only valid target is the source file's own
 * project), so `source` supplies it here instead.
 */
function findHighlightZone(
  zones: readonly MeasuredZone[],
  intent: DropIntent | null,
  source: DragSource,
): MeasuredZone | null {
  if (!intent) return null
  if (intent.kind === 'project') {
    return zones.find((z) => z.kind === 'group' && z.project === intent.beforeProject) ?? null
  }
  if (source.kind !== 'file') return null
  if (intent.beforeFile !== null) {
    return (
      zones.find(
        (z) => z.kind === 'file' && z.project === source.project && z.file === intent.beforeFile,
      ) ?? null
    )
  }
  return zones.find((z) => z.kind === 'group' && z.project === source.project) ?? null
}

function resolveSource(handleEl: HTMLElement): { source: DragSource; rowEl: HTMLElement } | null {
  const kind = handleEl.dataset.dndHandle
  if (kind === 'file') {
    const rowEl = handleEl.closest<HTMLElement>('[data-dnd-file]')
    const project = rowEl?.dataset.dndFileProject
    const file = rowEl?.dataset.dndFile
    if (!rowEl || !project || !file) return null
    return { source: { kind: 'file', project, file }, rowEl }
  }
  if (kind === 'project') {
    const groupEl = handleEl.closest<HTMLElement>('[data-dnd-group]')
    const project = groupEl?.dataset.dndGroup
    if (!groupEl || !project) return null
    // The header (not the whole group) is what the handle sits in and
    // what should ghost — cloning the entire group would drag-preview the
    // full file list too.
    const headerEl = handleEl.closest<HTMLElement>('.project-header') ?? groupEl
    return { source: { kind: 'project', project }, rowEl: headerEl }
  }
  return null
}

function installClickSuppressor(): void {
  function handler(e: MouseEvent) {
    e.stopPropagation()
    e.preventDefault()
    document.removeEventListener('click', handler, true)
  }
  document.addEventListener('click', handler, true)
  // Belt-and-braces: if no click ever arrives (e.g. the release landed
  // somewhere that doesn't synthesize one), don't leave this armed forever.
  setTimeout(() => document.removeEventListener('click', handler, true), 0)
}

export function useSidebarDnd(options: SidebarDndOptions): SidebarDndControls {
  const rootRef = useRef<HTMLElement | null>(null)
  const optionsRef = useRef(options)
  optionsRef.current = options

  // Everything about an in-progress gesture lives in refs, not state — a
  // pointermove firing a re-render every frame is exactly what this
  // rewrite avoids (see the file-level comment on data-drop-target).
  const gestureStateRef = useRef<GestureState>({ phase: 'idle' })
  const sourceRef = useRef<DragSource | null>(null)
  const rowElRef = useRef<HTMLElement | null>(null)
  const handleElRef = useRef<HTMLElement | null>(null)
  const zonesRef = useRef<MeasuredZone[]>([])
  const lastPointRef = useRef<Point>({ x: 0, y: 0 })
  const ghostElRef = useRef<HTMLElement | null>(null)
  const highlightedElRef = useRef<HTMLElement | null>(null)
  const rafRef = useRef<number | null>(null)
  const autoScrollRafRef = useRef<number | null>(null)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return

    function measure(): MeasuredZone[] {
      if (!root) return []
      const zones = (optionsRef.current.measureZones?.(root) ??
        defaultMeasureZones(root)) as MeasuredZone[]
      zonesRef.current = zones
      return zones
    }

    function setHighlight(el: HTMLElement | null) {
      if (highlightedElRef.current === el) return
      if (highlightedElRef.current) delete highlightedElRef.current.dataset.dropTarget
      if (el) el.dataset.dropTarget = 'true'
      highlightedElRef.current = el
    }

    function scheduleRender() {
      if (rafRef.current !== null) return
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null
        const source = sourceRef.current
        if (!source || gestureStateRef.current.phase !== 'dragging') return
        const point = lastPointRef.current
        if (ghostElRef.current) {
          ghostElRef.current.style.transform = `translate3d(${point.x}px, ${point.y}px, 0)`
        }
        const intent = resolveDropIntent(zonesRef.current, point, source)
        setHighlight(findHighlightZone(zonesRef.current, intent, source)?.el ?? null)
      })
    }

    function scrollContainer(): HTMLElement | null {
      return root?.querySelector<HTMLElement>('[data-dnd-scroll]') ?? null
    }

    // Cached scroll-container metrics, refreshed at activation and on the
    // container's own `scroll` event — NOT read fresh on every pointermove.
    // `autoScrollDelta` is pure arithmetic once it has a rect, so checking
    // "is the pointer even near an edge" against this cache costs nothing;
    // reading it via `getBoundingClientRect()` on every pointermove (a
    // forced synchronous layout) — which an unconditional per-move
    // re-arming of the auto-scroll rAF loop used to do even far from any
    // edge — does not.
    let containerMetrics: {
      top: number
      bottom: number
      scrollTop: number
      scrollHeight: number
      clientHeight: number
    } | null = null

    function refreshContainerMetrics() {
      const container = scrollContainer()
      if (!container) {
        containerMetrics = null
        return
      }
      const rect = container.getBoundingClientRect()
      containerMetrics = {
        top: rect.top,
        bottom: rect.bottom,
        scrollTop: container.scrollTop,
        scrollHeight: container.scrollHeight,
        clientHeight: container.clientHeight,
      }
    }

    function pendingAutoScrollDelta(): number {
      return containerMetrics ? autoScrollDelta(lastPointRef.current.y, containerMetrics) : 0
    }

    // Set right before a `scrollTop` write this hook makes itself, so the
    // `scroll` event that write fires doesn't make `handleScroll` redo the
    // exact `measure()`/`scheduleRender()` pair `tickAutoScroll` already
    // just did for the same visual change.
    let suppressNextScrollHandler = false

    function tickAutoScroll() {
      autoScrollRafRef.current = null
      if (gestureStateRef.current.phase !== 'dragging') return
      const delta = pendingAutoScrollDelta()
      if (delta === 0) return
      const container = scrollContainer()
      if (!container) return
      suppressNextScrollHandler = true
      container.scrollTop += delta
      if (containerMetrics) containerMetrics.scrollTop = container.scrollTop
      measure()
      scheduleRender()
      autoScrollRafRef.current = requestAnimationFrame(tickAutoScroll)
    }

    // Attributes stripped from the ghost and every descendant it cloned —
    // a purely visual copy must carry none of the real row's identity, or
    // it duplicate-matches any `[data-dnd-*]`/id query the moment it lands
    // in the DOM (it's appended to document.body, outside the sidebar
    // root `measureZones` scopes to, so it can't corrupt hit-testing
    // itself — but nothing else querying by these attributes can tell it
    // apart from the real row otherwise).
    const GHOST_STRIP_ATTRS = [
      'id',
      'data-dnd-file',
      'data-dnd-file-project',
      'data-dnd-group',
      'data-dnd-archived',
      'data-dnd-handle',
      'data-drop-target',
    ]

    function stripIdentity(el: Element) {
      for (const attr of GHOST_STRIP_ATTRS) el.removeAttribute(attr)
    }

    function createGhost(rowEl: HTMLElement) {
      const rect = rowEl.getBoundingClientRect()
      const ghost = rowEl.cloneNode(true) as HTMLElement
      stripIdentity(ghost)
      for (const el of Array.from(ghost.querySelectorAll('*'))) stripIdentity(el)
      ghost.className = `${rowEl.className} drag-ghost`
      ghost.style.position = 'fixed'
      ghost.style.top = '0'
      ghost.style.left = '0'
      ghost.style.width = `${rect.width}px`
      ghost.style.pointerEvents = 'none'
      ghost.style.zIndex = '1000'
      ghost.style.opacity = '0.9'
      ghost.style.willChange = 'transform'
      ghost.style.transform = `translate3d(${lastPointRef.current.x}px, ${lastPointRef.current.y}px, 0)`
      // Appended to document.body, not inside the sidebar: .projects-sidebar
      // is overflow:hidden and, when hidden on mobile, transformed — a
      // transformed ancestor becomes the containing block for a `position:
      // fixed` descendant, which would clip/mis-position the ghost in the
      // mobile drawer.
      document.body.appendChild(ghost)
      ghostElRef.current = ghost
    }

    function removeGhost() {
      ghostElRef.current?.remove()
      ghostElRef.current = null
    }

    function endDrag(committed: boolean) {
      // Not derived from gestureStateRef.current.phase here — by the time
      // endDrag runs, the caller (handlePointerUp/Cancel) has already
      // applied the reducer's transition to 'idle', so that phase would
      // always read as "not dragging". The ghost's existence is a reliable
      // proxy instead: it's created exactly once, at activation, and
      // nowhere else.
      const wasDragging = ghostElRef.current !== null
      const source = sourceRef.current
      if (committed && wasDragging && source) {
        const intent = resolveDropIntent(zonesRef.current, lastPointRef.current, source)
        if (intent) {
          applyDropIntent(intent, source, {
            onMoveFile: optionsRef.current.onMoveFile,
            onMoveProject: optionsRef.current.onMoveProject,
          })
        }
      }

      if (wasDragging) installClickSuppressor()

      setHighlight(null)
      removeGhost()
      delete document.body.dataset.dragging
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      if (autoScrollRafRef.current !== null) {
        cancelAnimationFrame(autoScrollRafRef.current)
        autoScrollRafRef.current = null
      }

      const handleEl = handleElRef.current
      if (handleEl) {
        handleEl.removeEventListener('pointermove', handlePointerMove)
        handleEl.removeEventListener('pointerup', handlePointerUp)
        handleEl.removeEventListener('pointercancel', handlePointerCancel)
        handleEl.removeEventListener('lostpointercapture', handlePointerCancel)
      }
      window.removeEventListener('blur', handleWindowBlur)
      document.removeEventListener('keydown', handleKeyDown, true)
      const container = scrollContainer()
      container?.removeEventListener('scroll', handleScroll)

      gestureStateRef.current = { phase: 'idle' }
      sourceRef.current = null
      rowElRef.current = null
      handleElRef.current = null
      zonesRef.current = []
    }

    function handlePointerMove(e: PointerEvent) {
      const point = { x: e.clientX, y: e.clientY }
      lastPointRef.current = point
      const result = gestureReducer(gestureStateRef.current, {
        type: 'move',
        pointerId: e.pointerId,
        point,
      })
      gestureStateRef.current = result.state
      if (result.effect === 'activate') {
        optionsRef.current.onDragStart?.()
        document.body.dataset.dragging = 'true'
        const rowEl = rowElRef.current
        if (rowEl) createGhost(rowEl)
        measure()
        refreshContainerMetrics()
      }
      if (result.state.phase === 'dragging') {
        scheduleRender()
        // Cheap (cached-metrics) proximity check before arming the rAF
        // loop at all — see pendingAutoScrollDelta's doc comment. Only a
        // pointer actually near an edge pays for the loop; every other
        // pointermove during the drag (the common case) does not.
        if (autoScrollRafRef.current === null && pendingAutoScrollDelta() !== 0) {
          autoScrollRafRef.current = requestAnimationFrame(tickAutoScroll)
        }
      }
    }

    function handlePointerUp(e: PointerEvent) {
      const result = gestureReducer(gestureStateRef.current, { type: 'up', pointerId: e.pointerId })
      gestureStateRef.current = result.state
      if (result.effect === 'commit') endDrag(true)
      else if (result.effect === 'abort') endDrag(false)
    }

    function handlePointerCancel(e: PointerEvent) {
      const result = gestureReducer(gestureStateRef.current, {
        type: 'cancel',
        pointerId: e.pointerId,
      })
      gestureStateRef.current = result.state
      if (result.effect === 'abort') endDrag(false)
    }

    function handleWindowBlur() {
      endDrag(false)
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && gestureStateRef.current.phase !== 'idle') {
        endDrag(false)
      }
    }

    function handleScroll() {
      if (suppressNextScrollHandler) {
        suppressNextScrollHandler = false
        return
      }
      if (gestureStateRef.current.phase !== 'dragging') return
      refreshContainerMetrics()
      measure()
      scheduleRender()
    }

    function handlePointerDown(e: PointerEvent) {
      // Only one gesture tracked at a time — a second finger touching down
      // mid-drag must not hijack or restart tracking.
      if (gestureStateRef.current.phase !== 'idle') return
      if (!e.isPrimary) return
      if (e.pointerType === 'mouse' && e.button !== 0) return

      const target = e.target
      if (!(target instanceof Element)) return
      const handleEl = target.closest<HTMLElement>('[data-dnd-handle]')
      if (!handleEl || !root?.contains(handleEl)) return

      const resolved = resolveSource(handleEl)
      if (!resolved) return
      const { source, rowEl } = resolved
      if (source.kind === 'file' && !optionsRef.current.onMoveFile) return
      if (source.kind === 'project' && !optionsRef.current.onMoveProject) return

      e.preventDefault()

      if (typeof handleEl.setPointerCapture === 'function') {
        try {
          handleEl.setPointerCapture(e.pointerId)
        } catch {
          // Some environments (older browsers, jsdom) don't support
          // capture — the gesture still works via document-level fallback
          // event delivery, just without retargeting guarantees.
        }
      }

      sourceRef.current = source
      rowElRef.current = rowEl
      handleElRef.current = handleEl
      lastPointRef.current = { x: e.clientX, y: e.clientY }

      const result = gestureReducer(gestureStateRef.current, {
        type: 'down',
        pointerId: e.pointerId,
        point: lastPointRef.current,
      })
      gestureStateRef.current = result.state

      handleEl.addEventListener('pointermove', handlePointerMove)
      handleEl.addEventListener('pointerup', handlePointerUp)
      handleEl.addEventListener('pointercancel', handlePointerCancel)
      handleEl.addEventListener('lostpointercapture', handlePointerCancel)
      window.addEventListener('blur', handleWindowBlur)
      document.addEventListener('keydown', handleKeyDown, true)
      scrollContainer()?.addEventListener('scroll', handleScroll)
    }

    root.addEventListener('pointerdown', handlePointerDown)

    return () => {
      root.removeEventListener('pointerdown', handlePointerDown)
      // Unmounting mid-drag: tear down exactly like an abort, so no ghost,
      // listener, or body attribute is left behind.
      if (gestureStateRef.current.phase !== 'idle') endDrag(false)
    }
  }, [])

  return { rootRef }
}
