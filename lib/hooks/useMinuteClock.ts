"use client";

import { useEffect, useState } from "react";

/**
 * The current time (epoch ms), refreshed once a minute — and `null` until the
 * component has mounted.
 *
 * Why not `Date.now()` in render: the server render and the first client render
 * must match (so "now" cannot be read during render), and a value baked into an
 * edge-cached payload is stale by the time a visitor sees it. The two
 * "today"-dependent pieces of issue #691 (the 今日上班 chip on the homepage
 * status bar and the /tools/work-school-status page) use this clock to resolve
 * the Asia/Taipei date themselves, from rows the API returned, so a response
 * cached before midnight can never show yesterday's answer.
 *
 * The first reading is scheduled with a zero-delay timer rather than set
 * synchronously inside the effect body, which React's rules forbid
 * (react-hooks/set-state-in-effect).
 */
export function useMinuteClock(intervalMs = 60_000): number | null {
  const [nowMs, setNowMs] = useState<number | null>(null);

  useEffect(() => {
    const first = setTimeout(() => setNowMs(Date.now()), 0);
    const timer = setInterval(() => setNowMs(Date.now()), intervalMs);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [intervalMs]);

  return nowMs;
}
