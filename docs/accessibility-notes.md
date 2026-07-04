# Accessibility remediation notes — `prototype/index.html` (issue #15)

## 1. Accessible names for icon-only controls (`aria-label`, PT-BR)

| Element(s) | `aria-label` |
|---|---|
| `#menuBtn` (☰) | "Abrir menu de projetos" |
| `#driveBtn` (☁️) | "Abrir Google Drive" |
| `#fontSizeBtn` (Aa) | "Alternar tamanho do texto do editor" |
| `#fullscreenBtn` (⛶) | "Alternar tela cheia" |
| `#newProjectBtn` (➕) | "Criar novo projeto" |
| `#importZipBtn` (📥) | "Importar projetos de um arquivo ZIP" |
| `#configBtn` (⚙️) | "Abrir configurações" |
| `#installBtn` (📲) | "Instalar aplicativo" |
| `#downloadBtn` (⬇️) | "Baixar arquivo atual" |
| `#copyBtn` (📋) | "Copiar todo o conteúdo do arquivo" |
| `#configModalClose` (✕) | "Fechar configurações" |
| `#driveModalClose` (✕) | "Fechar Google Drive" |
| `.project-menu` (⋮, per project) | "Mais opções do projeto {nome}" |
| `.file-action-btn.rename` (✏️, per file) | "Renomear arquivo {nome}" |
| `.file-action-btn.delete` (🗑, per file) | "Excluir arquivo {nome}" |
| `.file-checkbox` (per file) | "Selecionar {nome} para download em lote" |

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

Tab order through the sidebar file tree (when open) follows DOM order,
top to bottom:
1. Project header (click target for expand/collapse — currently a `div`
   with a click handler, not yet a native `<button>`; noted as follow-up
   debt, see below) → `⋮` project menu button.
2. Per file row: checkbox → file name (click target, same non-native-button
   caveat) → rename (✏️) → delete (🗑) action buttons.
3. Sidebar footer: Novo → Importar → Config → Instalar (when visible).

**Known follow-up (out of scope for this pass):** `.project-header` and
`.file-item` are `<div>`s with `click`/`dblclick` handlers rather than
native `<button>`s, so they are not currently part of the Tab order and
have no keyboard activation (Enter/Space). Converting them to accessible
buttons (or adding `tabindex="0"` + key handlers) is recommended as a
follow-up, since it changes hit-testing/CSS behavior (swipe-to-reveal,
click-to-toggle) beyond the scope of this ARIA/labeling pass.

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
