// Shared drag-and-drop payload plumbing for the projects sidebar (issue
// #92). The dragged item's identity is serialized onto the DataTransfer
// under a custom MIME type so drop handlers can tell a file drag from a
// project drag and route to the right move. The DataTransfer payload is
// readable only on `drop` (getData is blocked during `dragover` under the
// browser's protected drag mode), so a lightweight module-level flag mirrors
// the active drag's kind — that's what dragover consults to decide whether
// to opt in as a drop target. Foreign drags (OS files, selected text) never
// set it, so they can't light up a drop zone or trigger a navigating drop.

export type DragPayload =
  { kind: 'file'; project: string; file: string } | { kind: 'project'; project: string }

/** Custom MIME type — namespaced so it never collides with text/uri drags. */
export const DND_MIME = 'application/x-marcar-dnd'

// The kind of the drag currently in progress within this app, or null when
// none of ours is active. Set on dragstart, cleared on dragend.
let activeDragKind: DragPayload['kind'] | null = null

export function setActiveDrag(payload: DragPayload | null): void {
  activeDragKind = payload ? payload.kind : null
}

export function getActiveDragKind(): DragPayload['kind'] | null {
  return activeDragKind
}

export function serializeDrag(payload: DragPayload): string {
  return JSON.stringify(payload)
}

export function readDrag(event: DragEvent): DragPayload | null {
  const raw = event.dataTransfer?.getData(DND_MIME)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as DragPayload
    if (
      parsed.kind === 'file' &&
      typeof parsed.project === 'string' &&
      typeof parsed.file === 'string'
    ) {
      return parsed
    }
    if (parsed.kind === 'project' && typeof parsed.project === 'string') {
      return parsed
    }
  } catch {
    // Not our payload (or malformed) — ignore and let the drop no-op.
  }
  return null
}
