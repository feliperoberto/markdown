import { describe, expect, it, vi } from 'vitest'
import { applyDropIntent, resolveDropIntent, stepBefore, type DropZone } from './dnd'

const fileZone = (
  project: string,
  file: string,
  rect = { top: 0, left: 0, right: 100, bottom: 20 },
): DropZone => ({
  kind: 'file',
  project,
  file,
  rect,
})

const groupZone = (
  project: string,
  archived = false,
  rect = { top: 0, left: 0, right: 100, bottom: 200 },
): DropZone => ({ kind: 'group', project, archived, rect })

describe('resolveDropIntent', () => {
  it('a file source over a file row inserts before that file', () => {
    const zones = [fileZone('A', 'b'), groupZone('A')]
    const result = resolveDropIntent(
      zones,
      { x: 5, y: 5 },
      { kind: 'file', project: 'A', file: 'a' },
    )
    expect(result).toEqual({ kind: 'file', toProject: 'A', beforeFile: 'b' })
  })

  it('a file source over group padding (outside every row) appends (beforeFile: null)', () => {
    // Point inside the group rect but outside the file zone's smaller rect.
    const zones = [fileZone('A', 'b'), groupZone('A')]
    const result = resolveDropIntent(
      zones,
      { x: 5, y: 100 },
      { kind: 'file', project: 'A', file: 'a' },
    )
    expect(result).toEqual({ kind: 'file', toProject: 'A', beforeFile: null })
  })

  it("a project source over a file row falls through to that file's own group", () => {
    // Files-first ordering: the file zone is scanned first (and rejected,
    // since a project source can't target a file row), then its enclosing
    // group zone — same point, both rects contain it.
    const zones = [fileZone('A', 'b'), groupZone('A')]
    const result = resolveDropIntent(zones, { x: 5, y: 5 }, { kind: 'project', project: 'B' })
    expect(result).toEqual({ kind: 'project', beforeProject: 'A' })
  })

  it('a project source over an archived group is rejected (no match)', () => {
    const zones = [groupZone('A', true)]
    const result = resolveDropIntent(zones, { x: 5, y: 5 }, { kind: 'project', project: 'B' })
    expect(result).toBeNull()
  })

  it('a file source over an archived group is still accepted (appended)', () => {
    const zones = [groupZone('A', true)]
    const result = resolveDropIntent(
      zones,
      { x: 5, y: 5 },
      { kind: 'file', project: 'B', file: 'x' },
    )
    expect(result).toEqual({ kind: 'file', toProject: 'A', beforeFile: null })
  })

  it('a point outside every zone resolves to null', () => {
    const zones = [fileZone('A', 'b'), groupZone('A')]
    const result = resolveDropIntent(
      zones,
      { x: 500, y: 500 },
      { kind: 'file', project: 'A', file: 'a' },
    )
    expect(result).toBeNull()
  })

  it('a file source over one project inserts into a DIFFERENT project (cross-project)', () => {
    const zones = [fileZone('B', 'x'), groupZone('B')]
    const result = resolveDropIntent(
      zones,
      { x: 5, y: 5 },
      { kind: 'file', project: 'A', file: 'a' },
    )
    expect(result).toEqual({ kind: 'file', toProject: 'B', beforeFile: 'x' })
  })
})

describe('applyDropIntent — argument-shape lock', () => {
  it('calls onMoveFile with exactly (fromProject, fileName, toProject, beforeFile)', () => {
    const onMoveFile = vi.fn()
    applyDropIntent(
      { kind: 'file', toProject: 'B', beforeFile: 'x' },
      { kind: 'file', project: 'A', file: 'a' },
      { onMoveFile },
    )
    expect(onMoveFile).toHaveBeenCalledExactlyOnceWith('A', 'a', 'B', 'x')
  })

  it('calls onMoveProject with exactly (projectName, beforeProject)', () => {
    const onMoveProject = vi.fn()
    applyDropIntent(
      { kind: 'project', beforeProject: 'B' },
      { kind: 'project', project: 'A' },
      { onMoveProject },
    )
    expect(onMoveProject).toHaveBeenCalledExactlyOnceWith('A', 'B')
  })

  it('does nothing when the intent and source kinds mismatch', () => {
    const onMoveFile = vi.fn()
    const onMoveProject = vi.fn()
    applyDropIntent(
      { kind: 'project', beforeProject: 'B' },
      { kind: 'file', project: 'A', file: 'a' },
      { onMoveFile, onMoveProject },
    )
    expect(onMoveFile).not.toHaveBeenCalled()
    expect(onMoveProject).not.toHaveBeenCalled()
  })

  it('does nothing when the matching handler was not provided', () => {
    const onMoveProject = vi.fn()
    applyDropIntent(
      { kind: 'file', toProject: 'B', beforeFile: null },
      { kind: 'file', project: 'A', file: 'a' },
      { onMoveProject },
    )
    expect(onMoveProject).not.toHaveBeenCalled()
  })
})

describe('stepBefore', () => {
  const visible = ['a', 'b', 'c', 'd']

  it('moving down one targets visible[index + 2] (model.moveFile filters the mover out first)', () => {
    // 'a' (index 0) moving down should land before 'c' (index 2), not 'b'
    // (index 1) — model.moveFile removes 'a' from the list before locating
    // beforeFile, which shifts every subsequent index down by one.
    expect(stepBefore(visible, 'a', 1)).toEqual({ before: 'c' })
  })

  it('moving down from the second-to-last appends (before: null)', () => {
    expect(stepBefore(visible, 'c', 1)).toEqual({ before: null })
  })

  it('moving down from the last is a no-op', () => {
    expect(stepBefore(visible, 'd', 1)).toBeNull()
  })

  it('moving up one targets visible[index - 1] directly (no asymmetry)', () => {
    expect(stepBefore(visible, 'c', -1)).toEqual({ before: 'b' })
  })

  it('moving up from the first is a no-op', () => {
    expect(stepBefore(visible, 'a', -1)).toBeNull()
  })

  it('an archived (hidden) neighbour is skipped over in one press, since it is not in the visible list', () => {
    // Full key order might be [a, hidden, b, c] but the visible list never
    // includes 'hidden' — moving 'a' down targets what's two slots ahead in
    // the VISIBLE list, landing correctly on 'c' without ever "seeing" the
    // archived file in between.
    const visibleWithGap = ['a', 'b', 'c']
    expect(stepBefore(visibleWithGap, 'a', 1)).toEqual({ before: 'c' })
  })

  it('returns null for a name not present in the visible list', () => {
    expect(stepBefore(visible, 'missing', 1)).toBeNull()
  })
})
