# pwa Specification

## Purpose
Progressive web app behavior: install prompts, offline operation, service worker updates and versioning.

## Requirements

### Requirement: Service worker runs in prompt mode with precaching
The build SHALL generate a Workbox service worker (`generateSW`) with `registerType: 'prompt'`, `skipWaiting: false` and `clientsClaim: true`, per docs/adr/0003-user-prompted-service-worker-updates.md, and SHALL NOT inject an external register script.

#### Scenario: New worker waits instead of taking over
- **WHEN** a new build is deployed while a tab runs the old bundle
- **THEN** the new worker installs and stays waiting until the page explicitly promotes it

Covered by: none (untested)

#### Scenario: First-ever install claims the page
- **WHEN** a visitor loads the app for the first time
- **THEN** the worker claims the page immediately so it is offline-ready after one load

Covered by: none (untested)

### Requirement: App shell is precached and navigation falls back to app.html
The service worker SHALL precache build output matching `**/*.{js,css,html,svg,png,ico,woff,woff2,json}`, SHALL use `/app.html` as navigate fallback, and SHALL define no runtime caching.

#### Scenario: Google endpoints are never cached
- **WHEN** the app requests Google OAuth or Drive endpoints
- **THEN** the request goes to the network and fails visibly when offline, because `runtimeCaching` is empty

Covered by: none (untested)

#### Scenario: Web app manifest is not generated here
- **WHEN** the PWA plugin runs
- **THEN** it emits no manifest (`manifest: false`); the manifest is owned elsewhere

Covered by: none (untested)

### Requirement: Root index.html is emitted before precache generation
The build SHALL copy `app.html` to `index.html` in the output directory during `writeBundle` so that the precache manifest includes the domain root document.

#### Scenario: Build output contains index.html
- **WHEN** the production build completes
- **THEN** `dist/index.html` exists with the same content as `dist/app.html` and is listed for precaching

Covered by: none (untested)

### Requirement: Registration is wrapped in a single adapter
Only `src/lib/pwa-register.ts` SHALL import `virtual:pwa-register`; it SHALL expose `onNeedRefresh`, `onRegistered` and `onError` handlers and an `applyUpdate` function, and SHALL suppress the library's own reload behaviour.

#### Scenario: Registered handler receives the registration
- **WHEN** the underlying registration settles
- **THEN** `onRegistered` is called with the `ServiceWorkerRegistration`, or `undefined` if unsupported

Covered by: none (untested)

#### Scenario: Registration error is forwarded
- **WHEN** service worker registration fails
- **THEN** the optional `onError` handler is called with the error

Covered by: none (untested)

### Requirement: Applying an update promotes the worker then reloads
`applyUpdate` SHALL send skip-waiting to the waiting worker, wait up to 2000 ms for `controllerchange`, and then reload the page unconditionally.

#### Scenario: User accepts the update
- **WHEN** the user triggers `applyUpdate`
- **THEN** the waiting worker is activated, the page waits for `controllerchange` or the 2 s timeout, and `window.location.reload()` runs

Covered by: none (untested)

#### Scenario: Hook delegates to the registrar
- **WHEN** the hook's `applyUpdate` is called after registration
- **THEN** the registrar's `applyUpdate` is invoked once

Covered by: src/features/pwa-update/useServiceWorkerUpdate.test.ts

### Requirement: Update availability is exposed and dismissible per page load
`useServiceWorkerUpdate` SHALL expose `needRefresh` (initially false, true after `onNeedRefresh`), and `dismiss` SHALL set it false without writing to `localStorage`.

#### Scenario: Nothing available after mount
- **WHEN** the hook mounts
- **THEN** `needRefresh` is false

Covered by: src/features/pwa-update/useServiceWorkerUpdate.test.ts

#### Scenario: Waiting worker reported
- **WHEN** the registrar calls `onNeedRefresh`
- **THEN** `needRefresh` becomes true

