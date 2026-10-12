"use client";

import { useEffect, useState } from "react";
import { createToastStore, type ToastItem } from "@/lib/client/toastStore";

// Replaces `react-hot-toast` (issue #479) — this app only ever used its two
// most basic calls (toast.success/toast.error) plus the default <Toaster/>,
// so the full library wasn't worth the bundle weight. State logic lives in
// lib/client/toastStore.ts (unit-tested there); this file is just the ~30
// lines of rendering on top of it.
const store = createToastStore();

export const toast = {
  success: (message: string) => store.push("success", message),
  error: (message: string) => store.push("error", message),
};

/** Mount once near the root (see app/context/ToastContext.tsx), top-center,
 * same position react-hot-toast's <Toaster position="top-center" /> used. */
export function Toaster() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => store.subscribe(setToasts), []);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-99999 flex flex-col items-center gap-2 px-4">
      {toasts.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => store.dismiss(t.id)}
          aria-label="關閉提示"
          className={`toast-enter pointer-events-auto max-w-[350px] rounded-lg px-4 py-2.5 text-left text-sm font-medium shadow-solid-13 ${
            t.type === "error"
              ? "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"
              : "bg-white text-black dark:bg-blacksection dark:text-white"
          }`}
        >
          {t.message}
        </button>
      ))}
    </div>
  );
}
