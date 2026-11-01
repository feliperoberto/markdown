## ADDED Requirements

### Requirement: Sidebar drawer dismissal on outside click
The app SHALL close the projects sidebar drawer when a click lands outside `#projectsSidebar`, `#sidebarMenuButton` and any `[role="dialog"]`, at every viewport width, and SHALL ignore clicks inside them.

#### Scenario: Click outside closes the drawer
- **WHEN** the drawer is open and the user clicks on the document body
- **THEN** `#projectsSidebar` gains the `sidebar-hidden` class
Covered by: src/app/app.test.tsx

#### Scenario: Click inside the drawer keeps it open
- **WHEN** the user clicks an element inside `#projectsSidebar`
- **THEN** the drawer does not gain `sidebar-hidden`
Covered by: src/app/app.test.tsx

#### Scenario: Click inside a dialog keeps it open
- **WHEN** a `[role="dialog"]` element exists and the user clicks it
- **THEN** the drawer stays open
Covered by: src/app/app.test.tsx

### Requirement: Sidebar menu button toggles the drawer
The header menu button (`#sidebarMenuButton`, label "Abrir menu de projetos") SHALL toggle the drawer and expose its state through `aria-expanded` and `aria-controls="projectsSidebar"`; the drawer MUST be open on first paint.

#### Scenario: Toggle via hamburger
- **WHEN** the user clicks the menu button twice
- **THEN** the drawer hides, then shows again, and `aria-expanded` mirrors the open state
Covered by: none (untested)

### Requirement: Drawer closes after creating or uploading a file on narrow viewports
The app SHALL close the drawer after a file is created from the create-file dialog or after an upload selects the last created file, only when `(max-width: 768px)` matches; plain file selection MUST NOT close it.

#### Scenario: Create file on mobile
- **WHEN** a file is created and the viewport is 768px wide or less
- **THEN** the drawer is hidden so the new file is visible
Covered by: none (untested)

#### Scenario: Create file on desktop
- **WHEN** a file is created and the viewport is wider than 768px
- **THEN** the drawer stays open
Covered by: none (untested)

### Requirement: Cloud button routes by Drive readiness
The header cloud button SHALL open the Drive configuration modal when Drive `needsConfig` (not configured or not connected) and SHALL otherwise start a sync without opening a modal.

#### Scenario: Not configured
- **WHEN** no Client ID is stored and the cloud button is clicked
- **THEN** the "Configurações do Google Drive" modal opens
Covered by: src/app/app.test.tsx

#### Scenario: Configured but not connected
- **WHEN** a Client ID is stored, no connection exists, and the cloud button is clicked
- **THEN** the config modal opens and no network request is made
Covered by: src/app/app.test.tsx

#### Scenario: Configured and connected
- **WHEN** Drive is connected and the cloud button is clicked
- **THEN** a sync starts and no dialog opens
Covered by: src/app/app.test.tsx

### Requirement: Document-wide save shortcut
The app SHALL trigger a Drive sync request on Ctrl+S or Cmd+S from anywhere in the document (capture phase), call `preventDefault()` on the matching chord, and fire even while a dialog is open. See `docs/accessibility-notes.md` section 6.

#### Scenario: Shortcut reaches the app from a non-editor focus
- **WHEN** focus is on the menu button and Ctrl+S is pressed with Drive unconfigured
- **THEN** the config dialog opens
Covered by: src/app/app.test.tsx

#### Scenario: Chord matching
- **WHEN** Ctrl+S or Cmd+S is pressed
- **THEN** `onSave` is called once and the native save dialog is prevented
Covered by: src/lib/useSaveShortcut.test.ts

#### Scenario: Non-matching chords and repeats ignored
- **WHEN** the key is plain "s", Ctrl+Shift+S, Ctrl+Alt+S, an OS-repeated keydown, or during IME composition
- **THEN** `onSave` is not called
Covered by: src/lib/useSaveShortcut.test.ts

