## Why

The PWA domain (service-worker registration and caching, user-prompted updates, install experience, build identity, connectivity detection) has no OpenSpec coverage. This change records how it behaves today so later changes can be written as deltas against it.

## What Changes

- Documents current behaviour only; no source, config or test is modified.
- Records gaps and suspected defects as `TODO:` requirements (untested install flow, silent update-apply failure, no automated check of offline precache or the generated worker configuration).

## Capabilities

### New Capabilities
- `pwa`: Workbox precaching in prompt mode (ADR-0003), update detection and banner, Chromium/iOS install prompts, build version identity, online status.

### Modified Capabilities
None.

## Impact

- Code read: `src/features/pwa-install`, `src/features/pwa-update`, `src/lib/{pwa-register,app-version,useOnlineStatus}.ts`, PWA section of `vite.config.ts`.
- Tests mapped: `UpdateBanner.test.tsx`, `useServiceWorkerUpdate.test.ts`, `app-version.test.ts`, `useOnlineStatus.test.ts`, `e2e/offline-golden-path.spec.ts`.
- Reference: `docs/adr/0003-user-prompted-service-worker-updates.md`.
