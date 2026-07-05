// Dialog stub for the projects feature's create/rename/delete flows.
//
// Issue #16 ("Replace native prompt()/confirm() with accessible custom
// dialogs") has already shipped accessible `showPromptDialog`/`showConfirmDialog`
// helpers, but only as vanilla-JS modules wired to the legacy
// `prototype/index.html` DOM (see `prototype/components/PromptDialog.js` and
// `ConfirmDialog.js`) — there is no Preact port of those components yet
// under `src/components/`. Per issue #19's own fallback guidance, this
// feature stubs the same call signatures using native `window.prompt()` /
// `window.confirm()` so the data-layer/CRUD work here doesn't have to wait.
// Swapping this module's implementation for real Preact dialog components
// later requires no changes to `model.ts`, `storage.ts`, or `useProjects.ts`.
export interface PromptDialogOptions {
  title: string
  label?: string
  defaultValue?: string
  placeholder?: string
  validate?: (value: string) => string | void | null | undefined
}

export interface ConfirmDialogOptions {
  title: string
  message: string
}

// Resolves the trimmed value, or null on cancel / empty / failed validation.
export async function showPromptDialog({
  title,
  label,
  defaultValue = '',
  validate,
}: PromptDialogOptions): Promise<string | null> {
  const value = window.prompt(label ?? title, defaultValue)
  if (value === null) return null

  const trimmed = value.trim()
  const validationError = validate?.(trimmed)
  if (validationError) {
    window.alert(validationError)
    return null
  }

  return trimmed || null
}

export async function showConfirmDialog({ message }: ConfirmDialogOptions): Promise<boolean> {
  return window.confirm(message)
}
