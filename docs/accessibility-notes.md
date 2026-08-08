# Accessibility remediation notes — `prototype/index.html` (issue #15)

## 1. Accessible names for icon-only controls (`aria-label`, PT-BR)

| Element(s)                             | `aria-label`                              |
| -------------------------------------- | ----------------------------------------- |
| `#menuBtn` (☰)                        | "Abrir menu de projetos"                  |
| `#driveBtn` (☁️)                       | "Abrir Google Drive"                      |
| `#fontSizeBtn` (Aa)                    | "Alternar tamanho do texto do editor"     |
| `#fullscreenBtn` (⛶)                   | "Alternar tela cheia"                     |
| `#newProjectBtn` (➕)                  | "Criar novo projeto"                      |
| `#importZipBtn` (📥)                   | "Importar projetos de um arquivo ZIP"     |
| `#configBtn` (⚙️)                      | "Abrir configurações"                     |
| `#installBtn` (📲)                     | "Instalar aplicativo"                     |
| `#downloadBtn` (⬇️)                    | "Baixar arquivo atual"                    |
| `#copyBtn` (📋)                        | "Copiar todo o conteúdo do arquivo"       |
| `#configModalClose` (✕)                | "Fechar configurações"                    |
| `#driveModalClose` (✕)                 | "Fechar Google Drive"                     |
| Project "⋮" menu trigger (per project) | "Mais opções do projeto {nome}"           |
| File "⋮" menu trigger (per file)       | "Mais opções do arquivo {nome}"           |
| `.file-checkbox` (per file)            | "Selecionar {nome} para download em lote" |

(The last three rows above have moved on from `prototype/index.html`'s
literal class names — see §4 for the current sidebar structure. Rename/
delete are menu items inside the "⋮" menu now, not their own buttons, so
they don't need their own `aria-label` row here.)

Decorative glyphs that duplicate an adjacent visible text label (e.g. sidebar
footer icons next to "Novo"/"Importar"/"Config"/"Instalar", the drive status
icon, the project toggle arrow) are marked `aria-hidden="true"` instead of
given a redundant label.

## 2. Modal behavior (Config modal & Drive modal)

Both `#configModal` and `#driveModal` now:

- Carry `role="dialog"`, `aria-modal="true"`, `aria-labelledby` pointing at
  their visible title, and the overlay carries `aria-hidden` toggled with
  visibility.
- Trap `Tab`/`Shift+Tab` inside the dialog (via `trapFocus`, see below) so
  focus cannot leak to the page behind the overlay.
- Close on `Escape` and on overlay (backdrop) click.
- Move focus to the first focusable element inside the dialog on open, and
  restore focus to the element that triggered the modal (`#configBtn` /
  `#driveBtn`) on close.

## 3. Project dropdown menu

`showProjectMenu()` now renders `role="menu"` on the dropdown container and
`role="menuitem"` on each action button:

- Opening the menu focuses the first menu item.
- `ArrowDown` / `ArrowUp` cycle focus between menu items (wrapping).
- `Escape` and `Tab` close the menu and return focus to the `⋮` button that
  opened it.
- Selecting an action (click) still closes the menu as before.

## 4. Sidebar keyboard nav order

Updated for the current React/Preact app (`src/features/projects/`) — the
sidebar has been rebuilt since this document's original prototype-era
sections (§1, §5) were written; per-file rename/delete no longer have their
own buttons at all (`#104` replaced the swipe/hover-revealed
`.file-action-btn.rename`/`.file-action-btn.delete` chips with a single "…"
actions menu, the same pattern project rows already used), and drag & drop
(issue: mobile DnD) added a pointer-only drag handle since.

Tab order through the sidebar file tree (when open) follows DOM order,
top to bottom:

1. Project header (`role="button"`, `tabindex="0"`, expand/collapse via
   click or `Enter`/`Space`) → its "⋮" actions menu trigger.
2. Per file row: checkbox → file row (`role="button"`, `tabindex="0"`,
   opens the file via click or `Enter`/`Space`) → its "⋮" actions menu
   trigger (rename/archive/delete/move, all inside one `role="menu"`,
   keyboard-navigable per §3 above).
3. Sidebar footer: Novo → Importar → Config.

**The drag handle (`.drag-handle`, `data-dnd-handle`) adds zero new Tab
stops.** It is `aria-hidden="true"` with no `tabindex` — a deliberately
pointer-only affordance, not a keyboard control with a missing binding.
Reordering/moving is fully available without it: each "⋮" menu (file and
project) carries "Mover para cima"/"Mover para baixo" items computed by
`src/features/projects/dnd.ts`'s `stepBefore`, plus "Mover para
&lt;projeto&gt;" per other project on a file's menu — the same
`onMoveFile`/`onMoveProject` calls the pointer drag itself makes (see
`applyDropIntent`), not a parallel implementation. This is what satisfies
WCAG 2.1 SC 2.5.7 (Dragging Movements requires a single-pointer,
non-dragging alternative) and SC 2.1.1 (Keyboard) for the whole feature — a
focusable "grab mode" on the handle itself was considered and deferred
(it would need a 4th Tab stop per row for behavior the menu already
delivers); see the DnD design notes for that trade-off.

**Resolved (issue #34):** `.project-header` and `.file-item` were
previously `<div>`s with only `click`/`dblclick` handlers, so they were not
part of the Tab order and had no keyboard activation. They are now
`role="button"` with `tabindex="0"` and an `onKeyDown` handler that
activates on `Enter`/`Space`, matching native button semantics.

## 5. Reusable focus-trap helpers (for issue #16)

Added near the top of the inline `<script>` in `prototype/index.html`,
under the comment block `ACCESSIBILITY HELPERS — focus trap & modal
open/close`:

- `getFocusableElements(container)` — returns visible, non-disabled
  focusable descendants of a container.
- `trapFocus(containerEl)` — attaches a `keydown` listener that cycles
  `Tab`/`Shift+Tab` within `containerEl`; returns a cleanup function to
  remove the listener.
- `openModal(overlayEl, modalEl, triggerEl)` — shows the overlay, sets
  `aria-hidden="false"`, focuses the first focusable element inside
  `modalEl`, wires up the focus trap, and closes on `Escape`.
- `closeModal(overlayEl, modalEl)` — hides the overlay, sets
  `aria-hidden="true"`, tears down the trap/Escape listeners, and restores
  focus to the original trigger element.

Any new custom dialog built for #16 should call `openModal`/`closeModal`
directly (or `trapFocus` alone, for non-overlay contexts like a
menu/popover) rather than re-implementing focus management.

## 6. Manual verification performed

- Keyboard-only pass: tabbed through header icon buttons, sidebar footer
  buttons, create/rename/delete file flow (via the project `⋮` menu and
  per-file action buttons), and the export/download flow, confirming each
  control is reachable and has a distinguishable accessible name via
  screen-reader-style DOM/accessibility-tree inspection (no dedicated
  screen reader was available in this environment, so this was a DOM/ARIA
  inspection rather than a live AT test).
- Verified `Tab`/`Shift+Tab` cycles correctly within both the Config modal
  and the Drive modal (does not escape to the page behind), `Escape`
  closes both modals, and focus returns to `#configBtn` / `#driveBtn`
  respectively.
- Verified the project dropdown menu opens with focus on the first item,
  `ArrowUp`/`ArrowDown` move focus between items, and `Escape` closes the
  menu and returns focus to the `⋮` trigger button.
- Did not chase WCAG AAA color contrast (explicitly out of scope for this
  pass per the issue).
