/**
 * mysql2 returns `DECIMAL` columns as **strings**, to preserve precision a
 * double cannot always hold. Twelve tables in this schema store coordinates as
 * `DECIMAL(10,7)` — facilities, news_items, aqi_readings, pm25_readings,
 * cwa_rainfall, cwa_station_weather, cwa_earthquakes, global_earthquakes,
 * cdc_travel_alerts, cdc_epidemic_news, cultural_event_shows, public_arts —
 * while every interface exposing them declares `lat: number | null`.
 *
 * Measured live before this existed:
 *
 *   GET /api/facilities?type=child_welfare_center
 *   lat: "23.4700202"  typeof string
 *
 * ...on a row whose `distance_km` in the same response *was* a number, because
 * MySQL types `6371 * acos(...)` as DOUBLE. Two columns, one row, and the
 * TypeScript claimed number for both.
 *
 * Coercing here rather than widening the declared types leaves ~20 call sites
 * unchanged, and makes an existing type predicate honest without touching it:
 * `FacilitySearchContent` narrows with `(f): f is { lat: number }` on a runtime
 * check that only proves "not null".
 *
 * Deliberately NOT `decimalNumbers: true` on the connection — that would change
 * every DECIMAL column in the schema. `DECIMAL(10,7)` converts to a double
 * losslessly, but that guarantee is about coordinates, not about an arbitrary
 * money or ratio column elsewhere.
 */

export const COORDINATE_KEYS = ["lat", "lng"] as const;

/**
 * The whole point of this module. `Number(null)` is `0`, and so is `Number("")`
 * — an ungeocoded row coerced naively lands at 0°N 0°E, in the Gulf of Guinea,
 * and *inside* any radius filter centred near the equator. Null has to survive
 * as null.
 *
 * A non-finite parse degrades to null rather than `NaN`, so a malformed value
 * reads as "no coordinate" instead of poisoning arithmetic downstream. `"0"` is
 * a real zero and stays `0`.
 */
export const toCoordinate = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * Coerces coordinate columns on rows in place and returns them, so a query can
 * stay a one-liner: `return coerceCoords(rows) as unknown as Foo[]`.
 *
 * `key in record` matters: a projection that never selected `lat` must not gain
 * a spurious `lat: null`. "Column not selected" and "row is ungeocoded" are
 * different facts, and `NewsListItem.lat` is optional precisely because some
 * queries do not ask for it.
 */
export const coerceCoords = <T extends object>(
  rows: T[],
  keys: readonly string[] = COORDINATE_KEYS,
): T[] => {
  for (const row of rows) {
    const record = row as Record<string, unknown>;
    for (const key of keys) {
      if (key in record) record[key] = toCoordinate(record[key]);
    }
  }
  return rows;
};
