# Shared Component Library — Design Spec (Issue #22)

Minimal component set needed by the four extracted features (editor/preview #18,
projects/files #19, import/export #20, drive-sync #21). Not a general-purpose
library — scope is limited to current usage in `prototype/index.html`.

Persona: this is the **design spec half** of #22. A SWE pass implements these
in `src/components/` against this document. Spec only — no implementation code.

## Token reuse

All components consume existing tokens from `src/styles/tokens.css` — no new
tokens are introduced here:

- Color: `--ground`, `--ground-2`, `--cream`, `--cream-soft`, `--accent`,
  `--danger` (`--c-coral`), `--c-sky`, `--c-green`, `--c-amber`
- Type: `--hand` (dialog titles), `--body` (UI text), `--mono` (labels/badges)
- Motion: `--transition` (`0.25s cubic-bezier(0.4, 0, 0.2, 1)`)

Gaps flagged by issue #13 and still open: no spacing scale, no radius scale,
no shadow tokens exist yet. Components below therefore keep the literal
px/rem values already used in `prototype/index.html` (documented per
component) rather than inventing a scale — that's out of scope for #22.

## ARIA / focus-trap approach (applies to Modal)

Reuse the vanilla focus-management primitives already extracted for issue #16
rather than re-deriving them:

- `prototype/components/dialog-utils.js` — `trapFocus()`, `openModal()`,
  `closeModal()`, `getFocusableElements()`, and the `_openModalStack` (so
  Escape only closes the topmost of multiple stacked overlays).
- `prototype/components/PromptDialog.js` / `ConfirmDialog.js` — consumers of
  that shell; both share one `#dialogModal` DOM instance and settle a single
  pending Promise (reentrancy guard: opening a second dialog cancels the
  first rather than orphaning its promise).

The Preact `Modal` spec'd below is the base primitive those two dialogs will
be rebuilt on top of (as function components rendering into the same
overlay/dialog shape), reimplementing `trapFocus`/`openModal`/`closeModal`
as Preact effects instead of imperative DOM calls, but keeping identical
behavior (focus restore, Tab cycling, stacked-Escape, overlay-click-to-close).

---

## 1. Button / IconButton

Two components, one visual language: `Button` (labeled, e.g. dialog actions)
and `IconButton` (icon-only, e.g. toolbar/sidebar).

### Variants observed in current usage
| Variant | Source class | Example |
|---|---|---|
| `primary` | `.btn-config-action.primary` | Modal "Salvar" / dialog confirm |
| `default` | `.btn-config-action`, `.sidebar-footer-btn` | Modal "Cancelar", sidebar new-project/import/config/install |
| `danger` | `.btn-config-action.danger` | Confirm-dialog destructive confirm (e.g. delete project) |
| icon-only, header | `.btn-icon` | font-size "Aa" cycle, theme toggle, fullscreen, Drive |
| icon-only, file row | `.file-action-btn.rename` / `.delete` | sidebar file rename/delete |

### States
- **Default** — as themed per variant above.
- **Hover** (pointer devices only) — subtle background lift, no token exists
  yet; reuse `rgba(255,255,255,0.06)` overlay already used for `:active`
  states as the hover treatment too (prototype has no distinct `:hover` rule —
  touch-first app — SWE may alias `:hover` to the existing `:active` rule).
- **Focus-visible** — `outline: 2px solid var(--accent); outline-offset: 2px`
  (matches `.btn-icon:focus-visible` / `.sidebar-footer-btn:focus-visible`).
- **Active/pressed** — `background-color: rgba(255,255,255,0.08)` (icon), or
  `rgba(255,255,255,0.06)` + `border-color: var(--accent)` (labeled).
- **Disabled** — `opacity: 0.4; cursor: not-allowed;` no pointer events
  (matches `.btn-download:disabled`, `.btn-drive-action:disabled`).

### Sizing
- `IconButton` default: 42×42px (`.btn-icon`), touch target ≥44px enforced
  at the 480px breakpoint already (`.btn-icon, .btn-menu { width/height: 38px }`
  — note: SWE should reconcile this against WCAG 44px target; flag if kept).
- `IconButton` compact (file-row actions): 30×30px (`.file-action-btn`).
- `Button` (labeled): `padding: 0.75rem 1rem`, `border-radius: 7px`,
  `font: var(--body) 0.85rem/700`.

### ARIA
- `IconButton` MUST always carry `aria-label` (icon glyphs are not
  accessible names) — `title` may additionally be set for the mouse tooltip
  but never replaces `aria-label`. Mirrors current `fontSizeBtn`, `driveBtn`,
  `themeToggle` markup.
- Buttons that open a modal: `aria-haspopup="dialog"` (see `driveBtn`,
  `configBtn`).
- Toggle buttons (e.g. hamburger menu): `aria-expanded` reflecting open state,
  `aria-controls` pointing at the controlled region id.
- `danger` variant: no extra ARIA role change — semantics come from the
  dialog's own `role="dialog"` and label text ("Excluir"), not from the button.

### Keyboard
- Native `<button>` semantics — Enter/Space activate. No custom keydown
  handling needed (unlike Modal/Checkbox).
- Must be in natural DOM tab order; icon-only buttons are not `tabindex="-1"`.

### Props sketch
```
Button:     variant: 'default' | 'primary' | 'danger', disabled?, onClick, children (label)
IconButton: icon (node), label (string, -> aria-label), variant?: 'default' | 'compact',
            disabled?, onClick, ariaHasPopup?, ariaExpanded?, ariaControls?
```

---

## 2. Modal

Base primitive for `PromptDialog`/`ConfirmDialog` (issue #16) and for
Config/Drive-style panel dialogs. Visual shell matches
`.config-modal-overlay` / `.config-modal` / `.drive-modal`.

### ASCII sketch
```
┌───────────────────────────── overlay (dim + blur) ─────────────────────────┐
│                    ┌── modal (role=dialog) ──────────────┐                 │
│                    │  Title                          [✕] │  <- header      │
│                    │  ...body content...                 │                 │
│                    │  [ Cancel ]         [ Confirm ]      │  <- footer      │
│                    └──────────────────────────────────────┘                 │
└──────────────────────────────────────────────────────────────────────────────┘
```

### States
- **Closed** — not rendered, or `aria-hidden="true"` + `opacity: 0;
  pointer-events: none` if kept mounted for animation (matches current
  `.visible` toggle approach).
- **Open** — `opacity: 1`, overlay click outside modal closes it (only when
  click target === overlay itself, not a bubbled child click).
- **Closing** — reuse `var(--transition)` fade; no separate exit-animation
  token needed (unlike Toast, Modal has no slide animation currently).

### Sizing
- `width: 340px; max-width: 100%; max-height: 90vh; overflow-y: auto;`
  `border-radius: 14px; padding: 1.5rem;` background `var(--ground-2)`,
  border `1px solid rgba(255,255,255,0.12)`,
  shadow `0 16px 48px rgba(0,0,0,0.4)` (no shadow token exists — literal,
  per the token gap noted above).
- Close button: 32×32px, `border-radius: 7px`.

### ARIA
- Overlay: `aria-hidden` toggled with visibility.
- Modal container: `role="dialog"`, `aria-modal="true"`,
  `aria-labelledby="<title-id>"`, `tabindex="-1"` (so it's programmatically
  focusable as a fallback when no focusable child exists).
- Close (✕) button: `aria-label` (e.g. "Fechar configurações") — icon-only,
  same rule as IconButton above.
- Title: plain heading/`div` with the referenced id; no separate `role`.

### Keyboard / focus-trap behavior
Directly reuses the behavior already implemented in
`prototype/components/dialog-utils.js`, ported to Preact effects:
1. On open: store `document.activeElement` as the trigger; move focus to the
   first focusable element inside the modal (or the modal container itself
   if none exist).
2. While open: Tab/Shift+Tab cycle strictly within the modal's focusable
   elements (first ↔ last wrap).
3. Escape closes **only the topmost** modal when multiple are stacked
   (maintain an open-modal stack, mirroring `_openModalStack`).
4. On close: restore focus to the original trigger element.
5. Clicking the overlay backdrop (not the modal body) closes the modal,
   equivalent to Escape — both should route through the same `onClose`/
   `onEscape` callback so Promise-based dialogs (Prompt/Confirm) can
   intercept and resolve their pending promise instead of only visually
   closing.

### Props sketch
```
Modal: open: boolean, onClose: () => void, titleId: string, title: node,
       children (body), footer? (node), labelledBy?, initialFocusRef?
```

---

## 3. Toast

Transient feedback for sync status, import/export success/failure. Matches
`.toast` in `prototype/index.html` (created imperatively via `showToast()`).

### Visual states / variants
| Variant | Left border | Used for |
|---|---|---|
| `success` (default) | `var(--c-green)` | e.g. "Projeto importado" |
| `error` | `var(--c-coral)` | e.g. import/export or Drive sync failure |
| `warning` | `var(--c-amber)` | e.g. partial import, quota warning |

- Background `var(--ground-2)`, border `1px solid rgba(255,255,255,0.14)`,
  text `var(--cream)`, `font: var(--body) 0.85rem/500`, `border-radius: 9px`,
  shadow `0 12px 32px rgba(0,0,0,0.4)` (literal, no token — see gap note).
- Enter animation: slide up + fade in, `0.3s var(--transition)`.
- Exit animation (`.hide`): slide down + fade out, same duration, then unmount.
- Position: fixed, bottom center, `max-width: 90vw`.

### Auto-dismiss timing (from current `showToast()`)
- `error`: 6000ms
- `warning`: 4000ms
- `success` (default): 2000ms
- De-duplication: identical message within 500ms of the previous one is
  suppressed (prevents duplicate toasts from rapid repeated calls, e.g.
  sync retries).

### ARIA
- Container: `role="status"` + `aria-live="polite"` for success/warning (non-
  disruptive), `role="alert"` (implicit `aria-live="assertive"`) for `error`
  so screen readers announce failures immediately — this is a refinement
  over the current prototype, which has no live-region semantics on `.toast`
  at all (flagged accessibility gap being closed here).
- No focus is ever moved to a toast; it is purely an announcement, never
  interactive (no close button, no action button in current usage).

### Keyboard
- Non-interactive — not in tab order, no keyboard handling required.

### Props sketch
```
Toast: message: string, variant?: 'success' | 'error' | 'warning', durationMs?
       (defaults per variant table above)
ToastHost: renders a stack/queue of active Toasts; exposes a `showToast(message, variant?)`
           imperative function (via context or a hook) as the direct replacement
           for the current global `showToast()` in prototype/index.html.
```

---

## 4. Checkbox

Multi-select in the projects sidebar (`.file-checkbox`), used to select
files for batch ZIP download.

### Visual states
- **Default (unchecked)** — 15×15px, native checkbox appearance via
  `accent-color: var(--accent)` (keeps native OS checkmark rendering rather
  than a custom SVG — matches current prototype exactly, minimal effort).
- **Checked** — native checked state, `accent-color` tints the fill/check to
  `var(--accent)`.
- **Hover** — `cursor: pointer` (native default is otherwise unstyled;
  no custom hover treatment exists in the prototype).
- **Focus-visible** — needs the same `outline: 2px solid var(--accent);
  outline-offset: 2px` treatment as buttons; not present in current
  prototype CSS (`.file-checkbox` has no `:focus-visible` rule) — flagged
  as a gap to close in this component rather than carry forward.
- **Disabled** — not currently used in this feature set; skip unless a
  future caller needs it (out of scope, no spec provided — SWE should not
  invent a disabled treatment speculatively).

### Sizing
- 15×15px box, `flex-shrink: 0` (sits inline in a flex file-row alongside
  filename + action buttons).

### ARIA
- Native `<input type="checkbox">` — no custom `role` needed (native
  semantics are already fully accessible).
- `aria-label` required per-instance since there's no visible `<label>` text
  bound to it: `"Selecionar {fileName} para download em lote"` (exact copy
  from current markup) — component should accept a `label` prop and render
  it as `aria-label`, not visible text.
- When checkbox state drives a dependent action (e.g. enabling a "Baixar
  ZIP" batch button), that relationship should also be exposed via the
  batch button's own disabled state — no `aria-describedby` linkage needed
  beyond that.

### Keyboard
- Native input — Space toggles checked state, Tab/Shift+Tab moves focus in
  and out. No custom keydown handling required; do not intercept Enter (not
  a native checkbox behavior, would be an unexpected addition).
- The `change` event is what should trigger the batch-selection recompute
  (matches current `checkbox.addEventListener('change', updateBatchState)`),
  not `click`/`input`.

### Props sketch
```
Checkbox: checked: boolean, onChange: (checked: boolean) => void, label: string (-> aria-label),
          disabled? (not currently used, keep optional for API completeness only)
```

---

## Summary table

| Component | Root element(s) | Key ARIA | Focus behavior | Token highlights |
|---|---|---|---|---|
| Button | `<button>` | `aria-label` if icon-only, `aria-haspopup` if opens modal | native | `--accent`, `--cream`, `--ground-2` |
| IconButton | `<button>` | `aria-label` (required), `title` optional | native | `--cream`, `--accent` (focus ring) |
| Modal | overlay `div` + dialog `div` | `role="dialog"`, `aria-modal`, `aria-labelledby` | full focus-trap + restore, stacked Escape | `--ground-2`, `--accent`, `--transition` |
| Toast | `div` (via ToastHost stack) | `role="status"`/`role="alert"` + `aria-live` | non-interactive, no focus | `--c-green`/`--c-coral`/`--c-amber`, `--ground-2` |
| Checkbox | `<input type="checkbox">` | `aria-label` (required, no visible label) | native, triggers on `change` | `--accent` (accent-color) |

## Known token gaps (not fixed here, flagged for future work)

No spacing, radius, or shadow scale tokens exist in `src/styles/tokens.css`
(confirmed also flagged in that file's own comments per issue #13). All
literal px/rem/shadow values above are carried forward unchanged from
`prototype/index.html` rather than invented fresh — introducing a scale is
out of scope for #22.
