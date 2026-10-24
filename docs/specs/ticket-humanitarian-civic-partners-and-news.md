### Summary

This ticket tracks the implementation of **國際人道援助與人權行動公民友站落地、NEWS 擴充與 Claude API 智慧雙向整合**:
1. Add MSF Taiwan, Amnesty Taiwan, and Taiwan AID to `CIVIC_PARTNERS` in `CivicPartnersSection.tsx`.
2. Add MSF, Amnesty, Taiwan AID, and TaiwanICDF to `CIVIC_PARTNER_LINKS` in `navModel.ts`.
3. Add localization keys across `zh-TW`, `en`, `ja`, `ko` in `locales/`.
4. Register `icdf` under `gov`, and `msf`, `anti_cw` under `npo` in `lib/server/news/sourceCategories.ts`.
5. Implement Claude API semantic linking guard with Hash memoization and $2.8/day circuit breaker in `lib/server/ai/claudeBudgetGuard.ts` (Monthly $100 budget protection).
6. Embed contextual action guidance cards in `/tools/npo-organizations` and `/tools/global-watch`.
7. Update test suites and verify accessibility markup.

### Specification Reference
- Specification: [`docs/specs/SPEC-humanitarian-civic-partners-and-news.md`](SPEC-humanitarian-civic-partners-and-news.md)
- Research: [`docs/2.0/opendata-expansion-research.md`](../2.0/opendata-expansion-research.md)

### Checklist
- [x] Add 3 new civic partners in `components/Common/CivicPartnersSection.tsx`
- [x] Update `CIVIC_PARTNER_LINKS` in `lib/server/tools/navModel.ts`
- [x] Add localization keys across `locales/{zh-TW,en,ja,ko}.json`
- [x] Register new news sources in `lib/server/news/sourceCategories.ts` & `types/rss.ts`
- [x] Implement Claude API Budget Guard with $2.8/day circuit breaker in `lib/server/ai/claudeBudgetGuard.ts`
- [x] Add contextual guidance cards in `/tools/npo-organizations` and `/tools/global-watch`
- [x] Update tests in `tests/footer-external-links-746.test.mjs`
- [x] Verify test suite and accessibility
