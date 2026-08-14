import { useEffect, useRef } from 'preact/hooks'

/**
 * Fires `onSave` on Ctrl+S (Windows/Linux) or Cmd+S (macOS), from anywhere
 * in the app — not scoped to the editor `<textarea>` — since the action it
 * triggers (Google Drive sync, see `src/app/app.tsx`) is meaningful
 * regardless of what currently has focus. Local content is already
 * persisted on every keystroke (`EditorPane`'s `onInput` →
 * `useProjects.updateFileContent`), so there is no separate "local save" for
 * this shortcut to duplicate.
 *
 * Listens during the CAPTURE phase, matching `useOutsideClick`'s rationale:
 * a document-level shortcut must observe the keydown before any descendant
 * handler can `stopPropagation()` it away.
 *
 * `e.preventDefault()` always runs once the chord matches — this app owns
 * Ctrl+S, the browser's native "Save Page" dialog is never useful here — but
 * `onSave` itself is skipped while a `[role="dialog"]` is open (mirrors the
 * dialog escape-hatch `app.tsx` already uses in its own `useOutsideClick`
 * call), so the shortcut can't fire behind a modal the user is still
 * interacting with.
 *
 * Ignores `e.repeat` (an OS-repeated keydown from a held-down chord) and
 * `e.isComposing` (an IME composition in progress, where `key` can
 * transiently report unrelated values).
 *
 * `onSave` is cached in a ref (not an effect dependency) so passing a fresh
 * inline closure every render — the normal case — doesn't tear down and
 * re-attach the listener on every render, same as `useOutsideClick`'s
 * `onOutsideRef`.
 */
export function useSaveShortcut(onSave: () => void): void {
  const onSaveRef = useRef(onSave)
  onSaveRef.current = onSave

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.repeat || e.isComposing) return
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return
      if (e.key.toLowerCase() !== 's') return

      e.preventDefault()
      if (document.querySelector('[role="dialog"]')) return
      onSaveRef.current()
    }

    document.addEventListener('keydown', handleKeyDown, true)
    return () => document.removeEventListener('keydown', handleKeyDown, true)
  }, [])
}
