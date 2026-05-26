/**
 * Modal.jsx — Production-grade base modal component.
 *
 * Features:
 *  - position: fixed → always centered to viewport, never to page height
 *  - Backdrop blur overlay (rgba + blur)
 *  - Body scroll-lock while open (class added/removed on document.body)
 *  - Escape key closes modal
 *  - Click-outside (backdrop) closes modal
 *  - Focus trap: first focusable element auto-focused on open
 *  - Smooth enter/exit animation (CSS keyframes)
 *  - ARIA: role="dialog", aria-modal, aria-labelledby
 *  - Mobile responsive: max-height with internal scroll for tall content
 *  - z-index: 1000 (above navbar z-index: 50)
 *
 * Usage:
 *   <Modal isOpen={open} onClose={() => setOpen(false)} title="My Modal">
 *     <p>Content here</p>
 *   </Modal>
 *
 * Props:
 *   isOpen     boolean  — controls visibility
 *   onClose    fn       — called when modal should close
 *   title      string   — shown in header, used for aria-labelledby
 *   maxWidth   string   — CSS max-width (default "28rem")
 *   children   ReactNode
 */
import React, { useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  maxWidth = '28rem',
}) {
  const overlayRef = useRef(null);
  const dialogRef  = useRef(null);
  const titleId    = useRef(`modal-title-${Math.random().toString(36).slice(2)}`).current;

  // ── Escape key handler ──────────────────────────────────────────────────────
  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    },
    [onClose]
  );

  // ── Body scroll lock + focus trap setup ────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;

    // Lock scroll
    const prevOverflow = document.body.style.overflow;
    const prevPaddingRight = document.body.style.paddingRight;

    // Compensate for scrollbar disappearance to prevent layout shift
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }
    document.body.classList.add('modal-open');

    // Focus first focusable element inside dialog
    const focusTimer = setTimeout(() => {
      if (!dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length > 0) {
        focusable[0].focus();
      } else {
        dialogRef.current.focus();
      }
    }, 50);

    // Listen for Escape
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      // Restore scroll
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPaddingRight;
      document.body.classList.remove('modal-open');
      document.removeEventListener('keydown', handleKeyDown);
      clearTimeout(focusTimer);
    };
  }, [isOpen, handleKeyDown]);

  // ── Click outside (backdrop) ────────────────────────────────────────────────
  const handleOverlayClick = (e) => {
    if (e.target === overlayRef.current) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div
      ref={overlayRef}
      className="modal-overlay"
      onClick={handleOverlayClick}
      aria-hidden="false"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        className="modal"
        style={{ maxWidth }}
        tabIndex={-1}
        // Stop clicks inside from bubbling to overlay
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button — always present */}
        <button
          type="button"
          className="modal__close"
          onClick={onClose}
          aria-label="Close dialog"
        >
          <X size={16} aria-hidden />
        </button>

        {/* Optional title slot */}
        {title && (
          <div className="modal__header">
            <h2 id={titleId} className="modal__title">
              {title}
            </h2>
          </div>
        )}

        {/* Content */}
        <div className="modal__body">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}