#### Scenario: Fires while a dialog is open
- **WHEN** a `[role="dialog"]` exists and Ctrl+S is pressed
- **THEN** `onSave` is still called
Covered by: src/lib/useSaveShortcut.test.ts

#### Scenario: End-to-end sync shortcut
- **WHEN** Ctrl+S or Cmd+S is pressed in the browser
- **THEN** the sync flow runs
Covered by: e2e/save-shortcut.spec.ts

### Requirement: Outside-click hook semantics
`useOutsideClick` SHALL listen for `click` on `document` in the capture phase only while `active` is true, call `onOutside` when the `isInside` predicate returns false, use the latest callbacks without re-subscribing, and remove its listener on unmount.

#### Scenario: Inactive does nothing
- **WHEN** `active` is false and an outside click occurs
- **THEN** `onOutside` is not called
Covered by: src/lib/useOutsideClick.test.ts

#### Scenario: Outside click fires, inside click does not
- **WHEN** active and `isInside` returns false, then true
- **THEN** `onOutside` fires only for the false case
Covered by: src/lib/useOutsideClick.test.ts

#### Scenario: Target stops propagation
- **WHEN** a click target calls `stopPropagation()` on its own click
- **THEN** `onOutside` still fires
Covered by: src/lib/useOutsideClick.test.ts

#### Scenario: Activation toggling and unmount
- **WHEN** `active` flips false to true to false, or the component unmounts
- **THEN** the listener is added and removed accordingly
Covered by: src/lib/useOutsideClick.test.ts

### Requirement: Modal accessibility and focus management
`Modal` SHALL render `role="dialog"`, `aria-modal="true"` and `aria-labelledby`, focus `initialFocusRef` or the first focusable element on open, trap Tab/Shift+Tab, close on Escape (topmost modal only) and overlay click, and restore focus to the previously focused element on close. The overlay MUST carry `aria-hidden` when closed.

#### Scenario: Focus trap wraps
- **WHEN** Tab is pressed on the last focusable element (or Shift+Tab on the first)
- **THEN** focus moves to the first (or last) element
Covered by: none (untested)

#### Scenario: Escape closes only the topmost modal
- **WHEN** two modals are open and Escape is pressed
- **THEN** only the topmost calls `onClose`
Covered by: none (untested)

#### Scenario: Re-render does not steal focus
- **WHEN** the parent re-renders with a new inline `onClose`
- **THEN** the focus-trap effect does not re-run and focus stays in the active input
Covered by: none (untested)

### Requirement: Config modal stacks above the sidebar drawer
The Modal overlay SHALL paint above the sidebar drawer so that, on a 390px-wide viewport with the drawer open, the config modal's input and buttons receive real pointer events.

#### Scenario: Modal interactable over drawer
- **WHEN** the config modal is opened on a mobile viewport with the drawer visible
- **THEN** the Client ID input can be clicked, filled and saved, showing "Configurado"
Covered by: e2e/config-modal-overlap.spec.ts

### Requirement: Toast notifications
`ToastProvider` SHALL expose `showToast(message, variant = 'success')` through `useToast()`, auto-dismiss after 2000 ms (success), 4000 ms (warning) or 6000 ms (error) plus a 300 ms exit animation, drop a repeat of the same message within 500 ms, and use `role="alert"` with `aria-live="assertive"` for errors and `role="status"` with `aria-live="polite"` otherwise. `useToast()` MUST throw outside a provider.

#### Scenario: Error toast is assertive
- **WHEN** an error toast is shown
- **THEN** it has `role="alert"` and `aria-live="assertive"`
Covered by: none (untested)

#### Scenario: Duplicate within window
- **WHEN** the same message is shown twice within 500 ms
- **THEN** only one toast is rendered
Covered by: none (untested)

### Requirement: Button primitives
`Button` SHALL render a `type="button"` element with default, primary or danger styling, and `IconButton` SHALL always set `aria-label` from its required `label` prop and pass through `title`, `aria-expanded`, `aria-controls`, `aria-haspopup` and `id`. `Checkbox` SHALL render a native checkbox labelled via `aria-label`.

