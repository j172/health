"use client";

import { useEffect, useRef } from "react";

/** Elements that can hold keyboard focus inside a dialog. */
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface ModalA11yOptions {
  /** Whether the dialog is currently mounted and visible. */
  isOpen: boolean;
  /** Invoked on Escape and used by callers for the backdrop click. */
  onClose: () => void;
  /**
   * Element to focus when the dialog opens. Defaults to the first focusable
   * descendant of the container.
   */
  initialFocusRef?: React.RefObject<HTMLElement | null>;
}

/**
 * The keyboard and focus behaviour every modal dialog owes its users:
 * Escape closes, Tab cycles inside the dialog instead of escaping to the page
 * behind it, focus lands somewhere sensible on open and returns to whatever
 * opened the dialog on close, and the background stops scrolling underneath.
 *
 * Returns the ref to spread onto the dialog container. Pair it with
 * `role="dialog"`, `aria-modal="true"` and an accessible name on that element.
 */
export function useModalA11y({
  isOpen,
  onClose,
  initialFocusRef,
}: ModalA11yOptions) {
  const containerRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // Remember what had focus, then restore it when the dialog goes away — a
  // keyboard user who opens a dialog from a toolbar button should get that
  // button back, not the top of the document.
  useEffect(() => {
    if (!isOpen) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    return () => {
      previouslyFocused.current?.focus?.();
    };
  }, [isOpen]);

  // Move focus into the dialog on open.
  useEffect(() => {
    if (!isOpen) return;
    const target =
      initialFocusRef?.current ??
      containerRef.current?.querySelector<HTMLElement>(FOCUSABLE) ??
      containerRef.current;
    // Defer past the paint that mounts the dialog.
    const timer = window.setTimeout(() => target?.focus(), 50);
    return () => window.clearTimeout(timer);
  }, [isOpen, initialFocusRef]);

  // Escape to close, Tab trapped inside.
  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }

      if (event.key !== "Tab") return;

      const focusable = Array.from(
        containerRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [],
      ).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (
        event.shiftKey &&
        (active === first || !containerRef.current?.contains(active))
      ) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [isOpen, onClose]);

  // Stop the page behind the dialog from scrolling.
  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  return containerRef;
}
