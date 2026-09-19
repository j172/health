# Spec & Ticket: Fully Remove the Dengue Vector Survey Map (Revert #269)

- **Ticket ID**: `SPEC-HEALTH-20260919-DENGUE-REMOVAL`
- **Priority**: HIGH (P1) — production still has 6,843 rows and a live public page today; this closes the loop before either drifts.
- **Affects**: everything shipped for #269, plus `lib/server/tools/catalog.ts` and two component-inventory tests.
- **Closes**: #333. Related: #269 (the original feature — gets an explanatory comment, stays closed).

---

## 1. Problem Statement

#269 ("全國村里級登革熱病媒蚊密度地圖") shipped and was fixed and verified live earlier today (2026-09-19, 6,843 real rows synced). During that work it was confirmed that `od.cdc.gov.tw` allowlists Taiwan-ISP source IPs only and silently drops every other origin — production host, GitHub Actions runners, and even Cloudflare WARP egress all time out identically; only a genuine Taiwan residential/business ISP connection (confirmed: Chunghwa Telecom/HiNet, `AS3462`) gets a response.

The only working fix built today is `scripts/local-dengue-relay.mjs` plus a Windows Scheduled Task on the developer's personal machine — the pipeline's daily data freshness now depends on that machine being powered on, online, and off any VPN at 12:25pm Taipei time, indefinitely. After walking the decision tree, the call is to not carry that dependency long-term: remove the feature entirely rather than keep a production data pipeline anchored to somebody's laptop.

This is a full teardown, not a "hide the page but keep the pipeline" partial rollback — see §3 for what stays.

## 2. Scope

### 2.1 Delete outright

```
lib/server/dengue/ingestDengueVectorSurvey.ts
lib/server/dengue/ingestDengueVectorSurvey.test.mjs
lib/server/dengue/queries.ts
app/api/admin/dengue-sync/route.ts
app/api/dengue-map/route.ts
app/tools/dengue-mosquito-map/page.tsx
components/DengueMosquitoMap/               (whole directory)
scripts/local-dengue-relay.mjs
scripts/gha-dengue-vector-sync.mjs
.github/workflows/dengue-vector-sync.yml
```

Also remove the empty `lib/server/dengue/` directory once its contents are gone.

### 2.2 Edit

- **`lib/server/db/schema.ts`**: remove the `dengueVectorSurveys` DDL constant and any export/reference to it.
- **`lib/server/tools/catalog.ts`**: remove the `dengue-mosquito-map` catalog entry in full (title, description, FAQ/structured-data blocks, the density-level comparison table content tied to it), remove `"dengue-mosquito-map"` from the `disaster-safety` group slug list (~line 3409), and remove `"dengue-mosquito-map"` from the `outdoor-safety` entry's `relatedSlugs` array (~line 2766) so that tool's related-links section doesn't point at a 404.
- **`tests/fetchWithTimeout.test.mjs`**: remove `"components/DengueMosquitoMap/DengueMosquitoMapContent.tsx"` from `requiredFiles`.
- **`scripts/verify-no-stuck-loading.mjs`**: remove the same path from its list.
- **`.github/workflows/egress-probe.yml`**: remove only the `od.cdc.gov.tw dengue csv` probe line added today. **Keep** the `probe-from-host` job and `scripts/gha-egress-probe-host.mjs` — that's a reusable diagnostic for any future Taiwan-ISP-block case, not dengue-specific, and the user explicitly asked to keep it during the grill.

### 2.3 Production database

`DROP TABLE dengue_vector_surveys` on production, no export/backup first (explicit user decision — the 6,843 rows are not preserved anywhere). Do this by adding a one-off admin action or a direct migration step; do **not** leave a lingering admin endpoint behind afterward — whatever mechanism drops the table should itself not become a permanent addition to the codebase (e.g. a short-lived script run once via the existing SSH-loopback pattern, not a new permanent `/api/admin/*` route).

### 2.4 Local machine (outside the repo)

Unregister the Windows Scheduled Task `HealthDengueVectorRelay` (`Unregister-ScheduledTask -TaskName "HealthDengueVectorRelay" -Confirm:$false`). This is environment cleanup, not a repo change — note in the PR/report that it was done, since it isn't visible in any diff.

## 3. Explicit Non-Goals (what stays untouched)

- **Do not** revert, squash, or rewrite today's existing 4 commits (`fa5d1a2`, `904d9c8`, `3a86630`, plus the two deploy-workflow runs). History stays linear; this is a new commit on top, not a rewrite. No force-push.
- **Do not** edit any `docs/specs/*.md` file that mentions dengue historically (`emergency-aed-disaster-map-and-site-wide-tools-health.md`, `client-fetch-timeout-and-dual-track-rendering-resilience.md`, `restore-missing-table-ddl.md`). Those are point-in-time specs, not living documentation — leave them exactly as they are.
- **Do not** touch `lib/server/outdoorSafety/calculateIndex.ts` or `lib/server/outdoorSafety/queries.ts`. Their `dengueRisk` field is a hardcoded county-code heuristic (`c.code === "TNN" || c.code === "KCG" ? "medium" : "low"`) — it never actually queried `dengue_vector_surveys`, so dropping that table has zero effect on outdoor-safety and nothing there needs to change.
- **Do not** modify `app/llm-info/LlmInfoClient.tsx` — its dengue mentions are about the CDC news feed generally, unrelated to this map feature.

## 4. Verification

- `npm run typecheck && npm test && npm run build` all pass with zero references to the deleted modules remaining (a leftover import would fail the build, not just lint).
- `grep -ri "dengue" -r app/ components/ lib/ scripts/ .github/workflows/ tests/` (excluding the untouched `docs/specs/*.md` files and `app/llm-info/LlmInfoClient.tsx`) returns nothing.
- After deploy: `curl -o /dev/null -w '%{http_code}' https://health.j172.tw/tools/dengue-mosquito-map` and the same for `/api/dengue-map` both return 404.
- Confirm via SSH that `dengue_vector_surveys` no longer exists in the production schema.
- Report back explicitly that the Windows Scheduled Task was unregistered (this can't be verified from the repo diff).
