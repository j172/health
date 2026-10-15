"use client";

import { useEffect, useState } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

/**
 * Issue #587 (parent #583): the globe must disable its flyTo animations
 * (collapsing them to an instant jump — see lib/tools/globeWatch/motion.ts)
 * when the OS has `prefers-reduced-motion: reduce` set. This is the first
 * place in the codebase that needs to read that preference from JS rather
 * than just gate a CSS transition with the `motion-reduce:` Tailwind variant
 * (see components/ui/LoadingOrb.tsx for the CSS-only precedent) — a
 * MapLibre camera animation isn't a CSS transition, so there's no CSS
 * equivalent to reach for here.
 *
 * Starts `false` (matches SSR, where `window` doesn't exist) and syncs to
 * the real value on mount, then stays live via the MediaQueryList's
 * `change` event so a user who flips the OS setting mid-session doesn't
 * need to reload.
 */
export function usePrefersReducedMotion(): boolean {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;

    const mediaQueryList = window.matchMedia(QUERY);
    // setState deferred to a microtask (same convention as
    // components/Map/BaseMap.tsx's focusOnMarker effect) to avoid the
    // react-hooks/set-state-in-effect direct-call warning.
    queueMicrotask(() => setReducedMotion(mediaQueryList.matches));

    const handleChange = (event: MediaQueryListEvent) => setReducedMotion(event.matches);
    mediaQueryList.addEventListener("change", handleChange);
    return () => mediaQueryList.removeEventListener("change", handleChange);
  }, []);

  return reducedMotion;
}
