# 02 — Framer Motion Components Tuning

**What to build:**
Refine Framer Motion variants and duration across components to 200-250ms with `ease: [0.16, 1, 0.3, 1]`.

**Blocked by:** 01 — Global Tokens & Keyframe Animations.

**Status:** ready-for-agent

- [ ] Update `components/Features/SingleFeature.tsx` transition from 500ms to `{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }` and clean `transition-all`.
- [ ] Update `components/Blog/BlogItem.tsx` transition variants to `{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }`.
- [ ] Update `components/Common/SectionHeader.tsx` transition variants to `{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }`.
- [ ] Update `components/About/index.tsx`, `components/Testimonial/index.tsx`, `components/FAQ/index.tsx` motion variants to fast ease-out.