Covered by: src/features/pwa-update/useServiceWorkerUpdate.test.ts

#### Scenario: Dismiss is not persisted
- **WHEN** the user dismisses the banner
- **THEN** `needRefresh` becomes false and `localStorage` stays empty

Covered by: src/features/pwa-update/useServiceWorkerUpdate.test.ts

### Requirement: Update checks run on load, focus, visibility and online events
The hook SHALL call `registration.update()` once registration completes and on `focus`, `visibilitychange` and `online`, and SHALL NOT use a timer.

#### Scenario: Probe on load
- **WHEN** `onRegistered` delivers a registration
- **THEN** `update()` is called once

Covered by: src/features/pwa-update/useServiceWorkerUpdate.test.ts

#### Scenario: Re-check on focus
- **WHEN** the window gains focus after the throttle window elapsed
- **THEN** `update()` is called again

Covered by: src/features/pwa-update/useServiceWorkerUpdate.test.ts

#### Scenario: Re-check on online
- **WHEN** the `online` event fires after the throttle window elapsed
- **THEN** `update()` is called again

Covered by: src/features/pwa-update/useServiceWorkerUpdate.test.ts

### Requirement: Update checks are guarded and throttled
A check SHALL be skipped when the tab is not visible, when the browser is offline, when no registration exists, or when fewer than `minCheckIntervalMs` (default 60 000 ms) have passed since the last probe; a rejected `update()` SHALL be swallowed.

#### Scenario: Throttled
- **WHEN** a focus event occurs within the throttle window
- **THEN** no additional `update()` call is made

Covered by: src/features/pwa-update/useServiceWorkerUpdate.test.ts

#### Scenario: Hidden tab
- **WHEN** `visibilitychange` fires while the document is hidden
- **THEN** no probe is made

Covered by: src/features/pwa-update/useServiceWorkerUpdate.test.ts

#### Scenario: Offline
- **WHEN** focus fires while `navigator.onLine` is false
- **THEN** no probe is made

Covered by: src/features/pwa-update/useServiceWorkerUpdate.test.ts

#### Scenario: Event before registration does not consume the throttle
- **WHEN** a focus event precedes `onRegistered`
- **THEN** nothing is probed and the later on-load probe still fires

Covered by: src/features/pwa-update/useServiceWorkerUpdate.test.ts

#### Scenario: Probe failure is silent
- **WHEN** `update()` rejects
- **THEN** no error is thrown or left unhandled

Covered by: src/features/pwa-update/useServiceWorkerUpdate.test.ts

#### Scenario: Service workers unsupported
- **WHEN** `onRegistered` receives `undefined`
- **THEN** later events never call `update()`

Covered by: src/features/pwa-update/useServiceWorkerUpdate.test.ts

### Requirement: Hook registers once and cleans up
The hook SHALL register the service worker exactly once per mount and SHALL remove its `visibilitychange`, `focus` and `online` listeners on unmount; a registration error SHALL be logged to the console and SHALL NOT show a banner.

#### Scenario: Re-render does not re-register
- **WHEN** the component re-renders
- **THEN** `register` has been called only once

Covered by: src/features/pwa-update/useServiceWorkerUpdate.test.ts

#### Scenario: Unmount removes listeners
- **WHEN** the component unmounts and events fire
- **THEN** no further probes occur

Covered by: src/features/pwa-update/useServiceWorkerUpdate.test.ts

### Requirement: Update banner is non-modal with a permanent live region
`UpdateBanner` SHALL always render a visually hidden `role="status"` `aria-live="polite"` element that is empty when closed and contains the title when open, and SHALL render the visible banner (title and body) only when `open`.

#### Scenario: Closed
- **WHEN** `open` is false
- **THEN** no button and no visible text is rendered

Covered by: src/features/pwa-update/UpdateBanner.test.tsx

