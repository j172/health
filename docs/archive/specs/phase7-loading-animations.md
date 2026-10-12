# Feature Specification: Loading Animations — Orbs & Image Skeleton (Phase 7)

## Overview

Ports the *visual design* of two aicss.dev components into this codebase's
existing Tailwind-only styling convention — **not** a literal copy-paste of
the source components, which are React+CSS-Modules and built for AI-agent
product UIs (status dots for "Thinking/Searching/Generating", an
AI-image-generation placeholder with prompt text). This site has neither an
agent chat interface nor an image-generation feature, so both are
repurposed as generic loading affordances. Confirmed with account owner.

Independent of Phases 1-6 — touches only new shared UI components plus their
call sites; land any time.

## 1. `Orbs` → generic async-loading indicator

- New component `components/ui/LoadingOrb.tsx` (or under
  `components/Shared/` if that's the existing convention for
  cross-cutting UI — check for a `components/ui`/`components/Shared`
  directory before picking the location), pure Tailwind: reproduce one or
  two of the aicss.dev "Orbs" visual variants (e.g. the 3×3 "Lattice"
  radiating-dot pattern, or the "Ring" chase pattern — pick whichever is
  simplest to express as a Tailwind `@keyframes` + `animate-*` utility
  without extra JS) as a small (~20×20px, scalable via a `size` prop)
  looping CSS animation. No status-text/label prop — just the animated
  mark, callers place their own "查詢中…" copy next to it if needed.
- Add the animation's `@keyframes` to the project's global stylesheet
  (wherever existing custom keyframes/utilities are defined — check
  `app/globals.css` or the Tailwind theme config) rather than inline
  `<style>` per-instance.
- **Apply to these existing loading states** (replace whatever spinner/
  placeholder each currently uses, or add if there's currently no loading
  indicator at all — check each site's current behavior before assuming):
  - `FacilitySearchContent.tsx` — while a facility search/map query is in
    flight.
  - `/news` list — while paginated results are loading.
  - Any AQI/weather/earthquake tool page that fetches client-side (check
    `AqiContent.tsx`, `EarthquakeContent.tsx`, `DrugsContent.tsx` etc. for
    existing `isLoading`-gated render branches).
  - Global route-transition loading (Next.js `loading.tsx` boundaries, if
    the app already uses App Router loading conventions — check for
    existing `loading.tsx` files before adding new ones).

## 2. `Image Generation` shimmer → generic image-loading skeleton

- New component `components/ui/ImageSkeleton.tsx`, Tailwind-only shimmer
  effect (a moving gradient sweep across a placeholder box — the classic
  `bg-gradient-to-r ... animate-[shimmer_2s_infinite]` pattern, define the
  `shimmer` keyframe in the same global stylesheet as section 1). Accepts
  `width`/`height`/`aspectRatio` props to match the image slot it's
  covering. **No "Generating image" text, no prompt caption, no resolution
  label** — those are meaningless outside an AI-generation context; this is
  strictly a "this image hasn't loaded yet" placeholder.
- **Apply to these existing image slots** while the real image is loading/
  before it's available:
  - News card thumbnails (wherever `news_card_images`/OG images render in
    list views — check `cardImages.ts` consumers).
  - News article hero image (`heroImage.ts` consumers).
  - Facility map markers' popup images, if any exist (check
    `FacilitySearchContent.tsx` for any image rendering — likely none, skip
    if so).

## 3. Reduced motion

Both animations must respect `prefers-reduced-motion: reduce` — either pause
the animation or fall back to a static (non-animated) version of the same
visual, per standard accessibility practice. Add a `motion-reduce:` Tailwind
variant (or equivalent media query in the global stylesheet) alongside the
`animate-*` utility.

## 4. Dark mode

Both components must render correctly in dark mode (this site is
dark-mode-aware throughout — see the `dark:` classes used everywhere else in
`SiteNav.tsx`/`SiteFooter.tsx`). Base colors should use the same
slate/indigo palette already established rather than introducing new colors.

## 5. Out of scope

- Any literal use-case matching the *original* aicss.dev semantics (AI
  agent status, AI image generation) — this site has no such feature.
- CSS Modules — everything here is Tailwind, per the account owner's
  explicit preference to stay consistent with the rest of the codebase.

## 6. Verification & compliance

- `npx tsc --noEmit` / `npm run build` / `npm run lint` — 0 errors.
- Manual: confirm both components render and animate correctly in light and
  dark mode.
- Manual: confirm `prefers-reduced-motion: reduce` (toggle in OS/devtools)
  stops or removes the animation.
- Manual: spot-check each call site listed in sections 1-2 to confirm the
  loading state actually appears during a real slow-network simulation
  (devtools network throttling), not just on paper.
