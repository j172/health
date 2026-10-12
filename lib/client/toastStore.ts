/**
 * lib/client/toastStore.ts
 *
 * Minimal toast queue — the entire state machine behind
 * components/Common/Toast.tsx, which replaced `react-hot-toast` (issue
 * #479; this app only ever used its two most basic calls, `toast.success`
 * and `toast.error`, plus the default `<Toaster/>`).
 *
 * `TOAST_DURATIONS` matches react-hot-toast's own built-in defaults for
 * these two toast types, so auto-dismiss timing is unchanged.
 *
 * Pure state container, no DOM access — the auto-dismiss `schedule`
 * function defaults to `setTimeout` but is injectable, which keeps this
 * trivially unit-testable without real timers (same pattern as
 * lib/client/inAppBrowser.ts's injected UA string).
 */

export type ToastType = "success" | "error";

export interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

/** react-hot-toast's built-in defaults for these two toast types. */
export const TOAST_DURATIONS: Record<ToastType, number> = {
  success: 2000,
  error: 4000,
};

export interface ToastStore {
  getToasts(): ToastItem[];
  subscribe(listener: (toasts: ToastItem[]) => void): () => void;
  push(type: ToastType, message: string): number;
  dismiss(id: number): void;
}

export function createToastStore(schedule: (fn: () => void, ms: number) => void = (fn, ms) => setTimeout(fn, ms)): ToastStore {
  let toasts: ToastItem[] = [];
  let nextId = 0;
  const listeners = new Set<(toasts: ToastItem[]) => void>();

  const emit = () => listeners.forEach((listener) => listener(toasts));

  const dismiss = (id: number) => {
    if (!toasts.some((t) => t.id === id)) return;
    toasts = toasts.filter((t) => t.id !== id);
    emit();
  };

  return {
    getToasts: () => toasts,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    push: (type, message) => {
      const id = ++nextId;
      toasts = [...toasts, { id, type, message }];
      emit();
      schedule(() => dismiss(id), TOAST_DURATIONS[type]);
      return id;
    },
    dismiss,
  };
}
