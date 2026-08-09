# 03 — Header & Toggles Micro-interactions

**What to build:**
Upgrade interactive buttons, language toggler, and navigation dropdowns with tactile 3-stage feedback and backdrop blur.

**Blocked by:** 01 — Global Tokens & Keyframe Animations.

**Status:** ready-for-agent

- [ ] Update `components/Header/LanguageToggler.tsx` trigger button with `btn-press` (`hover:-translate-y-[1.5px] active:scale-[0.97]`).
- [ ] Upgrade `LanguageToggler.tsx` dropdown styling with `backdrop-blur-md bg-white/95 dark:bg-slate-900/95` and 200ms ease-out entrance.
- [ ] Update `components/Header/index.tsx` nav links and mobile menu triggers with tactile active press feedback.
- [ ] Ensure full `prefers-reduced-motion` compliance.
