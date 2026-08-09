# Feature Specification: Nav/Footer Restructure — Disability & Green Shops Groups (Phase 1)

## Overview

Foundational restructure that Phases 2-4 and 6 build on top of. Adds two new
top-level nav/footer entries — 身心障礙 (disability) and 綠色商店 (green
shops) — and reorders the top nav. No new data sources land in this phase;
this only adds the `ToolGroup` scaffolding and moves the existing
disability-welfare tool into it.

Blocks: Phase 2 (disability ATM), Phase 3 (green shops), Phase 4 (health
checks — no nav change needed, but keep sequenced after this merges to avoid
unrelated-file churn conflicts). Independent of / can run in parallel with:
Phase 5 (WRA alerts), Phase 6 (moenv news), Phase 7 (loading animations).

## 1. `ToolGroup` type

In [`lib/server/tools/catalog.ts`](../../lib/server/tools/catalog.ts), extend
the `ToolGroup` union with two new values: `"disability"` and `"green-shop"`.

## 2. Move `disability-welfare` out of `ltc`

Change the existing `disability-welfare` catalog entry's `group` from `"ltc"`
to `"disability"`. No other change to that entry (slug, title, description
stay as-is).

## 3. New catalog entry: green shops

Add a new `TOOL_CATALOG` entry, `group: "green-shop"`, slug
`green-shops` (final title/description/emoji copy to be filled in by whoever
implements Phase 3, since the actual data-driven config lives in
`facilitySearchConfigs` — this phase only needs the catalog stub to exist so
nav/footer wiring has something to point at). Coordinate with Phase 3 so the
slug matches exactly.

## 4. Nav (`components/News/SiteNav.tsx`)

- Desktop nav order, left to right: 首頁 → 最新新聞 → 醫療院所 (dropdown,
  unchanged) → 長照機構 (dropdown, unchanged) → **身心障礙** (dropdown, new)
  → **綠色商店** (direct `<Link>`, new, no dropdown) → 健康工具 (dropdown,
  unchanged).
- 身心障礙 dropdown items: the `disability` group's `TOOL_CATALOG` entries.
  After Phase 1 merges this is just `disability-welfare` (1 item); Phase 2
  adds the merged ATM tool as the 2nd item — Phase 1 doesn't need to wait for
  that, the dropdown mechanism (`NavDropdown` filtered by
  `TOOL_CATALOG.filter(t => t.group === "disability")`, same pattern as
  `FACILITY_TOOLS`/`LTC_TOOLS`) already handles 1-N items generically.
- 綠色商店: plain `<Link href="/tools/green-shops">` styled like the
  existing 首頁/最新新聞 links (see lines 141-152 of `SiteNav.tsx`), not a
  `NavDropdown`.
- Mobile drawer: mirror the same order and add the 身心障礙 section (same
  heading+items pattern as the other groups) and a 綠色商店 plain link
  alongside 首頁/最新新聞 at the top of the drawer.
- i18n: add `nav.disability` (zh fallback "身心障礙") and `nav.greenShops`
  (zh fallback "綠色商店") translation keys, same `t("nav.x", "fallback")`
  convention already used for `nav.facilities`/`nav.ltc`/`nav.healthTools`.
  Add corresponding `catalog.<slug>` keys for English locale for any new
  slugs, matching how `localizeItems`/`localizeTitle` resolve tool titles in
  English (see `LanguageContext` / existing `catalog.*` keys for other
  slugs).

## 5. Footer (`components/News/SiteFooter.tsx`)

- Add two new `FooterColumn`s to the Links Grid: 身心障礙 (items = tools
  with `group === "disability"`) and 綠色商店 (items = tools with
  `group === "green-shop"`), sorted the same
  `localeCompare(..., "zh-Hant", { numeric: true })` way as the existing
  columns.
- Grid currently has 5 columns (`lg:grid-cols-5`); adding 2 more columns
  makes 7. Bump the responsive grid classes so it doesn't overflow/cramp on
  smaller breakpoints — e.g. `grid-cols-2 sm:grid-cols-3 md:grid-cols-4
  lg:grid-cols-7`, or keep `lg:grid-cols-5` and let it wrap to a second row;
  pick whichever renders cleanest, verify visually at `sm`/`md`/`lg`
  breakpoints in both themes.
- Column placement: insert 身心障礙 and 綠色商店 after 長照機構, before
  食品營養, matching the nav order in section 4.

## 6. Locales

Update whichever locale JSON/TS files back `useLanguage()`/`t()` (find via
the existing `nav.facilities`/`nav.ltc` keys) with the new `nav.disability`,
`nav.greenShops` keys for both `zh` and `en` locales.

## 7. Out of scope (later phases)

- Actual disability ATM data/page (Phase 2).
- Actual green shops data/page (Phase 3) — this phase only creates the
  catalog stub + route placeholder so nav links don't 404. Coordinate: either
  Phase 3 lands immediately after so the route is never live-but-broken, or
  this phase adds a minimal placeholder page at `/tools/green-shops` (e.g.
  reusing `ToolPageShell` with a "coming soon" body) so the new nav link
  never 404s in between merges.

## 8. Verification & compliance

- `npx tsc --noEmit` — 0 errors.
- `npm run build` — 0 build errors.
- `npm run lint` — 0 errors.
- Manual: desktop nav shows all 7 top-level items in the specified order;
  身心障礙 opens as a dropdown, 綠色商店 is a direct link with no chevron/
  dropdown.
- Manual: mobile drawer mirrors the same order/grouping.
- Manual: footer shows both new columns, links resolve, dark mode and all
  breakpoints (`sm`/`md`/`lg`) render without overflow or cramped wrapping.
- Manual: switching language toggler renders the new nav labels in both
  zh/en.
