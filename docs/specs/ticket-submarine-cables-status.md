### Summary

This ticket tracks the implementation of **臺灣海纜動態通訊韌性狀態燈號與維生情境整合 (Submarine Cable Resilience Status)**:
1. Fetch and cache `https://raw.githubusercontent.com/seadog007/smc.peering.tw/master/src/data/incidents.json`.
2. Compute 2.0 communication resilience indicator:
   - 🟢 `NORMAL`: 0 active incidents.
   - 🟡 `DEGRADED`: 1-2 active incidents.
   - 🔴 `CRITICAL`: Multiple major cable cuts or offshore island isolation.
3. Provide `GET /api/submarine-cables/status`.
4. Build `SubmarineCableStatusBadge` component and integrate into Disaster Guide (`/guides/typhoon-earthquake`) and Power Grid Overview (`/tools/power-grid-overview`).
5. Write unit tests in `tests/submarine-cable-status.test.mjs`.

### Specification Reference
- Specification: [`docs/specs/SPEC-civic-partners-and-opendata-matrix.md`](SPEC-civic-partners-and-opendata-matrix.md) (§4)
- Research: [`docs/2.0/opendata-expansion-research.md`](../2.0/opendata-expansion-research.md) (§4.1, §7 #2)

### Checklist
- [ ] Implement `lib/server/resilience/submarineCableService.ts`
- [ ] Implement `app/api/submarine-cables/status/route.ts`
- [ ] Implement `components/Resilience/SubmarineCableStatusBadge.tsx`
- [ ] Mount badge in `/guides/typhoon-earthquake` and `/tools/power-grid-overview`
- [ ] Write unit tests `tests/submarine-cable-status.test.mjs`
- [ ] Verify test suite and typecheck

