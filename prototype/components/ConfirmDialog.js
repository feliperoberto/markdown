// Accessible replacement for window.confirm(). Reuses openModal()/closeModal()
// from dialog-utils.js and the shared dialog DOM/state from dialog-state.js.
// (issue #16)
import {
    dialogModalOverlay,
    dialogModal,
    dialogModalTitle,
    dialogMessage,
    dialogConfirmBtn,
    dialogCancelBtn,
    hasActiveDialog,
    resetDialogUI,
    settleDialog,
    setActiveDialog,
    cancelDialog,
    openModal
} from './dialog-state.js';

// showConfirmDialog({ title, message, confirmLabel, cancelLabel, danger })
// -> Promise<boolean>. Resolves true only when the confirm button is pressed.
export function showConfirmDialog({
    title,
    message,
    confirmLabel = 'Confirmar',
    cancelLabel = 'Cancelar',
    danger = false
} = {}) {
    // Guard against reentrancy: see showPromptDialog for why.
    if (hasActiveDialog()) cancelDialog();

    return new Promise((resolve) => {
        resetDialogUI();
        dialogModalTitle.textContent = title || '';
        dialogMessage.hidden = false;
        dialogMessage.textContent = message || '';
        dialogConfirmBtn.textContent = confirmLabel;
        dialogCancelBtn.textContent = cancelLabel;
        if (danger) dialogConfirmBtn.classList.add('danger');

        dialogConfirmBtn.onclick = () => settleDialog(true);

        setActiveDialog(resolve, false);
        openModal(dialogModalOverlay, dialogModal, document.activeElement, cancelDialog);
    });
}
