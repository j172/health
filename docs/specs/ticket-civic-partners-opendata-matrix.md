### Summary

This ticket tracks the implementation of **全臺開放資料平臺矩陣升級、海纜動態地圖公民友站落地與數位通訊韌性整合**:
1. Add `smc.peering.tw` (台灣海纜動態地圖) as the 10th civic partner across SiteFooter, NavModel, and CivicPartnersSection.
2. Add localization keys across `zh-TW`, `en`, `ja`, `ko`.
3. Verify test suite asserting 10 civic partners and accessibility markup.

### Specification Reference
- Specification: [`docs/specs/SPEC-civic-partners-and-opendata-matrix.md`](docs/specs/SPEC-civic-partners-and-opendata-matrix.md)
- Research: [`docs/2.0/opendata-expansion-research.md`](docs/2.0/opendata-expansion-research.md) (§3.1, §4.1, §7 #2)

### Checklist
- [ ] Add `smc.peering.tw` to `CIVIC_PARTNER_LINKS` in `lib/server/tools/navModel.ts`
- [ ] Add localization keys in `locales/{zh-TW,en,ja,ko}.json`
- [ ] Add partner metadata in `components/Common/CivicPartnersSection.tsx`
- [ ] Update tests in `tests/footer-external-links-746.test.mjs`
- [ ] Run test suite and verify
