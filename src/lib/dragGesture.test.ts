import { describe, expect, it } from 'vitest'
import {
  AUTOSCROLL_MAX_PX_PER_FRAME,
  DRAG_ACTIVATION_PX,
  autoScrollDelta,
  containsPoint,
  gestureReducer,
  type GestureState,
} from './dragGesture'

describe('containsPoint', () => {
  const rect = { top: 0, left: 0, right: 10, bottom: 10 }

  it('is true for a point inside the rect, inclusive of the edges', () => {
    expect(containsPoint(rect, { x: 5, y: 5 })).toBe(true)
    expect(containsPoint(rect, { x: 0, y: 0 })).toBe(true)
    expect(containsPoint(rect, { x: 10, y: 10 })).toBe(true)
  })

  it('is false just outside each edge', () => {
    expect(containsPoint(rect, { x: -1, y: 5 })).toBe(false)
    expect(containsPoint(rect, { x: 11, y: 5 })).toBe(false)
    expect(containsPoint(rect, { x: 5, y: -1 })).toBe(false)
    expect(containsPoint(rect, { x: 5, y: 11 })).toBe(false)
  })
})

describe('gestureReducer', () => {
  const idle: GestureState = { phase: 'idle' }

  it('a down from idle starts pending, with no effect', () => {
    const result = gestureReducer(idle, { type: 'down', pointerId: 1, point: { x: 0, y: 0 } })
    expect(result.state).toEqual({ phase: 'pending', pointerId: 1, origin: { x: 0, y: 0 } })
    expect(result.effect).toBeNull()
  })

  it('stays pending below the activation threshold (x-only movement)', () => {
    const pending = gestureReducer(idle, {
      type: 'down',
      pointerId: 1,
      point: { x: 0, y: 0 },
    }).state
    const result = gestureReducer(pending, {
      type: 'move',
      pointerId: 1,
      point: { x: DRAG_ACTIVATION_PX - 1, y: 0 },
    })
    expect(result.state.phase).toBe('pending')
    expect(result.effect).toBeNull()
  })

  it('activates at exactly the threshold (x-only movement)', () => {
    const pending = gestureReducer(idle, {
      type: 'down',
      pointerId: 1,
      point: { x: 0, y: 0 },
    }).state
    const result = gestureReducer(pending, {
      type: 'move',
      pointerId: 1,
      point: { x: DRAG_ACTIVATION_PX, y: 0 },
    })
    expect(result.state.phase).toBe('dragging')
    expect(result.effect).toBe('activate')
  })

  it('activates at exactly the threshold (y-only movement)', () => {
    const pending = gestureReducer(idle, {
      type: 'down',
      pointerId: 1,
      point: { x: 0, y: 0 },
    }).state
    const result = gestureReducer(pending, {
      type: 'move',
      pointerId: 1,
      point: { x: 0, y: DRAG_ACTIVATION_PX },
    })
    expect(result.state.phase).toBe('dragging')
    expect(result.effect).toBe('activate')
  })

  it('activates on diagonal movement using Chebyshev (max-axis) distance', () => {
    const pending = gestureReducer(idle, {
      type: 'down',
      pointerId: 1,
      point: { x: 0, y: 0 },
    }).state
    // Each axis alone is at the threshold; Euclidean distance would be
    // larger, but Chebyshev distance is still exactly the threshold.
    const result = gestureReducer(pending, {
      type: 'move',
      pointerId: 1,
      point: { x: DRAG_ACTIVATION_PX, y: DRAG_ACTIVATION_PX },
    })
    expect(result.state.phase).toBe('dragging')
    expect(result.effect).toBe('activate')
  })

  it('an up while pending (never activated) aborts with no commit', () => {
    const pending = gestureReducer(idle, {
      type: 'down',
      pointerId: 1,
      point: { x: 0, y: 0 },
    }).state
    const result = gestureReducer(pending, { type: 'up', pointerId: 1 })
    expect(result.state).toEqual({ phase: 'idle' })
    expect(result.effect).toBe('abort')
  })

  it('an up while dragging commits', () => {
    const pending = gestureReducer(idle, {
      type: 'down',
      pointerId: 1,
      point: { x: 0, y: 0 },
    }).state
    const dragging = gestureReducer(pending, {
      type: 'move',
      pointerId: 1,
      point: { x: DRAG_ACTIVATION_PX, y: 0 },
    }).state
    const result = gestureReducer(dragging, { type: 'up', pointerId: 1 })
    expect(result.state).toEqual({ phase: 'idle' })
    expect(result.effect).toBe('commit')
  })

  it('cancel aborts from pending', () => {
    const pending = gestureReducer(idle, {
      type: 'down',
      pointerId: 1,
      point: { x: 0, y: 0 },
    }).state
    const result = gestureReducer(pending, { type: 'cancel', pointerId: 1 })
    expect(result.state).toEqual({ phase: 'idle' })
    expect(result.effect).toBe('abort')
  })

  it('cancel aborts from dragging (no commit)', () => {
    const pending = gestureReducer(idle, {
      type: 'down',
      pointerId: 1,
      point: { x: 0, y: 0 },
    }).state
    const dragging = gestureReducer(pending, {
      type: 'move',
      pointerId: 1,
      point: { x: DRAG_ACTIVATION_PX, y: 0 },
    }).state
    const result = gestureReducer(dragging, { type: 'cancel', pointerId: 1 })
    expect(result.state).toEqual({ phase: 'idle' })
    expect(result.effect).toBe('abort')
  })

  it('ignores events from a different pointerId while one is already tracked', () => {
    const pending = gestureReducer(idle, {
      type: 'down',
      pointerId: 1,
      point: { x: 0, y: 0 },
    }).state
    // A second finger touching down mid-gesture must not hijack tracking.
    const result = gestureReducer(pending, { type: 'down', pointerId: 2, point: { x: 50, y: 50 } })
    expect(result.state).toBe(pending)
    expect(result.effect).toBeNull()

    // Nor can it move/end the tracked gesture.
    const moveResult = gestureReducer(pending, {
      type: 'move',
      pointerId: 2,
      point: { x: 50, y: 50 },
    })
    expect(moveResult.state).toBe(pending)
    const upResult = gestureReducer(pending, { type: 'up', pointerId: 2 })
    expect(upResult.state).toBe(pending)
    expect(upResult.effect).toBeNull()
  })

  it('a down while already tracking a pointer is a no-op (ignored, not restarted)', () => {
    const pending = gestureReducer(idle, {
      type: 'down',
      pointerId: 1,
      point: { x: 0, y: 0 },
    }).state
    const result = gestureReducer(pending, { type: 'down', pointerId: 1, point: { x: 99, y: 99 } })
    expect(result.state).toBe(pending)
  })
})

