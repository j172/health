import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// Live 2026-10-14 culture-sync results, two incidents in the same day:
// 1. "You have an error in your SQL syntax ... near '01:25:34, 2026-10-14
//    01:25:34'" — utcNowSql() returns a plain datetime string meant to be
//    bound as a parameter; it was interpolated into the SQL text unquoted.
// 2. After fixing (1): "Unknown column 'source_url' in 'INSERT INTO'" — the
//    INSERT/UPDATE statements referenced columns (source_url/city/venue/price
//    /synced_at on cultural_events, venue/address/updated_at on
//    cultural_event_shows) that schema.ts never defines and the working
//    writers (ingestShows.ts, ingestNpoActivities.ts) never use.

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("ingestPresidentialVisit binds timestamps instead of interpolating them", () => {
  const src = read("lib/server/culture/ingestPresidentialVisit.ts");
  assert.doesNotMatch(src, /\$\{utcNowSql\(\)\}/);
  assert.match(src, /const now = utcNowSql\(\);/);
});

test("ingestPresidentialVisit only writes columns that actually exist on cultural_events / cultural_event_shows", () => {
  const src = read("lib/server/culture/ingestPresidentialVisit.ts");
  const schema = read("lib/server/db/schema.ts");
  const showsStart = schema.indexOf("CREATE TABLE IF NOT EXISTS cultural_event_shows");
  const culturalEventsDdl = schema.slice(
    schema.indexOf("CREATE TABLE IF NOT EXISTS cultural_events"),
    schema.indexOf("ENGINE=InnoDB", showsStart) + 50,
  );

  // Only the SQL text itself (the backtick-quoted query strings) matters
  // here — `address`/`venue` are also used as ordinary JS variable names in
  // this file, which is fine.
  const sqlText = [...src.matchAll(/`([^`]*)`/gs)].map((m) => m[1]).join("\n");

  // Columns schema.ts never defines on either table — must not appear as a
  // write target (SET ... =, or an INSERT column list) in the SQL text.
  for (const col of ["source_url", "venue", "address", "synced_at"]) {
    assert.doesNotMatch(culturalEventsDdl, new RegExp(`\\b${col}\\b`), `sanity: ${col} really is absent from the cultural_events/cultural_event_shows DDL`);
    assert.doesNotMatch(
      sqlText,
      new RegExp(`(^|[,\\s(])${col}\\s*(=|[,)])`, "m"),
      `${col} is not a real column on cultural_events or cultural_event_shows`,
    );
  }
  // cultural_events has no standalone `city`/`price` columns (those live on
  // cultural_event_shows instead) — only check the cultural_events statement.
  const eventsBlock = src.slice(src.indexOf("INSERT INTO cultural_events"), src.indexOf("cultural_event_shows"));
  assert.doesNotMatch(eventsBlock, /\bcity\s*=/);
  assert.doesNotMatch(eventsBlock, /\bprice\s*=/);

  // Uses the real columns instead.
  assert.match(src, /category_label/);
  assert.match(src, /location_name/);
  assert.match(src, /CATEGORY_LABELS\[category\]/);
});

test("uses the venue_h category, which the cultural-events UI already has a filter tab for", () => {
  const src = read("lib/server/culture/ingestPresidentialVisit.ts");
  const types = read("lib/server/culture/types.ts");
  assert.match(src, /const category = "venue_h";/);
  assert.match(types, /venue_h: "🏛️ 文化生活圈場館"/);
});
