### Summary

This ticket tracks the visual restyle of the site-wide **Earthquake Banner (`EarthquakeBanner.tsx`)** to match the modern floating rounded-3xl card design language of `TyphoonBanner.tsx` (#744), whilst preserving its distinct amber tone and full i18n & test contract compatibility.

### Specification Reference
- Specification: [`docs/specs/SPEC-earthquake-banner-restyle.md`](SPEC-earthquake-banner-restyle.md)

### Checklist
- [x] Update `components/Earthquake/EarthquakeBanner.tsx` container to floating card `mx-auto max-w-5xl px-4 pt-3 sm:px-6 sm:pt-4 lg:px-8`
- [x] Apply `rounded-3xl border shadow-lg transition-all motion-reduce:transition-none sm:scale-[1.02] border-amber-800 bg-amber-600 text-white hover:bg-amber-700`
- [x] Scale up emoji to `text-3xl leading-none sm:text-4xl`
- [x] Scale up headline paragraph to `text-lg font-extrabold tracking-tight sm:text-xl`
- [x] Style earthquake location with `text-base font-bold sm:text-lg`
- [x] Verify test suite `tests/earthquake-banner.test.mjs`
- [x] Run `pnpm typecheck`

