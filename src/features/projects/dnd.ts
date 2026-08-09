// Pure drag & drop semantics for the projects sidebar (issue #92, and its
// mobile follow-up: HTML5 Drag-and-Drop never fires from a touch gesture,
// so reordering was desktop/mouse only). No DOM here — `useSidebarDnd.ts`
// is the one place that turns real pointer events and measured element
// rects into calls through this module.
//
// Previously this file also owned `DataTransfer` payload serialization
// (`DND_MIME`/`serializeDrag`/`readDrag`) and a module-level "active drag
// kind" mirror, both required only because `DataTransfer.getData()` is
// blocked during `dragover` under the browser's protected drag mode. With
// pointer events the dragged item's identity is just a value carried for
// the gesture's lifetime by whoever is driving it — there's no
// serialization boundary and no protected-mode blind spot, so none of that
// survives here.
import { containsPoint, type Point, type Rect } from '@/lib/dragGesture'

export type DragSource =
  { kind: 'file'; project: string; file: string } | { kind: 'project'; project: string }

/** A drop target's identity, without any measured region — see `DropZone`. */
export type ZoneIdentity =
  | { kind: 'file'; project: string; file: string }
  | { kind: 'group'; project: string; archived: boolean }

/** A drop target's identity plus its measured, hit-testable region. */
export type DropZone = ZoneIdentity & { rect: Rect }

export type DropIntent =
  { kind: 'file'; beforeFile: string | null } | { kind: 'project'; beforeProject: string }

/**
 * Whether/how `source` could land on `zone`, independent of any point/rect —
 * the pure eligibility rule shared by the pointer-drag path
 * (`resolveDropIntent`, which additionally hit-tests a point) and pick mode
 * (`resolvePickTargets`/`resolveTapOnHandle`, which has no pointer position
 * at all — a zone is either a valid tap target for the current pick or it
 * isn't):
 *
 * | zone               | source `file`, SAME project                 | source `file`, OTHER project | source `project`        |
 * |--------------------|-----------------------------------------------|-------------------------------|--------------------------|
 * | a file row         | insert before that file                       | no match                      | no match                |
 * | an unarchived group | append to that project (`beforeFile: null`)   | no match                      | insert before that project |
 * | an archived group  | append (still accepted)                       | no match                      | no match                |
 *
 * A file can only be reordered within its OWN project — moving a file to a
 * DIFFERENT project is a removed feature (see CHANGELOG), so any zone
 * belonging to another project is not a match for a file source at all,
 * exactly like a project source landing on a file row isn't.
 */
export function matchZone(zone: ZoneIdentity, source: DragSource): DropIntent | null {
  if (zone.kind === 'file') {
    if (source.kind !== 'file') return null
    if (zone.project !== source.project) return null
    return { kind: 'file', beforeFile: zone.file }
  }

  // zone.kind === 'group'
  if (source.kind === 'project') {
    if (zone.archived) return null
    return { kind: 'project', beforeProject: zone.project }
  }
  if (zone.project !== source.project) return null
  return { kind: 'file', beforeFile: null }
}

/**
 * Resolves what dropping `source` at `point` would do, given the currently
 * measured `zones` — a first-match-wins scan over `matchZone`'s eligibility
 * rule (see its own doc comment for the full table):
 *
 * `zones` MUST list every `'file'` zone before every `'group'` zone (see
 * `useSidebarDnd.ts`'s `measureZones`, which measures `[data-dnd-file]`
 * elements and `[data-dnd-group]` elements as two separate passes,
 * concatenated in that order — plain DOM/document order would put a group
 * BEFORE the file rows nested inside it, the opposite of what's needed
 * here). A file row's rect sits entirely inside its own group's rect, so
 * without that ordering the group would win the first-match scan over its
 * own row. Files-first is what gives a file row priority over its
 * enclosing group, matching the old `FileRow` handler's
 * `stopPropagation()` beating its parent `ProjectGroup`'s own drop
 * handler. A project source landing on a file row has nothing to do with
 * that row (a project can't "insert before" a file), so the scan
 * continues past it to that row's own group zone instead — the same
 * fall-through the old `FileRow.handleDragOver` produced by bailing out
 * before calling `preventDefault()`/`stopPropagation()`.
 */
export function resolveDropIntent(
  zones: readonly DropZone[],
  point: Point,
  source: DragSource,
): DropIntent | null {
  for (const zone of zones) {
    if (!containsPoint(zone.rect, point)) continue
    const intent = matchZone(zone, source)
    if (intent) return intent
    // A project source landing on a file row, or a file source landing on a
    // zone belonging to a different project, is a legitimate "keep
    // scanning" case (see matchZone's table) — not every non-match here
    // means stop.
  }
  return null
}

/**
 * Every zone (no rect needed — pick mode has no pointer position, only "is
 * this row/group a valid place to put the picked item") that `source` could
 * legally land on. Used to decide which OTHER rows/groups render a tappable
 * "drop here" affordance while something is picked (see `FileRow`/
 * `ProjectGroup`'s `onTogglePick`/pick-mode rendering).
 */
