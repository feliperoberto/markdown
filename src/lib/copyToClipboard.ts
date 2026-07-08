/**
 * Copies `text` to the clipboard, matching the prototype's copy handler:
 * try the async Clipboard API first, and fall back to a hidden
 * `<textarea>` + `document.execCommand('copy')` if it's unavailable or
 * rejects (non-secure context, permission denied, some in-app/embedded
 * browser webviews). Without the fallback, copy simply fails — visibly,
 * via an error toast — in every context where the async API is blocked,
 * even though the older execCommand path would have quietly worked.
 */
export async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text)
      return
    } catch {
      // Fall through to the execCommand fallback below.
    }
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.top = '-9999px'
  textarea.style.left = '-9999px'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.focus()
  textarea.select()

  try {
    const ok = document.execCommand('copy')
    if (!ok) throw new Error('Não foi possível copiar')
  } finally {
    document.body.removeChild(textarea)
  }
}
