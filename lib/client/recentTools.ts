/**
 * "最近使用的工具" tracking (issue #472, parent #438 §G). Device-only: stored
 * in `localStorage`, never sent to any server — a visited tool slug plus a
 * timestamp, nothing identifying.
 *
 * Split into pure list-management logic (`pushRecentTool`, no DOM) and thin
 * browser-storage IO (`readRecentTools`/`recordRecentTool`) so the ordering/
 * dedupe/cap rules are testable with plain `node --test` without a DOM, per
 * this repo's established convention (see tests/*.test.mjs).
 */

export const RECENT_TOOLS_STORAGE_KEY = "recentTools:v1";
export const MAX_RECENT_TOOLS = 6;

export interface RecentToolEntry {
  slug: string;
  visitedAt: number;
}

/**
 * Returns a new list with `slug` recorded as the most recently visited:
 *  - If `slug` already appears in `current`, its old entry is removed first
 *    (dedupe) rather than appearing twice.
 *  - The new entry is placed at the front (most-recent-first).
 *  - The result is capped at `MAX_RECENT_TOOLS` entries, dropping the
 *    oldest ones.
 * Pure — never touches `localStorage` itself.
 */
export function pushRecentTool(
  current: RecentToolEntry[],
  slug: string,
  visitedAt: number = Date.now(),
): RecentToolEntry[] {
  const withoutSlug = current.filter((entry) => entry.slug !== slug);
  return [{ slug, visitedAt }, ...withoutSlug].slice(0, MAX_RECENT_TOOLS);
}

function isRecentToolEntry(value: unknown): value is RecentToolEntry {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as RecentToolEntry).slug === "string" &&
    typeof (value as RecentToolEntry).visitedAt === "number"
  );
}

/** Reads the current list from localStorage. Returns `[]` on any failure (unavailable, corrupted JSON, wrong shape) rather than throwing — this is a convenience feature, never allowed to break the page it's read on. */
export function readRecentTools(): RecentToolEntry[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(RECENT_TOOLS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isRecentToolEntry);
  } catch {
    return [];
  }
}

/** Records a tool-page visit: reads the current list, applies `pushRecentTool`, writes it back. Silently no-ops if localStorage is unavailable (private browsing, storage full, SSR). */
export function recordRecentTool(slug: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    const next = pushRecentTool(readRecentTools(), slug);
    localStorage.setItem(RECENT_TOOLS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage full / disabled / any other write failure: recording a
    // "recently used" convenience list must never throw on a tool page.
  }
}
