/**
 * LoadingOrb — generic async-loading indicator.
 *
 * Reproduces the visual style of aicss.dev's "Orbs" Lattice pattern (a 3x3
 * grid of dots whose pulse radiates outward from the centre dot) using pure
 * Tailwind: a single `@keyframes orb-pulse` animation (defined in
 * app/globals.css, alongside the project's other custom keyframes) plus a
 * per-dot `animation-delay` computed from each dot's Manhattan distance to
 * the grid's centre cell. No JS timers, no status-text/label prop — this is
 * just the animated mark; callers place their own "查詢中…" copy next to it
 * if the loading state needs one.
 *
 * Reduced motion: `.animate-orb-pulse` is frozen to a static, full-opacity
 * dot grid under `prefers-reduced-motion: reduce` (see app/globals.css).
 * Dark mode: dots use the same indigo accent already used for status/accent
 * colors elsewhere (SiteNav, AqiContent, SidebarWidgetShell, etc.).
 */

// Manhattan distance of each of the 9 grid cells (row-major, 0-8) from the
// centre cell (index 4) — used to stagger each dot's pulse so the animation
// appears to radiate outward from the middle, one "ring" at a time:
//   0 1 2      2 1 2
//   3 4 5  ->  1 0 1   (distance from centre, in animation-delay steps)
//   6 7 8      2 1 2
const DOT_DELAY_MS = [200, 100, 200, 100, 0, 100, 200, 100, 200] as const;

export default function LoadingOrb({
  size = 20,
  className = "",
}: {
  /** Overall width/height of the indicator in pixels. Defaults to ~20px per the spec. */
  size?: number;
  /** Extra classes for positioning/spacing at the call site. */
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={`inline-grid grid-cols-3 grid-rows-3 gap-[10%] ${className}`}
      style={{ width: size, height: size }}
    >
      {DOT_DELAY_MS.map((delay, i) => (
        <span
          key={i}
          className="animate-orb-pulse rounded-full bg-indigo-600 dark:bg-indigo-400"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </span>
  );
}
