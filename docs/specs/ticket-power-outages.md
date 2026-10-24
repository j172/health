### Summary

This ticket tracks the implementation of **台電電力維生管線即時停電災情與修復進度地圖 (Power Outages Map)**:
1. Ingest Taipower live outage KML dataset [44799] (`d006012`), parse `<Polygon>` geometry into GeoJSON.
2. Provide `GET /api/power-outages` with live outage metrics and GeoJSON boundary polygons.
3. Build new tool `/tools/power-outages` with Leaflet interactive map, outage count stats, and 1911 call button.
4. Establish cross-linking with `/tools/water-outages` and `/tools/power-grid-overview`.

### Specification Reference
- Specification: [`docs/specs/SPEC-power-outages-map.md`](SPEC-power-outages-map.md)
- Research: [`docs/2.0/opendata-expansion-research.md`](../2.0/opendata-expansion-research.md) (§2.4.1, §7 #1)

### Checklist
- [x] Implement KML / XML parser in `lib/server/power/outageParser.ts`
- [x] Implement outage fetch & cache service in `lib/server/power/outageService.ts`
- [x] Implement API route `app/api/power-outages/route.ts`
- [x] Register tool in `lib/server/tools/catalog.ts` under disaster & warning category
- [x] Build UI component `components/Tools/PowerOutagesContent.tsx` with Leaflet map
- [x] Build page `app/(zh)/tools/power-outages/page.tsx`
- [x] Add cross-links to `water-outages` and `power-grid-overview`
- [x] Write unit tests `tests/power-outages-parser.test.mjs`
- [x] Verify build and typecheck
