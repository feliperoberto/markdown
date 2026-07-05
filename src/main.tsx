import { render } from 'preact'
import { App } from '@/app/app'
import { ToastProvider } from '@/components'

const root = document.getElementById('app')

if (!root) {
  throw new Error('Root element with id "app" was not found')
}

render(
  <ToastProvider>
    <App />
  </ToastProvider>,
  root,
)