#### Scenario: Icon button accessible name
- **WHEN** an `IconButton` is rendered with icon and label
- **THEN** the button is found by role and the label as its name
Covered by: src/features/theme/ThemeToggle.test.tsx

### Requirement: Breadcrumbs
`Breadcrumbs` SHALL show "project / file" when both are set, and an italic "Nenhum arquivo" placeholder otherwise.

#### Scenario: No file open
- **WHEN** project or file name is null
- **THEN** "Nenhum arquivo" is rendered
Covered by: none (untested)

### Requirement: Toolbar actions and batch download area
The toolbar SHALL place the PDF export button first and the "Baixar arquivo atual" button second inside `.toolbar-actions`; when more than one file is checked, the editor SHALL be replaced by `BatchDownloadArea` (listing entries, "Baixar ZIP" button, focusable labelled scroll region) and PDF export SHALL be disabled.

#### Scenario: Toolbar order and print
- **WHEN** the app renders with a file open and the PDF button is clicked
- **THEN** the PDF button precedes the download button and `window.print()` is called once
Covered by: src/app/app.test.tsx

#### Scenario: Batch selection replaces editor
- **WHEN** two or more files are selected for batch download
- **THEN** the batch area is shown and the PDF button is disabled
Covered by: none (untested)

### Requirement: Copy and download feedback toasts
The app SHALL show a warning "Arquivo vazio" when copying empty content, a success toast on copy or download, and an error toast with the failure message when copy, export, import or ZIP creation fails.

#### Scenario: Copy empty file
- **WHEN** the editor copy action runs with empty content
- **THEN** a warning toast "Arquivo vazio" appears and nothing is copied
Covered by: none (untested)

### Requirement: Clipboard copy with fallback
`copyToClipboard` SHALL use `navigator.clipboard.writeText` in a secure context, fall back to a hidden textarea with `execCommand('copy')` when the API is unavailable or rejects, throw when the fallback fails, and always remove the temporary textarea.

#### Scenario: Async API succeeds
- **WHEN** the Clipboard API is available in a secure context
- **THEN** it is used and no textarea is created
Covered by: src/lib/copyToClipboard.test.ts

#### Scenario: Fallback paths
- **WHEN** the API rejects or is missing
- **THEN** `execCommand('copy')` is used
Covered by: src/lib/copyToClipboard.test.ts

#### Scenario: Fallback failure and cleanup
- **WHEN** `execCommand` returns false
- **THEN** the call throws and the textarea is removed
Covered by: src/lib/copyToClipboard.test.ts

### Requirement: Theme toggle and persistence
`useTheme` SHALL resolve the initial theme from the stored `theme` value (`light` or `dark`), else from `prefers-color-scheme`, ignore corrupt stored values, set `data-theme` on the root element and persist the theme; `ThemeToggle` SHALL show a moon in light mode and a sun in dark mode. See ADR-0007 for the document theme.

#### Scenario: Defaults and stored override
- **WHEN** nothing is stored, or a valid value is stored
- **THEN** the system preference, or the stored value, wins
Covered by: src/features/theme/useTheme.test.ts

#### Scenario: Toggle persists
- **WHEN** the toggle is clicked
- **THEN** theme flips, `data-theme` updates, and the choice is stored
Covered by: src/features/theme/useTheme.test.ts

#### Scenario: Toggle icon
- **WHEN** the button is clicked in light mode
- **THEN** the icon changes from the moon to the sun
Covered by: src/features/theme/ThemeToggle.test.tsx

### Requirement: Fullscreen toggle
`useFullscreen` SHALL track the (vendor-prefixed aware) fullscreen element via `fullscreenchange`/`webkitfullscreenchange`, request fullscreen on `documentElement` when not fullscreen and exit when fullscreen, and no-op without throwing where the API is unsupported; `FullscreenToggle` SHALL render nothing when running as a standalone PWA.

#### Scenario: Request and exit
- **WHEN** toggled while not fullscreen, then while fullscreen
- **THEN** `requestFullscreen` and `exitFullscreen` are called respectively
Covered by: src/features/fullscreen/useFullscreen.test.ts

