### Summary

This ticket tracks the implementation of:
1. **PLA Activities Bulletin Tool & Ingestion Pipeline** (`/tools/pla-activities`):
   - Scrapes and parses daily PLA activities announcements from the Ministry of National Defense (`https://www.mnd.gov.tw/news/plaactlist`).
   - Parses aircraft counts, median line crossings, naval vessels, and official coast guard ships into structured metrics.
   - Retains verbatim official text and trajectory map attachments with lightbox zoom.
   - Provides an interactive 30-day timeline selector with deep link (`?date=YYYY-MM-DD`) support.
2. **Database Persistence & Resilient Fallback**:
   - `pla_activities` schema in `lib/server/db/schema.ts`.
   - `data/pla-activities-seed.json` with 30-day authentic seed data.
   - Query layer `lib/server/plaActivities/queries.ts` with `withConnectionFallback`.
3. **Site Integration & Catalog Registration**:
   - Registered in `lib/server/tools/catalog.ts` under `group: "disaster-alerts"`.
   - Accessible via Header navigation, `/tools`, JSON-LD breadcrumbs, and `llms.txt`.

### Specification Reference
- Specification: [`docs/specs/SPEC-pla-activities-bulletin.md`](SPEC-pla-activities-bulletin.md)
- Research: [`docs/2.0/opendata-expansion-research.md`](../2.0/opendata-expansion-research.md)

### Checklist
- [x] Database Schema: Add `pla_activities` table definition in `lib/server/db/schema.ts`
- [x] Seed Data: Create `data/pla-activities-seed.json` with 30 days of high-fidelity bulletin data
- [x] Bulletin Parser: Implement `lib/server/plaActivities/parser.ts` to extract metrics and dates
- [x] Parser Unit Tests: Create `lib/server/plaActivities/parser.test.mjs` covering variations
- [x] Server Query Layer: Implement `lib/server/plaActivities/queries.ts` with `withConnectionFallback`
- [x] Query Unit Tests: Create `lib/server/plaActivities/queries.test.mjs`
- [x] Catalog Entry: Register `pla-activities` in `lib/server/tools/catalog.ts` with full FAQs & SEO metadata
- [x] UI Component: Implement `components/Tools/PlaActivitiesContent.tsx` with KPI cards, lightbox, and 30-day timeline
- [x] Page Route: Create `app/(zh)/tools/pla-activities/page.tsx` using `ToolPageShell`
- [x] Sync Script: Create `scripts/sync-pla-activities.mjs` for scheduled updates
- [x] Verification: Run `npm run typecheck`, run unit tests, verify clean lint
