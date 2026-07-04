// Accessible replacement for window.prompt(). Reuses openModal()/closeModal()
// from dialog-utils.js and the shared dialog DOM/state from dialog-state.js.
// (issue #16)
import {
    dialogModalOverlay,
    dialogModal,
    dialogModalTitle,
    dialogInputGroup,
    dialogInputLabel,
    dialogInput,
    dialogError,
    dialogConfirmBtn,
    hasActiveDialog,
    resetDialogUI,
    settleDialog,
    setActiveDialog,
    cancelDialog,
    openModal
} from './dialog-state.js';

// showPromptDialog({ title, label, defaultValue, placeholder, confirmLabel, validate })
// -> Promise<string|null>. Resolves the trimmed value, or null on cancel/empty.
// `validate(value, isSubmit)` returns an error string (or falsy when valid) and is
// called on every keystroke for real-time inline feedback, and again on submit.
export function showPromptDialog({
    title,
    label,
    defaultValue = '',
    placeholder = '',
    confirmLabel = 'Confirmar',
    validate = null
} = {}) {
    // Guard against reentrancy: the dialogs share one DOM instance, so
    // opening a new one while another is pending must settle the prior
    // one first instead of orphaning its Promise.
    if (hasActiveDialog()) cancelDialog();

    return new Promise((resolve) => {
        resetDialogUI();
        dialogModalTitle.textContent = title || '';
        dialogInputGroup.hidden = false;
        dialogInputLabel.textContent = label || '';
        dialogInput.placeholder = placeholder;
        dialogInput.value = defaultValue;
        dialogConfirmBtn.textContent = confirmLabel;

        function runValidation(isSubmit) {
            const value = dialogInput.value.trim();
            const message = validate ? validate(value, isSubmit) : '';
            dialogError.textContent = message || '';
            dialogInput.classList.toggle('invalid', Boolean(message) && (isSubmit || value.length > 0));
            return message;
        }

        dialogInput.oninput = () => runValidation(false);

        function submit() {
            const message = runValidation(true);
            if (message) {
                dialogInput.focus();
                return;
            }
            const value = dialogInput.value.trim();
            settleDialog(value || null);
        }

        dialogConfirmBtn.onclick = submit;
        dialogInput.onkeydown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                submit();
            }
        };

        setActiveDialog(resolve, null);
        openModal(dialogModalOverlay, dialogModal, document.activeElement, cancelDialog);
        dialogInput.focus();
        dialogInput.select();
    });
}
