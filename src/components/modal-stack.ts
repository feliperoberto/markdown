/**
 * Stack of currently-open Modal instances, topmost last. Mirrors
 * `_openModalStack` from `prototype/components/dialog-utils.js` so that a
 * single Escape keypress only closes the topmost of several stacked
 * modals (e.g. Config + Drive open at once).
 */
export const openModalStack: symbol[] = []

export function pushModal(id: symbol): void {
  openModalStack.push(id)
}

export function popModal(id: symbol): void {
  const index = openModalStack.indexOf(id)
  if (index !== -1) openModalStack.splice(index, 1)
}

export function isTopmostModal(id: symbol): boolean {
  return openModalStack[openModalStack.length - 1] === id
}

export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((el) => el.offsetParent !== null)
}