export function resolvePickTargets(
  zones: readonly ZoneIdentity[],
  source: DragSource,
): ZoneIdentity[] {
  return zones.filter((zone) => matchZone(zone, source) !== null)
}

function sourcesEqual(a: DragSource, b: DragSource): boolean {
  if (a.kind !== b.kind) return false
  if (a.kind === 'file' && b.kind === 'file') return a.project === b.project && a.file === b.file
  return a.project === b.project
}

// `archived: false` is always correct here, not a placeholder: `source` came
// from an actual handle tap (see resolveTapOnHandle's callers), and
// ProjectGroup only ever renders a project's drag handle when
// `!isArchived` — an archived project's handle doesn't exist to tap, so
// `tapped` can never represent one.
function toZoneIdentity(source: DragSource): ZoneIdentity {
  return source.kind === 'file'
    ? { kind: 'file', project: source.project, file: source.file }
    : { kind: 'group', project: source.project, archived: false }
}

export interface TapHandleResult {
  /** The pick state after this tap — `null` means nothing is picked anymore. */
  nextPicked: DragSource | null
  /** Set only when this tap COMMITS a move (tapped a valid target for the current pick). */
  intent: DropIntent | null
}

/**
 * What tapping (or Enter/Space-ing) a handle does, given what's currently
 * picked — the single source of truth for pick-mode's tap-driven
 * transitions, reused by both a literal tap (see `useSidebarDnd.ts`'s
 * `onTap`) and the keyboard toggle (Enter/Space), since both are "activate
 * this handle" with identical semantics:
 *
 * - Nothing picked yet: start picking `tapped`.
 * - Re-tapping the already-picked source's own handle: cancel (no intent).
 * - Tapping a handle that's a valid target for the current pick (per
 *   `matchZone`): commit (intent set) and clear the pick.
 * - Tapping an unrelated handle: abandon the old pick, start a fresh one on
 *   `tapped` instead — mirrors how opening a different row's "..." menu
 *   closes whichever other one was open (`ProjectsSidebar`'s `openMenu`).
 */
export function resolveTapOnHandle(picked: DragSource | null, tapped: DragSource): TapHandleResult {
  if (!picked) return { nextPicked: tapped, intent: null }
  if (sourcesEqual(picked, tapped)) return { nextPicked: null, intent: null }
  const intent = matchZone(toZoneIdentity(tapped), picked)
  if (intent) return { nextPicked: null, intent }
  return { nextPicked: tapped, intent: null }
}

export interface MoveHandlers {
  onMoveFile?: (projectName: string, fileName: string, beforeFile?: string | null) => void
  onMoveProject?: (projectName: string, beforeProject?: string | null) => void
}

/**
 * The single place that calls through to `useProjects.moveFile`/
 * `moveProject` — an argument-shape lock ensuring the rewrite calls them
 * with exactly the signatures established for each (collision toast and
 * active-file-follow behavior included; both live in `useProjects.ts`,
 * untouched by this rewrite).
 */
export function applyDropIntent(
  intent: DropIntent,
  source: DragSource,
  handlers: MoveHandlers,
): void {
  if (intent.kind === 'file') {
    if (source.kind !== 'file') return
    handlers.onMoveFile?.(source.project, source.file, intent.beforeFile)
    return
  }
  if (source.kind !== 'project') return
  handlers.onMoveProject?.(source.project, intent.beforeProject)
}

/**
 * One step of the drag handle's own keyboard path (Arrow Up/Down while
 * picked) — the non-drag, keyboard-friendly reorder method (WCAG 2.1 SC
 * 2.5.7/2.1.1: dragging needs a single-pointer, non-dragging alternative,
 * which the sidebar had none of before this). Operates on the *visible*
 * list (already filtered to what's on screen — archived items, or a
 * collapsed project's files, are skipped over in one press, matching what
 * the user actually sees move).
 *
 * Mirrors a real asymmetry in `model.moveFile`/`moveProject`: the moving
 * item is filtered out of the list *before* `beforeFile`/`beforeProject`
 * is located (see model.ts's `insert()` helper), so moving an item down by
 * one visible slot targets `visible[index + 2]` (skip the mover, then skip
 * the item it's swapping past), while moving up targets `visible[index -
 * 1]` directly. Returns `null` when the move would be a no-op (already at
 * that end of the list).
 */
export function stepBefore(
  visible: readonly string[],
  name: string,
  direction: 1 | -1,
): { before: string | null } | null {
  const index = visible.indexOf(name)
  if (index < 0) return null

  if (direction === -1) {
    if (index === 0) return null
    return { before: visible[index - 1] as string }
  }

  if (index >= visible.length - 1) return null
  const target = visible[index + 2]
  return { before: target ?? null }
}
