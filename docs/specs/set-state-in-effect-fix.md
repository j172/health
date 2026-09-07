# Spec & Ticket: Fix the Four `react-hooks/set-state-in-effect` Lint Errors

- **Ticket ID**: `SPEC-HEALTH-20260907-SET-STATE-IN-EFFECT`
- **Priority**: LOW (P3) — lint-level, not a functional bug
- **Affects**: `app/tools/drugs/DrugsContent.tsx`,
  `app/tools/green-products/GreenProductsContent.tsx`,
  `components/Activities/CulturalEventsContent.tsx`,
  `components/Activities/PublicArtContent.tsx`

Scope narrowed from #121: the `GoogleTag.tsx` warning is a different kind of
question (analytics/consent-mode timing across a four-shell layout
structure) and is tracked separately as #122.

---

## 1. The pattern, confirmed identical across all four files

```tsx
const [loading, setLoading] = useState(true);   // already true on mount

const fetchDrugs = async (keyword?: string) => {
  setLoading(true);   // <- synchronous, before any await
  setError(false);    // <- synchronous, before any await
  try {
    const res = await fetch(url);
    ...
  } finally {
    setLoading(false);
  }
};

useEffect(() => {
  fetchDrugs();
}, []);
```

`react-hooks/set-state-in-effect` flags the effect body's synchronous call
chain reaching `setState` before any `await`/microtask boundary. This is not
a false positive to suppress: React's own guidance is that a `setState` call
reached synchronously during the passive-effect phase can force an extra
render pass inside the same commit rather than letting the update schedule
normally after paint.

All four already initialize `loading` (and the equivalent state) to `true`,
so the mount-path call to `setLoading(true)` is functionally redundant —
it only matters for later, manual re-invocations of the same function from
event handlers (a retry button, a re-search), where calling it synchronously
is correct and unflagged (the rule only fires inside effects).

## 2. The fix: defer the effect's call via `queueMicrotask`

```tsx
useEffect(() => {
  queueMicrotask(() => {
    fetchDrugs();
  });
}, []);
```

Chosen over the alternatives:

- **Removing the redundant `setLoading(true)`/`setError(false)` calls from
  the shared loader function** would require each of the four to special-case
  "called from mount vs. called from a retry handler," since the same
  function is reused by both paths in every file (confirmed: `fetchDrugs`
  singular in Drugs, `loadData` in CulturalEvents/PublicArt). More surface
  area to get wrong per file, for the same outcome.
- **Suppressing the rule** discards the real signal the rule is pointing at
  (see §1) rather than addressing it.

`queueMicrotask` changes *when* the update is scheduled relative to React's
commit/paint cycle — the actual behavioral concern — without touching the
loader functions, the dependency arrays, or the initial state at all. Same
fix, same shape, applied uniformly to all four call sites.

**Confirm before applying**, per file: the effect's dependency array is
unchanged, and (for `PublicArtContent.tsx`, whose effect depends on
`[loadData]`, a `useCallback`-memoized function) that the microtask wrapper
does not change when the effect re-runs — only when its *body* executes
relative to the same triggers as before.

## 3. Explicit Non-Goals

- Do not touch `components/Analytics/GoogleTag.tsx` — tracked as #122.
- Do not change the loader functions' internal logic, error handling, or
  the components' initial state.
- Do not introduce a data-fetching library (SWR/React Query) as an
  alternative fix — out of scope for a lint cleanup.

## 4. Verification

- `npm run lint` — the four errors gone; confirm the file count and line
  numbers match exactly the four listed, not a broader sweep.
- `npm run typecheck`, `npm test`, `npm run build` all pass.
- Manually reason through (or note if verified live) that each page's
  loading indicator still appears immediately on mount — the fix must be
  invisible to the user. `loading` is already `true` at the initial render
  in all four, so the microtask deferral of the *fetch trigger* does not
  delay the *loading UI*, which was already showing from the initial state
  before the effect even runs.