#### Scenario: Unsupported browser
- **WHEN** neither request nor exit exists
- **THEN** toggling does not throw
Covered by: src/features/fullscreen/useFullscreen.test.ts

#### Scenario: Hidden when standalone
- **WHEN** `(display-mode: standalone)` matches
- **THEN** no fullscreen button is rendered
Covered by: src/features/fullscreen/FullscreenToggle.test.tsx

### Requirement: Splash screen
`SplashScreen` SHALL render on every load unless `splashDismissed` is `"true"` in storage, show brand, title, subtitle, a companion-book download link and the install prompt, dismiss through "Começar a marcar", and persist the dismissal only when "Não mostrar de novo" is checked.

#### Scenario: Dismiss without persisting
- **WHEN** the user clicks "Começar a marcar" without the checkbox
- **THEN** the splash disappears and nothing is stored
Covered by: src/features/onboarding/SplashScreen.test.tsx

#### Scenario: Dismiss and persist
- **WHEN** the checkbox is checked before dismissing
- **THEN** `splashDismissed` is stored as `true` and later loads render nothing
Covered by: src/features/onboarding/useSplashScreen.test.ts

#### Scenario: Book link
- **WHEN** the splash renders
- **THEN** a `download` link points to `/marcar-para-existir.pdf`
Covered by: src/features/onboarding/SplashScreen.test.tsx

### Requirement: Dropdown action menus
`useDropdownMenu` SHALL anchor the menu below-left of its trigger (left clamped to 4px, bottom clamped to the viewport), focus the first `menuitem` on open, cycle ArrowUp/ArrowDown with wrapping, close on Escape or Tab with focus returned to the trigger, and close on outside click.

#### Scenario: Keyboard navigation and Escape
- **WHEN** a file row menu is opened, navigated and Escape is pressed
- **THEN** focus returns to the trigger
Covered by: e2e/file-row-actions.spec.ts

#### Scenario: Menu reached by arrow keys
- **WHEN** ArrowDown is pressed repeatedly in the menu
- **THEN** focus reaches the "Mover" items
Covered by: e2e/sidebar-reorder-menu.spec.ts

### Requirement: Drag gesture state machine
`gestureReducer` SHALL move idle to pending on `down`, pending to dragging with effect `activate` once Chebyshev distance reaches `DRAG_ACTIVATION_PX` (6), emit `commit` on up while dragging, `abort` on up while pending or on cancel, and ignore events from other pointer ids.

#### Scenario: Activation threshold
- **WHEN** movement is 5px, then 6px
- **THEN** it stays pending, then activates
Covered by: src/lib/dragGesture.test.ts

#### Scenario: Commit, abort and foreign pointers
- **WHEN** up, cancel, or a different pointer id is received
- **THEN** commit, abort, or no change results
Covered by: src/lib/dragGesture.test.ts

### Requirement: Drag auto-scroll
`autoScrollDelta` SHALL return a signed px/frame value ramping linearly up to 12 within 48px of the container top or bottom, and 0 elsewhere or when already scrolled to that extreme.

#### Scenario: Edge bands
- **WHEN** the pointer is in the top or bottom band
- **THEN** the delta is negative or positive, growing toward the edge
Covered by: src/lib/dragGesture.test.ts

### Requirement: Relative time formatting
`formatRelativeTime` SHALL return "agora" under one minute, "há Nm" under an hour, "há Nh" under a day, and "há Nd" otherwise.

#### Scenario: Buckets
- **WHEN** the difference is under 1 minute, in minutes, hours, or days
- **THEN** the matching string is returned
Covered by: src/lib/formatRelativeTime.test.ts

### Requirement: Wait for event or timeout
`waitForEventOrTimeout` SHALL resolve (never reject, settle once) when the event fires or the timeout elapses, whichever is first, and remove its listener once settled.

#### Scenario: Event vs timeout
- **WHEN** the event fires first, or never fires
- **THEN** the promise resolves immediately, or after the timeout
Covered by: src/lib/waitForEvent.test.ts