#### Scenario: Open
- **WHEN** `open` is true
- **THEN** the title (visible and in the announcer) and the body copy are rendered

Covered by: src/features/pwa-update/UpdateBanner.test.tsx

#### Scenario: Announcer node persists
- **WHEN** `open` flips from false to true
- **THEN** the same live-region DOM node now contains the title

Covered by: src/features/pwa-update/UpdateBanner.test.tsx

### Requirement: Update banner actions
The banner SHALL offer an update button labelled "Atualizar" (accessible name "Atualizar o aplicativo") that calls `onUpdate`, and a dismiss button "Agora não" without an `aria-label` override that calls `onDismiss`.

#### Scenario: Update clicked
- **WHEN** the user clicks the update button
- **THEN** `onUpdate` is called and `onDismiss` is not

Covered by: src/features/pwa-update/UpdateBanner.test.tsx

#### Scenario: Dismiss clicked
- **WHEN** the user clicks "Agora não"
- **THEN** `onDismiss` is called and `onUpdate` is not

Covered by: src/features/pwa-update/UpdateBanner.test.tsx

#### Scenario: Accessible name contains visible text
- **WHEN** the update button is inspected
- **THEN** its aria-label contains its visible text (WCAG 2.5.3) and the dismiss button has no aria-label

Covered by: src/features/pwa-update/UpdateBanner.test.tsx

### Requirement: Update prompt is mounted in the app shell
`PwaUpdatePrompt` SHALL bind the real registrar to the hook and render `UpdateBanner` with `needRefresh`, `applyUpdate` and `dismiss`.

#### Scenario: App renders the prompt
- **WHEN** the app shell renders
- **THEN** `PwaUpdatePrompt` is mounted (mocked to null in app tests)

Covered by: none (untested)

### Requirement: Chromium install button follows beforeinstallprompt
`useInstallPrompt` SHALL capture `beforeinstallprompt` (calling `preventDefault`), expose `canInstall` while an event is held, and clear it on `appinstalled`, which also marks the app standalone; `promptInstall` SHALL show the native prompt, show the success toast "✅ App instalado!" only when the outcome is accepted, and then discard the event.

#### Scenario: Install offered
- **WHEN** the browser fires `beforeinstallprompt`
- **THEN** `canInstall` is true and an "Instalar" button is rendered

Covered by: none (untested)

#### Scenario: Install accepted
- **WHEN** the user accepts the native prompt
- **THEN** the success toast is shown and `canInstall` becomes false

Covered by: none (untested)

#### Scenario: Install dismissed
- **WHEN** the user dismisses the native prompt
- **THEN** no toast is shown and `canInstall` becomes false

Covered by: none (untested)

### Requirement: Install UI is hidden when already standalone
`PwaInstallPrompt` SHALL render nothing when the app runs standalone (`display-mode: standalone` or `navigator.standalone`).

#### Scenario: Running installed
- **WHEN** the app is in standalone mode
- **THEN** neither the install button nor the iOS card is rendered

Covered by: none (untested)

### Requirement: iOS shows a one-time manual install card
On iOS/iPadOS without `beforeinstallprompt` support (including iPadOS 13+ reporting MacIntel with more than one touch point), a non-standalone `PwaInstallPrompt` SHALL open a modal with Add to Home Screen steps unless `localStorage` key `iosInstallCardDismissed` equals `"true"`; closing it SHALL store that key.

#### Scenario: First iOS visit
- **WHEN** an iOS user opens the app and the key is unset
- **THEN** the instruction modal opens

Covered by: none (untested)

#### Scenario: Card dismissed
- **WHEN** the user closes the card or presses "Entendi"
- **THEN** `iosInstallCardDismissed` is saved as `"true"` and the modal closes, staying closed on later loads

Covered by: none (untested)

#### Scenario: Non-iOS browser
- **WHEN** the platform is not iOS
- **THEN** no iOS card is shown

Covered by: none (untested)

