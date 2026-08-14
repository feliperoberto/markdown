import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/preact'
import { ToastProvider } from '@/components'
import { App } from './app'

// PwaUpdatePrompt's only runtime import of `virtual:pwa-register` (see its
// own doc comment) is a Vite build-time virtual module that doesn't exist
// under Vitest's plugin set (vitest.config.ts deliberately excludes the PWA
// plugin — see its header comment), so rendering the real App would fail to
// resolve that import. Stubbed out here for the same reason
// PwaUpdatePrompt itself is "deliberately thin and untested" — this file's
// scope is app.tsx's sidebar-drawer dismissal, not the PWA update banner.
vi.mock('@/features/pwa-update', () => ({ PwaUpdatePrompt: () => null }))

// app.tsx composes many features (projects, editor, drive-sync, import/export,
// PWA prompts) behind a single useOutsideClick call that dismisses the mobile
// sidebar drawer. This file exercises only that one behavior end-to-end
// through the real App — not a general app.tsx test suite — since it's the
// one currently-untested path the useOutsideClick extraction (replacing
// app.tsx's previously inline, hand-rolled outside-click effect) touches.
function renderApp() {
  return render(
    <ToastProvider>
      <App />
    </ToastProvider>,
  )
}

describe('App sidebar drawer', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
    // ThemeToggle (rendered by App) reads window.matchMedia on mount, which
    // jsdom doesn't implement — same stub as ThemeToggle.test.tsx.
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    )
  })

  afterEach(() => {
    cleanup()
  })

  it('hides the sidebar drawer on an outside click', async () => {
    renderApp()

    const sidebar = document.getElementById('projectsSidebar')
    expect(sidebar?.className).not.toContain('sidebar-hidden')

    fireEvent.click(document.body)

    expect(sidebar?.className).toContain('sidebar-hidden')
  })

  it('does not hide the drawer on a click inside it', () => {
    renderApp()

    const sidebar = document.getElementById('projectsSidebar')
    fireEvent.click(screen.getByText('Projetos'))

    expect(sidebar?.className).not.toContain('sidebar-hidden')
  })

  it('does not hide the drawer on a click inside an open dialog', () => {
    renderApp()

    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    document.body.appendChild(dialog)

    try {
      const sidebar = document.getElementById('projectsSidebar')
      fireEvent.click(dialog)

      expect(sidebar?.className).not.toContain('sidebar-hidden')
    } finally {
      dialog.remove()
    }
  })
})

// Ctrl+S/Cmd+S (useSaveShortcut) is bound at document level in app.tsx, not
// on the editor textarea, specifically so it works regardless of what
// currently has focus. This exercises that end-to-end through the real App
// (drive-sync isn't stubbed here — see the file's header comment — so with
// no Client ID configured the observable effect is the config modal
// opening, which is enough to prove the keystroke reached app.tsx's
// handler from a document-level dispatch).
describe('App keyboard shortcuts', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    )
  })

  afterEach(() => {
    cleanup()
  })

  it('Ctrl+S reaches the app and opens the Drive modal even when focus is elsewhere (not the editor)', () => {
    renderApp()

    // Focus something other than the editor textarea, to prove the
    // shortcut isn't scoped to it.
    document.getElementById('sidebarMenuButton')?.focus()
    expect(screen.queryByRole('dialog')).toBeNull()

    fireEvent.keyDown(document, { key: 's', ctrlKey: true })

    expect(screen.getByRole('dialog')).not.toBeNull()
  })
})