### Requirement: Scrollbar thumb visibility
Editor and preview scrollbar thumbs SHALL keep at least 3:1 contrast against their track in light and dark themes, widen on hover, and fenced code blocks SHALL use their own dark-surface thumb tokens with resting and hover contrast of at least 3:1 (hover greater than rest). Overlay-scrollbar touch devices are exempt. See `docs/accessibility-notes.md` "Scrollbars".

#### Scenario: Editor and preview contrast
- **WHEN** a 200-paragraph file is open in either theme
- **THEN** measured thumb contrast is at least 3
Covered by: e2e/scrollbar-visibility.spec.ts

#### Scenario: Code block tokens
- **WHEN** a fenced block overflows horizontally
- **THEN** its thumb tokens differ from the sheet's and meet 3:1
Covered by: e2e/scrollbar-visibility.spec.ts

#### Scenario: Hover widening
- **WHEN** the pointer hovers the editor gutter
- **THEN** more thumb columns are painted than at rest
Covered by: e2e/scrollbar-visibility.spec.ts

### Requirement: TODO: Theme is persisted before the user chooses
The theme hook SHALL persist a theme only after an explicit user choice, so a system-derived default keeps following `prefers-color-scheme`.

#### Scenario: Desired behaviour
- **WHEN** a first-time visitor loads the app with no stored theme
- **THEN** nothing is written to `theme` until the toggle is used
Covered by: none (untested)

Evidence: `src/features/theme/useTheme.ts:29-32` runs `localStorageAdapter.set` in an effect on mount, freezing the initial system value as an explicit preference.

### Requirement: TODO: Splash screen lacks dialog semantics and focus handling
The splash screen SHALL behave as a modal for assistive technology (role, label, focus placement and restore, background inert) since it covers the app.

#### Scenario: Desired behaviour
- **WHEN** the splash is shown
- **THEN** focus moves into it, Tab stays inside, and dismissal returns focus to the app
Covered by: none (untested)

Evidence: `src/features/onboarding/SplashScreen.tsx:20-62` renders plain `div`s with no `role`, `aria-modal` or focus logic, unlike `src/components/Modal.tsx`.

### Requirement: TODO: Fullscreen button shown where it cannot work
The fullscreen toggle SHALL be hidden or disabled where neither `requestFullscreen` nor the webkit variant exists (iOS Safari), instead of rendering a button that does nothing.

#### Scenario: Desired behaviour
- **WHEN** the browser has no Fullscreen API
- **THEN** the toggle is not rendered
Covered by: none (untested)

Evidence: `src/features/fullscreen/useFullscreen.ts:5-9,41-55` documents the silent no-op; `FullscreenToggle.tsx:21` only checks standalone mode.

### Requirement: TODO: Toast dedupe ignores variant and timers are never cleared
Toast deduplication SHALL consider the variant, and pending dismiss timers SHALL be cleared on provider unmount.

#### Scenario: Desired behaviour
- **WHEN** a success and an error toast share a message within 500 ms
- **THEN** both are shown
Covered by: none (untested)

Evidence: `src/components/Toast.tsx:62-71` compares only `message`; `Toast.tsx:84` `setTimeout` handles are not tracked.

### Requirement: TODO: Accessibility notes drift from the current UI
`docs/accessibility-notes.md` SHALL match current labels and structure: it lists `#driveBtn` as "Abrir Google Drive" and close buttons as "Fechar configurações"/"Fechar Google Drive", while the app uses "Sincronizar com Google Drive" and a shared "Fechar" close label.

#### Scenario: Desired behaviour
- **WHEN** a reader compares the table in section 1 to the rendered controls
- **THEN** every `aria-label` listed matches the component source
Covered by: none (untested)

Evidence: `docs/accessibility-notes.md:7-24` versus `src/components/Modal.tsx:23` (`closeLabel = 'Fechar'`) and `src/app/app.test.tsx` (button "Sincronizar com Google Drive").
