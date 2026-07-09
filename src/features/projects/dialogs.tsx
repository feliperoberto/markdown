// Accessible create/rename/delete dialogs for the projects feature.
//
// Issue #16 ("Replace native prompt()/confirm() with accessible custom
// dialogs") shipped vanilla-JS `showPromptDialog`/`showConfirmDialog`
// helpers wired to the legacy `prototype/index.html` DOM. This module keeps
// the exact same async call signatures, but now renders the shared `Modal`
// primitive (src/components/Modal.tsx) from the #22 component library
// imperatively into a detached container, so callers (ProjectsSidebar,
// ProjectGroup, FileRow) don't need to change at all.
import { render } from 'preact'
import type { ComponentChild } from 'preact'
import { useState } from 'preact/hooks'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'

export interface PromptDialogOptions {
  title: string
  label?: string
  defaultValue?: string
  placeholder?: string
  validate?: (value: string) => string | void | null | undefined
  /**
   * Confirm-button label. Defaults to "Salvar" for backward
   * compatibility, but callers should pass the specific action verb
   * ("Criar", "Renomear") per the copy guide (`docs/copy-guide.md` §2):
   * a generic form-submit word is weaker than naming the actual action.
   */
  confirmLabel?: string
}

export interface ConfirmDialogOptions {
  title: string
  message: string
  /** Confirm-button label. Defaults to "Confirmar" for backward compatibility. */
  confirmLabel?: string
  /** Renders the confirm button as `danger` (red) instead of the default variant. */
  danger?: boolean
}

let dialogIdSeq = 0

function mountDialog(renderContent: (unmount: () => void) => ComponentChild): void {
  const container = document.createElement('div')
  document.body.appendChild(container)

  function unmount() {
    render(null, container)
    container.remove()
  }

  render(renderContent(unmount), container)
}

interface PromptModalProps extends PromptDialogOptions {
  titleId: string
  inputId: string
  onResolve: (value: string | null) => void
}

function PromptModal({
  title,
  label,
  defaultValue = '',
  placeholder,
  validate,
  confirmLabel = 'Salvar',
  titleId,
  inputId,
  onResolve,
}: PromptModalProps) {
  const [value, setValue] = useState(defaultValue)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(true)

  function close(result: string | null) {
    setOpen(false)
    onResolve(result)
  }

  // Validates on every keystroke (matching the prototype's PromptDialog),
  // but only surfaces the error once the field has content or the user
  // tried to submit — so an empty field doesn't show "Digite um nome…"
  // before the user has typed anything.
  function runValidation(currentValue: string, isSubmit: boolean): string | null {
    const trimmed = currentValue.trim()
    const message = validate?.(trimmed) || null
    setError(isSubmit || trimmed.length > 0 ? message : null)
    return message
  }

  function handleInput(event: Event) {
    const next = (event.target as HTMLInputElement).value
    setValue(next)
    runValidation(next, false)
  }

  function handleSubmit(event: Event) {
    event.preventDefault()
    const validationError = runValidation(value, true)
    if (validationError) return
    close(value.trim() || null)
  }

  return (
    <Modal
      open={open}
      onClose={() => close(null)}
      titleId={titleId}
      title={title}
      footer={
        <>
          <Button variant="default" onClick={() => close(null)}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={handleSubmit}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit}>
        <label htmlFor={inputId}>{label ?? title}</label>
        <input
          id={inputId}
          type="text"
          class={`config-input${error ? ' invalid' : ''}`}
          value={value}
          placeholder={placeholder}
          onInput={handleInput}
        />
        {error && <p role="alert">{error}</p>}
      </form>
    </Modal>
  )
}

// Resolves the trimmed value, or null on cancel / empty / failed validation.
export function showPromptDialog(options: PromptDialogOptions): Promise<string | null> {
  return new Promise((resolve) => {
    const id = dialogIdSeq++
    mountDialog((unmount) => (
      <PromptModal
        {...options}
        titleId={`prompt-dialog-title-${id}`}
        inputId={`prompt-dialog-input-${id}`}
        onResolve={(result) => {
          resolve(result)
          setTimeout(unmount, 0)
        }}
      />
    ))
  })
}

interface ConfirmModalProps extends ConfirmDialogOptions {
  titleId: string
  onResolve: (confirmed: boolean) => void
}

function ConfirmModal({
  title,
  message,
  confirmLabel = 'Confirmar',
  danger = true,
  titleId,
  onResolve,
}: ConfirmModalProps) {
  const [open, setOpen] = useState(true)

  function close(confirmed: boolean) {
    setOpen(false)
    onResolve(confirmed)
  }

  return (
    <Modal
      open={open}
      onClose={() => close(false)}
      titleId={titleId}
      title={title}
      footer={
        <>
          <Button variant="default" onClick={() => close(false)}>
            Cancelar
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={() => close(true)}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p>{message}</p>
    </Modal>
  )
}

export function showConfirmDialog(options: ConfirmDialogOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const id = dialogIdSeq++
    mountDialog((unmount) => (
      <ConfirmModal
        {...options}
        titleId={`confirm-dialog-title-${id}`}
        onResolve={(confirmed) => {
          resolve(confirmed)
          setTimeout(unmount, 0)
        }}
      />
    ))
  })
}
