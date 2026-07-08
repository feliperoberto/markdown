import type { JSX } from 'preact'
import { useState } from 'preact/hooks'
import { useSplashScreen } from './useSplashScreen'

/**
 * The branded first-run welcome screen (see useSplashScreen for the
 * dismiss/persistence logic). Renders `null` once dismissed rather than
 * keeping a `.hidden` class around — this app has no reason to keep the
 * splash markup mounted after dismissal (the prototype kept it in the DOM
 * for the CSS opacity transition; Preact re-mounts happen fast enough
 * that the effect isn't missed here).
 */
export function SplashScreen(): JSX.Element | null {
  const { isVisible, dismiss } = useSplashScreen()
  const [dontShowAgain, setDontShowAgain] = useState(false)

  if (!isVisible) return null

  return (
    <div class="splash-screen">
      <div
        class="wash"
        aria-hidden="true"
        style={{
          width: '300px',
          height: '300px',
          background: 'var(--c-coral)',
          top: '10%',
          left: '-10%',
        }}
      />
      <div
        class="wash"
        aria-hidden="true"
        style={{
          width: '260px',
          height: '260px',
          background: 'var(--c-indigo)',
          bottom: '10%',
          right: '-10%',
        }}
      />
      <div class="splash-content">
        <div class="splash-mark">
          <span>M</span>
        </div>
        <div class="splash-kicker">Editor de Markdown</div>
        <div class="splash-title">Marcar para Existir</div>
        <div class="splash-subtitle">Você marca com a mão. A máquina lê a estrutura.</div>
      </div>
      <div class="splash-footer">
        <div class="splash-checkbox-group">
          <input
            type="checkbox"
            id="splashDontShow"
            checked={dontShowAgain}
            onChange={(e) => setDontShowAgain((e.target as HTMLInputElement).checked)}
          />
          <label htmlFor="splashDontShow">Não mostrar de novo</label>
        </div>
        <button class="btn-splash-dismiss" onClick={() => dismiss(dontShowAgain)}>
          Começar a marcar
        </button>
      </div>
    </div>
  )
}
