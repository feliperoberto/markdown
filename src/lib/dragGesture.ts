// Pure, DOM-free drag-gesture primitives shared by the projects sidebar's
// pointer-based drag & drop (issue: HTML5 Drag-and-Drop never fires from a
// touch gesture, so reordering was desktop/mouse only). Kept here rather
// than in `src/features/projects/` because none of it is projects-specific
// — it's just "how does a press-move-release sequence become a drag", the
// same math any pointer-driven reorder UI would need. The DOM/Preact glue
// that turns these into a real gesture (src/features/projects/
// useSidebarDnd.ts) is deliberately a separate, thin layer: everything
// interesting here is testable with plain numbers, no jsdom layout involved.

export interface Point {
  x: number
  y: number
}

export interface Rect {
  top: number
  left: number
  right: number
  bottom: number
}

/**
 * Distance (Chebyshev — max of the two axes) a pointer must travel from its
 * down-point before a press becomes a drag. Above touch jitter (~2-3px),
 * below Chrome Android's own tap-slop (~8px) — a plain tap on the handle
 * should never accidentally start a drag. A distance threshold, not a
 * timer: a long-press would either have to apply to the mouse too (making
 * desktop drag feel broken) or be gated on `pointerType === 'touch'`,
 * which is exactly the per-platform branch this rewrite exists to remove.
 */
export const DRAG_ACTIVATION_PX = 6

/** How close to the scroll container's top/bottom edge triggers auto-scroll. */
export const AUTOSCROLL_BAND_PX = 48

/** Auto-scroll speed at the very edge of the band; ramps linearly to 0 at its outer boundary. */
export const AUTOSCROLL_MAX_PX_PER_FRAME = 12

export function containsPoint(rect: Rect, point: Point): boolean {
  return (
    point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom
  )
}

export type GestureState =
  | { phase: 'idle' }
  | { phase: 'pending'; pointerId: number; origin: Point }
  | { phase: 'dragging'; pointerId: number; origin: Point; at: Point }

export type GestureEvent =
  | { type: 'down'; pointerId: number; point: Point }
  | { type: 'move'; pointerId: number; point: Point }
  | { type: 'up'; pointerId: number }
  | { type: 'cancel'; pointerId: number }

export interface GestureResult {
  state: GestureState
  /**
   * What the caller must do in response, if anything:
   * - 'activate': the drag just crossed the activation threshold — start
   *   showing feedback (ghost, measure zones).
   * - 'commit': the pointer was released while dragging — resolve a drop.
   * - 'abort': the gesture ended (or was cancelled) without ever dragging,
   *   or was cancelled mid-drag — undo any activation, no drop.
   */
  effect: 'activate' | 'commit' | 'abort' | null
}

function chebyshevDistance(a: Point, b: Point): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))
}

/**
 * A tiny idle -> pending -> dragging state machine. `idle` ignores
 * everything but a `down`. Once `pending` (a specific pointer is being
 * tracked), events from any OTHER `pointerId` are ignored outright — a
 * second finger touching the screen mid-gesture must not hijack or cancel
 * the first — matching WCAG 2.5.4's expectation that a pointer gesture stay
 * bound to a single contact point once started, mirrored here as a
 * multi-touch safety net rather than an accessibility requirement per se.
 */
export function gestureReducer(state: GestureState, event: GestureEvent): GestureResult {
  if (state.phase === 'idle') {
    if (event.type === 'down') {
      return {
        state: { phase: 'pending', pointerId: event.pointerId, origin: event.point },
        effect: null,
      }
    }
    return { state, effect: null }
  }

  // Any tracked phase from here on: ignore events for a different pointer.
  if (event.pointerId !== state.pointerId) return { state, effect: null }

  if (event.type === 'cancel') {
    return { state: { phase: 'idle' }, effect: 'abort' }
  }

  if (state.phase === 'pending') {
    if (event.type === 'up') {
      return { state: { phase: 'idle' }, effect: 'abort' }
    }
    if (event.type === 'move') {
      if (chebyshevDistance(state.origin, event.point) < DRAG_ACTIVATION_PX) {
        return { state, effect: null }
      }
      return {
        state: {
          phase: 'dragging',
          pointerId: state.pointerId,
          origin: state.origin,
          at: event.point,
        },
        effect: 'activate',
      }
    }
    return { state, effect: null }
  }

  // state.phase === 'dragging'
  if (event.type === 'move') {
    return { state: { ...state, at: event.point }, effect: null }
  }
  if (event.type === 'up') {
    return { state: { phase: 'idle' }, effect: 'commit' }
  }
  return { state, effect: null }
}

/**
 * Signed px/frame to auto-scroll a container whose pointer is dragged near
 * its top/bottom edge. 0 outside both bands. Ramps linearly from 0 at the
 * band's outer edge to `AUTOSCROLL_MAX_PX_PER_FRAME` right at the
 * container's own edge, and clamps to 0 once the container is already
 * scrolled as far as it can go in that direction — so a drag pinned
 * against an already-maxed scroll position doesn't keep "trying" forever.
 */
export function autoScrollDelta(
  pointerY: number,
  container: {
    top: number
    bottom: number
    scrollTop: number
    scrollHeight: number
    clientHeight: number
  },
): number {
  const distanceFromTop = pointerY - container.top
  if (distanceFromTop >= 0 && distanceFromTop < AUTOSCROLL_BAND_PX) {
    if (container.scrollTop <= 0) return 0
    const proximity = 1 - distanceFromTop / AUTOSCROLL_BAND_PX
    return -Math.ceil(proximity * AUTOSCROLL_MAX_PX_PER_FRAME)
  }

  const distanceFromBottom = container.bottom - pointerY
  if (distanceFromBottom >= 0 && distanceFromBottom < AUTOSCROLL_BAND_PX) {
    const maxScrollTop = container.scrollHeight - container.clientHeight
    if (container.scrollTop >= maxScrollTop) return 0
    const proximity = 1 - distanceFromBottom / AUTOSCROLL_BAND_PX
    return Math.ceil(proximity * AUTOSCROLL_MAX_PX_PER_FRAME)
  }

  return 0
}
