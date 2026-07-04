// ============================================================
// Shared state/DOM wiring for the custom prompt/confirm dialogs.
// The dialogs share one DOM instance (#dialogModal), so only one can be
// open at a time — this module owns that shared instance and the
// reentrancy bookkeeping, and is imported by both PromptDialog.js and
// ConfirmDialog.js. (issue #16 follow-up)
// ============================================================
import { openModal, closeModal } from './dialog-utils.js';

export const dialogModalOverlay = document.getElementById('dialogModalOverlay');
export const dialogModal = document.getElementById('dialogModal');
export const dialogModalTitle = document.getElementById('dialogModalTitle');
export const dialogModalClose = document.getElementById('dialogModalClose');
export const dialogMessage = document.getElementById('dialogMessage');
export const dialogInputGroup = document.getElementById('dialogInputGroup');
export const dialogInputLabel = document.getElementById('dialogInputLabel');
export const dialogInput = document.getElementById('dialogInput');
export const dialogError = document.getElementById('dialogError');
export const dialogConfirmBtn = document.getElementById('dialogConfirmBtn');
export const dialogCancelBtn = document.getElementById('dialogCancelBtn');

// `_activeDialogResolve` is the currently pending dialog's Promise resolver;
// `_activeDialogCancelValue` is what to resolve with when it's dismissed via
// close/cancel/overlay-click/Escape (null for showPromptDialog, false for
// showConfirmDialog).
let _activeDialogResolve = null;
let _activeDialogCancelValue = null;

export function setActiveDialog(resolve, cancelValue) {
    _activeDialogResolve = resolve;
    _activeDialogCancelValue = cancelValue;
}

export function hasActiveDialog() {
    return Boolean(_activeDialogResolve);
}

export function resetDialogUI() {
    dialogMessage.hidden = true;
    dialogMessage.textContent = '';
    dialogInputGroup.hidden = true;
    dialogInput.value = '';
    dialogInput.classList.remove('invalid');
    dialogInput.oninput = null;
    dialogError.textContent = '';
    dialogConfirmBtn.classList.remove('danger');
    dialogConfirmBtn.disabled = false;
    dialogCancelBtn.textContent = 'Cancelar';
}

// Settles whichever dialog is currently open with `result`, closes it, and
// resets its UI. Also used as a reentrancy guard: if a new dialog is opened
// before a prior one settled, its Promise is resolved with its cancel value
// instead of being silently orphaned.
export function settleDialog(result) {
    const resolve = _activeDialogResolve;
    _activeDialogResolve = null;
    closeModal(dialogModalOverlay, dialogModal);
    resetDialogUI();
    if (resolve) resolve(result);
}

export function cancelDialog() {
    settleDialog(_activeDialogCancelValue);
}

dialogModalClose.addEventListener('click', cancelDialog);
dialogCancelBtn.addEventListener('click', cancelDialog);
dialogModalOverlay.addEventListener('click', (e) => {
    if (e.target === dialogModalOverlay) cancelDialog();
});

export { openModal, closeModal };
