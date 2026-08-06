import { useEffect, useRef } from 'preact/hooks'

/**
 * Dismisses something in response to a click landing outside it. Shared by
 * every outside-click dismissal in the app (mobile sidebar drawer in
 * app.tsx, project actions menu in ProjectGroup.tsx) so the event semantics
 * don't drift across copies: listens on `document` for `click` (not
 * `mousedown`), so it fires after — not before — the same tap's own onClick
 * handlers have already run.
 *
 * `isInside` is re-evaluated on every document click while `active` is
 * true; return true to keep the widget open (the click landed somewhere
 * that should not dismiss it), false to dismiss. Deliberately a predicate
 * rather than a fixed ref/id list: call sites need different "what counts
 * as inside" logic (a single ref + trigger-button id for the project menu;
 * two ids plus a `[role="dialog"]` escape hatch for the sidebar drawer)
 * that a one-size ref-list API can't express cleanly for both.
 *
 * `isInside`/`onOutside` are cached in refs (not effect dependencies) so
 * passing fresh inline closures every render — the normal case — doesn't
 * tear down and re-attach the listener on every render. Mirrors the
 * `onCloseRef` pattern already used in Modal.tsx for the same reason.
 */
export function useOutsideClick(
  active: boolean,
  isInside: (target: Node) => boolean,
  onOutside: () => void,
): void {
  const isInsideRef = useRef(isInside)
  isInsideRef.current = isInside
  const onOutsideRef = useRef(onOutside)
  onOutsideRef.current = onOutside

  useEffect(() => {
    if (!active) return

    function handleClick(e: MouseEvent) {
      const target = e.target as Node
      if (isInsideRef.current(target)) return
      onOutsideRef.current()
    }

    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [active])
}
