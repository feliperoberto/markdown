import { render } from 'preact'
import { App } from '@/app/app'
import { ToastProvider } from '@/components'
import { initProjectsStorage } from '@/features/projects'
import '@/styles/fonts.css'
import '@/styles/tokens.css'
import '@/styles/global.css'

const root = document.getElementById('app')

if (!root) {
  throw new Error('Root element with id "app" was not found')
}

// Issue #120 / ADR-0005: the projects blob lives in IndexedDB, which can
// only be opened asynchronously, while useProjects reads it synchronously
// on first render — so pick (and, on first run, migrate into) the storage
// backend before rendering. initProjectsStorage never rejects; every
// failure resolves to a fallback backend.
void initProjectsStorage().then(() => {
  render(
    <ToastProvider>
      <App />
    </ToastProvider>,
    root,
  )
})
