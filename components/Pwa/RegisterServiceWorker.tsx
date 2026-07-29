"use client";

import { useEffect } from "react";

/** Registers the hand-written service worker (public/sw.js) for offline resilience. No UI — side effect only. */
export default function RegisterServiceWorker() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Best-effort only — a failed registration (unsupported browser, blocked by extension, etc.) shouldn't affect the page.
    });
  }, []);

  return null;
}
