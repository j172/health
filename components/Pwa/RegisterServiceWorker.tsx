"use client";

import { useEffect } from "react";

/** Registers the hand-written service worker (public/sw.js) for offline resilience. No UI — side effect only. */
export default function RegisterServiceWorker() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    const register = () => {
      const scheduleRegistration = () => {
        if ("requestIdleCallback" in window) {
          window.requestIdleCallback(() => {
            navigator.serviceWorker.register("/sw.js").catch(() => {});
          });
        } else {
          setTimeout(() => {
            navigator.serviceWorker.register("/sw.js").catch(() => {});
          }, 1000);
        }
      };

      if (document.readyState === "complete") {
        scheduleRegistration();
      } else {
        window.addEventListener("load", scheduleRegistration, { once: true });
      }
    };

    register();
  }, []);

  return null;
}
