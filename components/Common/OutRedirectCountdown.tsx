"use client";

import { useEffect, useState } from "react";

export interface OutRedirectCountdownProps {
  /** Already-validated absolute https URL to redirect to. */
  targetUrl: string;
  /** Seconds to count down before redirecting. */
  seconds?: number;
}

/**
 * Client-side countdown for the `/out` interstitial (issue #137).
 *
 * Redirects only after this component mounts and its own timer elapses —
 * there is no redirect that fires before the visitor has actually landed on
 * and rendered this page, and nothing here opens a new tab or window. The
 * no-JS path is handled separately by the page's `<meta http-equiv="refresh">`
 * tag and the always-present manual link, both rendered server-side.
 */
export default function OutRedirectCountdown({
  targetUrl,
  seconds = 3,
}: OutRedirectCountdownProps) {
  const [remaining, setRemaining] = useState(seconds);

  useEffect(() => {
    if (remaining <= 0) {
      window.location.replace(targetUrl);
      return;
    }
    const timer = window.setTimeout(() => {
      setRemaining((value) => value - 1);
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [remaining, targetUrl]);

  return (
    <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
      {remaining}
      秒後將帶您前往原網站，如未跳轉請
      <a
        href={targetUrl}
        className="font-bold text-indigo-600 underline decoration-indigo-200 underline-offset-4 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
      >
        點此
      </a>
    </p>
  );
}
