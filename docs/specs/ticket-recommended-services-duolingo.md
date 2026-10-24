### Summary

This ticket tracks adding the Duolingo invite profile link to the footer recommended services list (`Things I use & recommend`), updating the affiliate links constant and regression test assertions.

### Specification Reference
- Specification: [`docs/specs/SPEC-recommended-services-duolingo.md`](SPEC-recommended-services-duolingo.md)
- GitHub Issue: [#808](https://github.com/j172/health/issues/808)

### Checklist
- [x] Add `duolingo` entry to `RECOMMENDED_AFFILIATE_LINKS` in `lib/constants/affiliateLinks.ts`
- [x] Update `tests/footer-external-links-746.test.mjs` assertions to 5 items, verifying the exact URL and relaxed utm check
- [x] Verify test suite `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test tests/footer-external-links-746.test.mjs`
- [x] Run typecheck
