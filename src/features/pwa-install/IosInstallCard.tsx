import type { JSX } from 'preact'
import { Button, Modal } from '@/components'

export interface IosInstallCardProps {
  open: boolean
  onClose: () => void
}

const TITLE_ID = 'ios-install-card-title'

/**
 * iOS/iPadOS has no `beforeinstallprompt` event, so there is nothing to
 * "listen" for — instead we show a one-time instructional card explaining
 * the manual Share -> Add to Home Screen flow. Built on the shared `Modal`
 * primitive (see `src/components/README.md#2-modal`) to match the app's
 * existing dialog/onboarding chrome instead of inventing new modal styling.
 */
export function IosInstallCard({ open, onClose }: IosInstallCardProps): JSX.Element {
  return (
    <Modal
      open={open}
      onClose={onClose}
      titleId={TITLE_ID}
      title="Instalar no seu iPhone/iPad"
      closeLabel="Fechar instruções de instalação"
      footer={
        <Button variant="primary" onClick={onClose}>
          Entendi
        </Button>
      }
    >
      <p>O Safari no iOS não permite instalar apps automaticamente. Para instalar:</p>
      <ol>
        <li>
          Toque no ícone de <strong>Compartilhar</strong> <span aria-hidden="true">⬆️</span> na
          barra do Safari.
        </li>
        <li>
          Selecione <strong>Adicionar à Tela de Início</strong>.
        </li>
        <li>
          Toque em <strong>Adicionar</strong> no canto superior direito.
        </li>
      </ol>
    </Modal>
  )
}
