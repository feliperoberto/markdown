import { afterEach, describe, expect, it, vi } from 'vitest'
import { copyToClipboard } from './copyToClipboard'

describe('copyToClipboard', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    document.execCommand = undefined as unknown as typeof document.execCommand
  })

  it('uses the async Clipboard API when available in a secure context', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    vi.stubGlobal('isSecureContext', true)
    // window.isSecureContext is read directly, not via the stubbed navigator global.
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true })

    await copyToClipboard('hello')

    expect(writeText).toHaveBeenCalledWith('hello')
  })

  // Regression test: the prototype falls back to execCommand('copy') when
  // the async API is unavailable/denied; the migrated app previously had
  // no fallback at all and just surfaced an error toast in that case.
  it('falls back to execCommand when the Clipboard API rejects', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'))
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true })

    const execCommand = vi.fn().mockReturnValue(true)
    document.execCommand = execCommand

    await copyToClipboard('fallback text')

    expect(writeText).toHaveBeenCalled()
    expect(execCommand).toHaveBeenCalledWith('copy')
  })

  it('falls back to execCommand when navigator.clipboard is unavailable', async () => {
    vi.stubGlobal('navigator', {})
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true })

    const execCommand = vi.fn().mockReturnValue(true)
    document.execCommand = execCommand

    await copyToClipboard('no clipboard api')

    expect(execCommand).toHaveBeenCalledWith('copy')
  })

  it('throws when the execCommand fallback itself fails', async () => {
    vi.stubGlobal('navigator', {})
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true })

    document.execCommand = vi.fn().mockReturnValue(false)

    await expect(copyToClipboard('will fail')).rejects.toThrow('Não foi possível copiar')
  })

  it('removes the temporary textarea from the DOM after the fallback runs', async () => {
    vi.stubGlobal('navigator', {})
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true })
    document.execCommand = vi.fn().mockReturnValue(true)

    await copyToClipboard('cleanup check')

    expect(document.querySelector('textarea')).toBeNull()
  })
})
