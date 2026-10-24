### Summary

This ticket tracks the implementation of:
1. **CBS Emergency Cell Broadcast Alert Engine & Site-wide Banner Component** (`cbs.tw/files/rssatomfeed.xml`) integrated into `app/(zh)/layout.tsx` and `app/[locale]/layout.tsx` alongside EarthquakeBanner and TyphoonBanner (#744).
2. **MOA Debris Flow Alert Ingestion & Disaster Map Linking** (`data.moa.gov.tw` `UnitId=018`, historical dataset 7284).
3. **Ministry of Education Gender Equality News Clarification & Fact-Check Source Pipeline** (`gender.edu.tw/web/index.php/m1/m1_03_index`) with official clarification marker and administrative memo filtering.

### Specification Reference
- Specification: [`docs/specs/SPEC-emergency-cbs-debris-and-gender-factcheck.md`](docs/specs/SPEC-emergency-cbs-debris-and-gender-factcheck.md)
- Research: [`docs/2.0/opendata-expansion-research.md`](docs/2.0/opendata-expansion-research.md)

### Checklist
- [ ] Implement CBS CAP XML parser and `/api/cbs-status` route
- [ ] Implement `CbsEmergencyBanner` client component & client store
- [ ] Mount `CbsEmergencyBanner` in layouts alongside `TyphoonBanner` and `EarthquakeBanner`
- [ ] Implement MOA Debris Alert service (`UnitId=018`) and integrate with disaster map
- [ ] Implement `gender_edu` source in `lib/server/news/sourceCategories.ts` with fact-check categorization
- [ ] Implement parser for `gender.edu.tw/m1/m1_03_index`
- [ ] Add unit tests and verify typecheck
