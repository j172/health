# Spec & Ticket: Coerce DECIMAL Coordinates at the Query Layer

- **Ticket ID**: `SPEC-HEALTH-20260831-DECIMAL-COORDS`
- **Priority**: MEDIUM (P2)
- **Affects**: the query layer of every module reading a DECIMAL lat/lng column
- **Closes**: #64

---

## 1. Problem Statement

mysql2 returns `DECIMAL` as a **string**, to preserve precision. Twelve tables store coordinates that way:

```
facilities            news_items           aqi_readings          pm25_readings
cwa_rainfall          cwa_station_weather  cwa_earthquakes*      global_earthquakes
cdc_travel_alerts     cdc_epidemic_news    cultural_event_shows  public_arts
                                           * epicenter_lat / epicenter_lng
```

Every interface exposing them declares `lat: number | null`. Measured live:

```
$ curl .../api/facilities?type=child_welfare_center
lat: "23.4700202"  typeof string
lng: "120.4589788" typeof string
```

For contrast, the computed `distance_km` on the same rows **is** a real number — MySQL types `6371 * acos(…)` as DOUBLE. Two columns on one row behave differently and the types say otherwise.

### It has already caused a bug

The `news-landmark-backfill` runner had to compare coordinates with a `5e-8` epsilon: without it every row reported as "changed" purely from float round-tripping, which would have made the dry run useless. That is a workaround for this defect, written by someone who hit it rather than someone who knew about it.

### A type predicate vouches for the lie

`components/Facilities/FacilitySearchContent.tsx:139`:

```ts
const geocoded = (facilities ?? []).filter(
  (f): f is FacilityItem & { lat: number; lng: number } => f.lat !== null && f.lng !== null
);
```

The runtime check proves only "not null"; the predicate asserts `number`. Everything downstream then believes it holds numbers — including `FacilityMap.tsx:56`, which passes them to Leaflet's `[number, number]`. That works only because Leaflet coerces. Any arithmetic would silently operate on strings, where `-` coerces but `+` concatenates.

---

## 2. Agreed Architectural Blueprint

**Coerce at the query layer.** Where a row carrying one of these columns is mapped, convert with `Number(...)` so the declared `number | null` becomes true. Downstream code does not change, and the predicate above becomes honest without being touched.

### Why not the alternatives

- **Widening the types to `number | string | null`** is honest but pushes the cost to 20+ call sites, each of which can forget the string branch. The types would be right and the code more fragile.
- **Setting `decimalNumbers: true` on the mysql2 connection** is one line, and rejected: it changes behaviour for **every** DECIMAL column in the schema, not just coordinates. `DECIMAL(10,7)` converts to double losslessly — that guarantee holds for coordinates and not for an arbitrary DECIMAL, so a money or ratio column elsewhere would silently lose precision. The narrow fix does not carry that risk.

### Null must stay null

`Number(null)` is `0`, which would place an ungeocoded row at 0°N 0°E — in the Gulf of Guinea, and inside any radius filter centred near the equator. Every coercion must preserve null explicitly. This is the single most likely way to get this change wrong.

### Scope

Only the twelve tables above, and only their coordinate columns. Do not coerce other DECIMAL columns; the argument for coordinates is that `DECIMAL(10,7)` fits a double exactly, and it does not generalise.

---

## 3. Explicit Non-Goals

- Do not change `decimalNumbers` or any other mysql2 connection option.
- Do not widen any `lat`/`lng` type declaration.
- Do not remove the `5e-8` epsilon in `landmarkTransition` in the same change — it becomes redundant, but removing it belongs in a separate commit that can be reverted on its own if this coercion turns out to miss a path.
- Do not touch rendering or business logic.

---

## 4. Verification

- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.
- **Prove null survives**: a test or a demonstrated read showing an ungeocoded row still yields `lat === null`, not `0`. Say how it was checked.
- Enumerate every query touched, and every query reading these columns that was **not** touched, with the reason — a missed path leaves the type lying in exactly the place nobody is looking.
- After deploy, re-read `/api/facilities?type=child_welfare_center` and show `typeof lat` is now `number`.
- State whether the `5e-8` epsilon is now redundant, without removing it.