describe('autoScrollDelta', () => {
  const container = { top: 0, bottom: 300, scrollTop: 50, scrollHeight: 1000, clientHeight: 300 }

  it('is 0 in the middle of the container', () => {
    expect(autoScrollDelta(150, container)).toBe(0)
  })

  it('is negative inside the top band', () => {
    expect(autoScrollDelta(10, container)).toBeLessThan(0)
  })

  it('is positive inside the bottom band', () => {
    expect(autoScrollDelta(290, container)).toBeGreaterThan(0)
  })

  it('magnitude increases with proximity to the edge, clamping at the max', () => {
    const farFromTopEdge = Math.abs(autoScrollDelta(40, container))
    const atTopEdge = Math.abs(autoScrollDelta(0, container))
    expect(atTopEdge).toBeGreaterThan(farFromTopEdge)
    expect(atTopEdge).toBeLessThanOrEqual(AUTOSCROLL_MAX_PX_PER_FRAME)
  })

  it('is 0 at the top edge when already scrolled to the top', () => {
    expect(autoScrollDelta(0, { ...container, scrollTop: 0 })).toBe(0)
  })

  it('is 0 at the bottom edge when already scrolled to the bottom extreme', () => {
    const maxScrollTop = container.scrollHeight - container.clientHeight
    expect(autoScrollDelta(300, { ...container, scrollTop: maxScrollTop })).toBe(0)
  })
})
