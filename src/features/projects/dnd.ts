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

/** A drop target's identity plus its measured, hit-testable region. */
export type DropZone =
  | { kind: 'file'; project: string; file: string; rect: Rect }
  | { kind: 'group'; project: string; archived: boolean; rect: Rect }

export type DropIntent =
  { kind: 'file'; beforeFile: string | null } | { kind: 'project'; beforeProject: string }

/**
 * Resolves what dropping `source` at `point` would do, given the currently
 * measured `zones` — a first-match-wins scan:
 *
 * | zone hit          | source `file`, SAME project           | source `file`, OTHER project | source `project`        |
 * |--------------------|-----------------------------------------|-------------------------------|--------------------------|
 * | a file row         | insert before that file                 | no match, keep scanning       | no match, keep scanning |
 * | an unarchived group | append to that project (`beforeFile: null`) | no match, keep scanning   | insert before that project |
 * | an archived group  | append (still accepted)                 | no match, keep scanning       | no match                |
 * | nothing            | `null`                                  | `null`                        | `null`                  |
 *
 * A file can only be reordered within its OWN project — moving a file to a
 * DIFFERENT project is a removed feature (see CHANGELOG), so any zone
 * belonging to another project is not a match for a file source at all,
 * exactly like a project source landing on a file row isn't.
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

    if (zone.kind === 'file') {
      if (source.kind !== 'file') continue
      if (zone.project !== source.project) continue
      return { kind: 'file', beforeFile: zone.file }
    }

    // zone.kind === 'group'
    if (source.kind === 'project') {
      if (zone.archived) continue
      return { kind: 'project', beforeProject: zone.project }
    }
    if (zone.project !== source.project) continue
    return { kind: 'file', beforeFile: null }
  }
  return null
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
 * One step of the "Mover para cima/baixo" menu items — the non-drag,
 * keyboard/touch-friendly path (WCAG 2.1 SC 2.5.7/2.1.1: dragging needs a
 * single-pointer, non-dragging alternative, which the sidebar had none of
 * before this). Operates on the *visible* list (already filtered to what's
 * on screen — archived items, or a collapsed project's files, are skipped
 * over in one press, matching what the user actually sees move).
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
