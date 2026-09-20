"use client";

import { useCallback, useEffect, useRef, useState, type DependencyList } from "react";
import { fetchWithTimeout } from "@/lib/client/fetchWithTimeout";

/**
 * `loading`  — no successful fetch has ever completed yet (first mount, or
 *              every attempt so far has failed).
 * `error`    — the most recent fetch attempt failed (timeout / non-2xx /
 *              network error / `parse` threw). `data` may still hold the
 *              last known-good value from an earlier successful fetch — see
 *              the note on `data` below.
 * `success`  — the most recent fetch attempt completed and `parse` returned
 *              a value, even if that value is "empty" (e.g. `[]`). An empty
 *              successful result is a real "there is genuinely nothing
 *              today", which is a *different* thing from a failed fetch —
 *              that distinction is the whole point of this hook.
 */
export type SidebarWidgetStatus = "loading" | "error" | "success";

export interface UseSidebarWidgetDataResult<T> {
  status: SidebarWidgetStatus;
  /**
   * The last successfully parsed value, or `null` before the first success.
   * A failed refresh does NOT clear this — it is deliberately left holding
   * the previous value so a transient failure doesn't wipe already-shown
   * data back to an empty/blank state. Pair with `status === "error"` at
   * the call site to show a "may be stale" hint alongside it.
   */
  data: T | null;
  /** True while a fetch is in flight AND we already have a previous value to show (i.e. this is a refresh, not the first load). */
  isRefreshing: boolean;
  /** Re-runs the exact same fetch path used on mount. Safe to call from a manual "retry"/refresh button. */
  refresh: () => void;
}

export interface UseSidebarWidgetDataOptions<T> {
  /**
   * Builds the URL to fetch. Called fresh on every attempt (mount, deps
   * change, or manual refresh) so it can close over current component
   * state (e.g. geolocation coordinates). Return `null`/`undefined` to skip
   * fetching for this render (e.g. still waiting on a precondition).
   */
  buildUrl: () => string | null | undefined;
  /**
   * Parses+validates the response JSON into `T`. Throw (or return a
   * rejected value is not supported — throw) to signal a failure; the hook
   * treats a thrown parse error exactly like a network/timeout/HTTP error.
   */
  parse: (json: any) => T;
  /** Passed straight through to `fetchWithTimeout`. Default 5000ms. */
  timeoutMs?: number;
  /** Re-run the fetch whenever any entry changes, same semantics as useEffect's dependency list. */
  deps: DependencyList;
}

/**
 * Shared fetch/state hook for the News sidebar widgets (see
 * docs/specs/sidebar-widgets-unified-error-state-refactor.md). Centralizes
 * the four things every widget used to reimplement slightly differently:
 *
 *   - `fetchWithTimeout` wrapping (every widget now has a timeout, not just
 *     some of them).
 *   - Three distinct states instead of collapsing "fetch failed" into "no
 *     data today" (loading / error / success-with-possibly-empty-data).
 *   - An `isMounted` guard so a slow response after unmount never calls
 *     setState.
 *   - ONE code path for the initial mount fetch and manual refresh. A
 *     previous generation of widgets had two independently-maintained
 *     fetch functions where only one of them checked `res.ok` — this hook
 *     makes that class of bug structurally impossible.
 */
export function useSidebarWidgetData<T>({
  buildUrl,
  parse,
  timeoutMs = 5000,
  deps,
}: UseSidebarWidgetDataOptions<T>): UseSidebarWidgetDataResult<T> {
  const [status, setStatus] = useState<SidebarWidgetStatus>("loading");
  const [data, setData] = useState<T | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const isMountedRef = useRef(true);
  const hasLoadedRef = useRef(false);
  const buildUrlRef = useRef(buildUrl);
  const parseRef = useRef(parse);

  // Refs must not be written during render (React refs/compiler rule) — keep
  // them current via an effect instead. This runs on every commit (no dep
  // array) and, since effects fire in declaration order, always lands
  // before the deps-triggered `load()` effect below within the same flush.
  useEffect(() => {
    buildUrlRef.current = buildUrl;
    parseRef.current = parse;
  });

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    const url = buildUrlRef.current();
    if (!url) return;

    if (hasLoadedRef.current) {
      setIsRefreshing(true);
    } else {
      setStatus("loading");
    }

    try {
      const res = await fetchWithTimeout(url, { timeoutMs });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const parsed = parseRef.current(json);
      if (!isMountedRef.current) return;
      hasLoadedRef.current = true;
      setData(parsed);
      setStatus("success");
    } catch (err) {
      console.warn(`Sidebar widget fetch failed (${url}):`, err);
      if (!isMountedRef.current) return;
      // Deliberately NOT clearing `data` here — see the doc comment above.
      setStatus("error");
    } finally {
      if (isMountedRef.current) setIsRefreshing(false);
    }
  }, [timeoutMs]);

  useEffect(() => {
    load();
    // `deps` is caller-controlled (mirrors useEffect's own contract) and
    // intentionally drives re-fetching; `load` itself is stable aside from
    // `timeoutMs`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { status, data, isRefreshing, refresh: load };
}
