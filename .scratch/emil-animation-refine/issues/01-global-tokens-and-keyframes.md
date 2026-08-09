# 01 — Global Tokens & Keyframe Animations

**What to build:**
Define Emil Kowalski design tokens and keyframe animations in `app/globals.css`.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] Define `--ease-out-emil: cubic-bezier(0.16, 1, 0.3, 1)`, `--duration-fast: 150ms`, `--duration-normal: 250ms` under `@theme` in `app/globals.css`.
- [ ] Add `@keyframes shimmer` sweep animation and `.animate-shimmer` utility.
- [ ] Add `@keyframes alert-ripple` animation and `.animate-alert-ripple` utility.
- [ ] Add `.btn-press` utility class for `hover:-translate-y-[1.5px] active:scale-[0.97] transition-all duration-150 ease-out-emil`.
- [ ] Add `@media (prefers-reduced-motion: reduce)` resets to disable motion transforms for accessibility.
