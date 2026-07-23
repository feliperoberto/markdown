// Shared drag-and-drop payload plumbing for the projects sidebar (issue
// #92). The dragged item's identity is serialized onto the DataTransfer
// under a custom MIME type so drop handlers can tell a file drag from a
// project drag and route to the right move. Reads happen only on `drop`
// (getData is unavailable during `dragover` under the browser's protected
// drag mode), so drop zones just preventDefault on dragover to opt in.

export type DragPayload =
  { kind: 'file'; project: string; file: string } | { kind: 'project'; project: string }

/** Custom MIME type — namespaced so it never collides with text/uri drags. */
export const DND_MIME = 'application/x-marcar-dnd'

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
