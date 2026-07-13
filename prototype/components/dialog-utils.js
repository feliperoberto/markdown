// ============================================================
// ACCESSIBILITY HELPERS — focus trap & modal open/close
// Reusable vanilla-JS patterns. Any custom dialog/menu (e.g. issue #16)
// should reuse trapFocus()/openModal()/closeModal() instead of
// re-implementing focus management.
// Extracted from prototype/index.html as part of the #16 follow-up
// (making these genuinely shared, standalone modules).
// ============================================================

// Stack of currently-open overlays, topmost last. Used so that a single
// Escape keypress only closes the topmost modal, even if more than one
// is open at once (e.g. Config + Drive).
export const _openModalStack = [];

export function getFocusableElements(container) {
    return Array.from(container.querySelectorAll(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )).filter(el => el.offsetParent !== null);
}

// Cycles Tab/Shift+Tab within `containerEl`. Returns a cleanup function.
export function trapFocus(containerEl) {
    function handleKeydown(e) {
        if (e.key !== 'Tab') return;
        const focusable = getFocusableElements(containerEl);
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
        }
    }
    containerEl.addEventListener('keydown', handleKeydown);
    return () => containerEl.removeEventListener('keydown', handleKeydown);
}

// Opens a modal: stores the triggering element, moves focus inside,
// traps Tab navigation and closes on Escape.
export function openModal(overlayEl, modalEl, triggerEl, onEscape) {
    overlayEl._lastFocusedElement = triggerEl || document.activeElement;
    overlayEl.classList.add('visible');
    overlayEl.setAttribute('aria-hidden', 'false');
    _openModalStack.push(overlayEl);

    const focusable = getFocusableElements(modalEl);
    (focusable[0] || modalEl).focus();

    const removeTrap = trapFocus(modalEl);

    function handleEscape(e) {
        if (e.key !== 'Escape') return;
        // Only the topmost open modal responds to Escape.
        if (_openModalStack[_openModalStack.length - 1] !== overlayEl) return;
        e.stopPropagation();
        // Callers that layer extra state on top of closeModal (e.g. the
        // Promise-based custom dialogs) pass onEscape so Escape settles
        // that state too, instead of only closing the modal visually.
        (onEscape || (() => closeModal(overlayEl, modalEl)))();
    }
    document.addEventListener('keydown', handleEscape);

    overlayEl._a11yCleanup = () => {
        removeTrap();
        document.removeEventListener('keydown', handleEscape);
    };
}

// Closes a modal opened with openModal() and returns focus to the trigger.
export function closeModal(overlayEl, modalEl) {
    overlayEl.classList.remove('visible');
    overlayEl.setAttribute('aria-hidden', 'true');
    const stackIndex = _openModalStack.indexOf(overlayEl);
    if (stackIndex !== -1) _openModalStack.splice(stackIndex, 1);
    if (overlayEl._a11yCleanup) {
        overlayEl._a11yCleanup();
        overlayEl._a11yCleanup = null;
    }
    if (overlayEl._lastFocusedElement && typeof overlayEl._lastFocusedElement.focus === 'function') {
        overlayEl._lastFocusedElement.focus();
    }
    overlayEl._lastFocusedElement = null;
}