### Requirement: Build identity is exposed as appVersion
`appVersion` SHALL equal the injected `__APP_VERSION__` (package version plus short commit sha, `GITHUB_SHA` first, then git, then `local`) and SHALL fall back to `"dev"` when it is undefined; the Drive config panel displays it as "Versão <appVersion>".

#### Scenario: Not injected
- **WHEN** running under Vitest without `define`
- **THEN** `appVersion` is `"dev"`

Covered by: src/lib/app-version.test.ts

#### Scenario: Injected
- **WHEN** `__APP_VERSION__` is `9.9.9+abc1234`
- **THEN** `appVersion` equals that string

Covered by: src/lib/app-version.test.ts

### Requirement: Connectivity is read from navigator.onLine
`isNavigatorOnline` SHALL return false only when `navigator.onLine` is strictly `false`, and `useOnlineStatus` SHALL initialise from it and follow window `online` and `offline` events until unmount.

#### Scenario: Strict false only
- **WHEN** `navigator.onLine` is undefined or `navigator` is missing
- **THEN** the app is treated as online

Covered by: src/lib/useOnlineStatus.test.ts

#### Scenario: Live updates
- **WHEN** `offline` then `online` events fire
- **THEN** the hook value goes false then true

Covered by: src/lib/useOnlineStatus.test.ts

#### Scenario: Initial offline
- **WHEN** the hook mounts while offline
- **THEN** it returns false

Covered by: src/lib/useOnlineStatus.test.ts

### Requirement: Local editing works offline and Drive surfaces the offline state
With the network disabled, the editor SHALL keep accepting and previewing edits, and the Drive sync UI SHALL show an Offline status and an offline notice.

#### Scenario: Offline golden path
- **WHEN** the context goes offline after a file is created
- **THEN** typing in the editor and viewing the preview still work, the "Offline" status is visible, and the Drive config dialog shows the offline notice

Covered by: e2e/offline-golden-path.spec.ts

### Requirement: TODO: Install flow has no automated tests
The install hook, platform detection, `PwaInstallPrompt`, `IosInstallCard` and `InstallButton` SHALL have unit tests covering the Chromium and iOS paths.

#### Scenario: Install paths covered
- **WHEN** the test suite runs
- **THEN** tests exercise `beforeinstallprompt`, `appinstalled`, iOS detection and the dismissed-card key

Evidence: src/features/pwa-install/ contains no `*.test.*` file.

### Requirement: TODO: Update failure is silent
When `applyUpdate` fails (for example `updateSW(true)` rejects), the user SHALL get feedback and the banner SHALL stay available instead of the click doing nothing.

#### Scenario: Apply fails
- **WHEN** the registrar's `applyUpdate` rejects
- **THEN** the user is told the update failed and can retry

Evidence: src/features/pwa-update/useServiceWorkerUpdate.ts:119 swallows the rejection with `.catch(() => {})`; src/lib/pwa-register.ts:83-93 has no error path and no test.

### Requirement: TODO: Offline app-shell load is not verified
The suite SHALL verify that the precached app shell loads offline after a reload and that the generated worker config matches ADR-0003.

#### Scenario: Reload while offline
- **WHEN** a previously visited app is reloaded with the network disabled
- **THEN** the shell loads from the precache and `index.html` is in the precache manifest

Evidence: e2e/offline-golden-path.spec.ts:306 goes offline after load and never reloads; vite.config.ts:99-128 and :47-56 have no test.

### Requirement: TODO: Failed install prompt leaves a stale event
If `deferredPrompt.prompt()` or `userChoice` rejects, `promptInstall` SHALL still discard the held event so the button does not stay visible with an unusable event.

#### Scenario: Prompt throws
- **WHEN** the native prompt call rejects
- **THEN** `canInstall` becomes false

Evidence: src/features/pwa-install/useInstallPrompt.ts:52-61 clears state only after both awaits succeed.
