/**
 * Issue #588 (parent #583): the registry behind global-watch's "單選分頁"
 * item switcher. #587 shipped the globe shell before any item existed, so
 * no tab UI existed yet — this is the first, minimal one. Deliberately just
 * a flat array of `{ key, path, emoji, labelDefault }` (no icon components,
 * no per-item layer config, no routing logic) so it hosts exactly this one
 * item today without presuming the shape #589's next item (颱風) will need —
 * that ticket can freely grow this array and the tab bar that reads it
 * without this file needing a redesign, but nothing here is built out
 * speculatively ahead of a second entry actually existing.
 */
export interface GlobeWatchItemDef {
  key: string;
  /** Canonical (zh, unprefixed) path — the locale-prefixed href is built by
   * the consumer via lib/i18n/translatedPages.ts's buildLocalizedPath. */
  path: string;
  emoji: string;
  labelDefault: string;
}

export const GLOBE_WATCH_ITEMS: GlobeWatchItemDef[] = [
  { key: "earthquakes", path: "/tools/global-watch/earthquakes", emoji: "🌍", labelDefault: "地震" },
];
