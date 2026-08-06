import type { JSX } from 'preact'
import { registerServiceWorkerUpdates } from '@/lib/pwa-register'
import { useServiceWorkerUpdate } from './useServiceWorkerUpdate'
import { UpdateBanner } from './UpdateBanner'

/**
 * App-shell entry point for ADR-0003: binds the real `virtual:pwa-register`
 * registrar (the only runtime import of it outside `@/lib/pwa-register`
 * itself) to `useServiceWorkerUpdate`, and renders the resulting state as
 * an `UpdateBanner`. Kept deliberately thin and untested — all the actual
 * branching lives in the hook and the presentational banner, both tested
 * independently.
 */
export function PwaUpdatePrompt(): JSX.Element | null {
  const { needRefresh, applyUpdate, dismiss } = useServiceWorkerUpdate({
    register: registerServiceWorkerUpdates,
  })

  return <UpdateBanner open={needRefresh} onUpdate={applyUpdate} onDismiss={dismiss} />
}
