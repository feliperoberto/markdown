import { render } from 'preact'
import { App } from '@/app/app'
import { ToastProvider } from '@/components'
import '@/styles/fonts.css'
import '@/styles/tokens.css'
import '@/styles/global.css'

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
