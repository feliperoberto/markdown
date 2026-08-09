import { describe, expect, it, vi } from 'vitest'
import {
  applyDropIntent,
  matchZone,
  resolveDropIntent,
  resolveTapOnHandle,
  stepBefore,
  type DropZone,
} from './dnd'

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
  it('a file source over a file row in the SAME project inserts before that file', () => {
    const zones = [fileZone('A', 'b'), groupZone('A')]
    const result = resolveDropIntent(
      zones,
      { x: 5, y: 5 },
      { kind: 'file', project: 'A', file: 'a' },
    )
    expect(result).toEqual({ kind: 'file', beforeFile: 'b' })
  })

  it('a file source over group padding (outside every row) in the SAME project appends (beforeFile: null)', () => {
    // Point inside the group rect but outside the file zone's smaller rect.
    const zones = [fileZone('A', 'b'), groupZone('A')]
    const result = resolveDropIntent(
      zones,
      { x: 5, y: 100 },
      { kind: 'file', project: 'A', file: 'a' },
    )
    expect(result).toEqual({ kind: 'file', beforeFile: null })
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

  it('a file source over its OWN archived group is still accepted (appended)', () => {
    const zones = [groupZone('A', true)]
    const result = resolveDropIntent(
      zones,
      { x: 5, y: 5 },
      { kind: 'file', project: 'A', file: 'x' },
    )
    expect(result).toEqual({ kind: 'file', beforeFile: null })
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

  // Moving a file to a different project is a removed feature (see
  // CHANGELOG) — a file source landing on ANY zone belonging to a
  // different project is not a match at all, exactly like a project
  // source landing on a file row isn't.
  it('a file source over a file row in a DIFFERENT project is rejected (no match)', () => {
    const zones = [fileZone('B', 'x'), groupZone('B')]
    const result = resolveDropIntent(
      zones,
      { x: 5, y: 5 },
      { kind: 'file', project: 'A', file: 'a' },
    )
    expect(result).toBeNull()
  })

  it('a file source over an unarchived group of a DIFFERENT project is rejected (no match)', () => {
    const zones = [groupZone('B')]
    const result = resolveDropIntent(
      zones,
      { x: 5, y: 5 },
      { kind: 'file', project: 'A', file: 'a' },
    )
    expect(result).toBeNull()
  })

  it('a file source over an archived group of a DIFFERENT project is rejected (no match)', () => {
    const zones = [groupZone('B', true)]
    const result = resolveDropIntent(
      zones,
      { x: 5, y: 5 },
      { kind: 'file', project: 'A', file: 'a' },
    )
    expect(result).toBeNull()
  })
})

describe('matchZone', () => {
  // Pick mode has no pointer position — it only ever asks "is this zone a
  // valid place for the current pick", i.e. exactly resolveDropIntent's
  // point-tested branch minus the point test. These mirror the same table
  // resolveDropIntent's own tests already cover, at the zone-identity level.
  it('a file zone in the same project as the source is a match', () => {
    expect(
      matchZone(
        { kind: 'file', project: 'A', file: 'b' },
        { kind: 'file', project: 'A', file: 'a' },
      ),
    ).toEqual({
      kind: 'file',
      beforeFile: 'b',
    })
  })

  it('a file zone in a different project is not a match', () => {
    expect(
      matchZone(
        { kind: 'file', project: 'B', file: 'x' },
        { kind: 'file', project: 'A', file: 'a' },
      ),
    ).toBeNull()
  })

  it('an unarchived group in the same project is a match (append) for a file source', () => {
    expect(
      matchZone(
        { kind: 'group', project: 'A', archived: false },
        { kind: 'file', project: 'A', file: 'a' },
      ),
    ).toEqual({ kind: 'file', beforeFile: null })
  })

  it('an archived group in the same project is still a match for a file source', () => {
    expect(
      matchZone(
        { kind: 'group', project: 'A', archived: true },
        { kind: 'file', project: 'A', file: 'a' },
      ),
    ).toEqual({ kind: 'file', beforeFile: null })
  })

  it('an unarchived group is a match for a project source', () => {
    expect(
      matchZone(
        { kind: 'group', project: 'B', archived: false },
        { kind: 'project', project: 'A' },
      ),
    ).toEqual({
      kind: 'project',
      beforeProject: 'B',
    })
  })

  it('an archived group is not a match for a project source', () => {
    expect(
      matchZone({ kind: 'group', project: 'B', archived: true }, { kind: 'project', project: 'A' }),
    ).toBeNull()
  })

  it('a file zone is never a match for a project source', () => {
    expect(
      matchZone({ kind: 'file', project: 'A', file: 'a' }, { kind: 'project', project: 'A' }),
    ).toBeNull()
  })
})

describe('resolveTapOnHandle', () => {
  it('starts picking when nothing is picked yet', () => {
    const result = resolveTapOnHandle(null, { kind: 'file', project: 'A', file: 'a' })
    expect(result).toEqual({ nextPicked: { kind: 'file', project: 'A', file: 'a' }, intent: null })
  })

  it("re-tapping the already-picked source's own handle cancels", () => {
    const source = { kind: 'file' as const, project: 'A', file: 'a' }
    const result = resolveTapOnHandle(source, source)
    expect(result).toEqual({ nextPicked: null, intent: null })
  })

  it('tapping a valid target commits and clears the pick', () => {
    const picked = { kind: 'file' as const, project: 'A', file: 'a' }
    const tapped = { kind: 'file' as const, project: 'A', file: 'b' }
    const result = resolveTapOnHandle(picked, tapped)
    expect(result).toEqual({ nextPicked: null, intent: { kind: 'file', beforeFile: 'b' } })
  })

  it('tapping an unrelated handle abandons the old pick and starts a new one', () => {
    const picked = { kind: 'file' as const, project: 'A', file: 'a' }
    const tapped = { kind: 'file' as const, project: 'B', file: 'x' }
    const result = resolveTapOnHandle(picked, tapped)
    expect(result).toEqual({ nextPicked: tapped, intent: null })
  })

  // Tapping a project header's own handle, mapped to a zone via
  // toZoneIdentity, always carries `archived: false` (see that helper's own
  // comment) — the group-zone/file-source branch of matchZone doesn't care
  // about archived either way, only same-project-ness, so this exercises
  // that branch correctly regardless.
  it("tapping a DIFFERENT project's handle while a file is picked is not a target — abandons and re-picks the project (cross-project move is removed)", () => {
    const picked = { kind: 'file' as const, project: 'A', file: 'a' }
    const tapped = { kind: 'project' as const, project: 'B' }
    const result = resolveTapOnHandle(picked, tapped)
    expect(result).toEqual({ nextPicked: tapped, intent: null })
  })

  it("tapping the picked file's OWN project's handle commits an append to the end of that project", () => {
    const picked = { kind: 'file' as const, project: 'A', file: 'a' }
    const tapped = { kind: 'project' as const, project: 'A' }
    const result = resolveTapOnHandle(picked, tapped)
    expect(result).toEqual({ nextPicked: null, intent: { kind: 'file', beforeFile: null } })
  })

  it('tapping a file handle while a project is picked has nothing to do with it — abandons and re-picks the file', () => {
    // A project source can only land on a group zone (matchZone rejects a
    // file zone for a project source outright) — same fall-through
    // reasoning as resolveDropIntent's own "project source over a file
    // row" case, just via a tap instead of a point.
    const picked = { kind: 'project' as const, project: 'A' }
    const tapped = { kind: 'file' as const, project: 'B', file: 'x' }
    const result = resolveTapOnHandle(picked, tapped)
    expect(result).toEqual({ nextPicked: tapped, intent: null })
  })
})

describe('applyDropIntent — argument-shape lock', () => {
  it('calls onMoveFile with exactly (projectName, fileName, beforeFile)', () => {
    const onMoveFile = vi.fn()
    applyDropIntent(
      { kind: 'file', beforeFile: 'x' },
      { kind: 'file', project: 'A', file: 'a' },
      { onMoveFile },
    )
    expect(onMoveFile).toHaveBeenCalledExactlyOnceWith('A', 'a', 'x')
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
      { kind: 'file', beforeFile: null },
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
