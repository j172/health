import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const REPO_ROOT = new URL("../../../", import.meta.url);

process.env.MYSQL_HOST = "localhost";
process.env.MYSQL_USER = "test";
process.env.MYSQL_PASSWORD = "test";
process.env.MYSQL_DATABASE = "test";
process.env.RSS_SYNC_ADMIN_SECRET = "test";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return { url: "data:text/javascript,", shortCircuit: true };
    }
    let target = specifier;
    let parentURL = context.parentURL;
    if (specifier.startsWith("@/")) {
      target = `./${specifier.slice(2)}`;
      parentURL = REPO_ROOT.href;
    }
    if (target.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(target)) {
      for (const extension of [".ts", ".tsx"]) {
        const candidate = new URL(target + extension, parentURL);
        if (existsSync(fileURLToPath(candidate))) {
          return nextResolve(target + extension, { ...context, parentURL });
        }
      }
    }
    return nextResolve(target, { ...context, parentURL });
  },
});

const {
  parseKumaSlotEntry,
  runKumaEventsSync,
  KUMA_CITY_MAP,
} = await import("./ingestKumaEvents.ts");

test("Kuma Events: runKumaEventsSync is exported and is a function", () => {
  assert.equal(typeof runKumaEventsSync, "function");
  assert.ok(typeof KUMA_CITY_MAP === "object");
  assert.equal(KUMA_CITY_MAP[1], "臺北市");
  assert.equal(KUMA_CITY_MAP[8], "臺中市");
  assert.equal(KUMA_CITY_MAP[15], "高雄市");
});

test("Kuma Events: parseKumaSlotEntry extracts slot details correctly", () => {
  const mockSlot = {
    id: 510,
    sid: "C1S0000510",
    name: "台北場｜09/19（六）",
    address_name: "黑熊學院",
    address_city: 1,
    address_text: "中正區武昌街一段 18 號三樓 黑熊學院",
    event_time_start: "2026-09-19 13:30:00",
    event_time_end: "2026-09-19 18:00:00",
    buying_limit: 2,
    status: "registration",
    course_in_person: {
      id: 46,
      sid: "C100000046",
      name: "熊熊親子營：家庭防災入門課",
      image_url: "https://storage.googleapis.com/kuma-academy/course/test.png",
      thumbnail_url: "https://storage.googleapis.com/kuma-academy/course/thumb.png",
      type: { id: 7, name: "黑熊開講" },
      category: [{ id: 14, name: "營隊課程" }],
    },
  };

  const parsed = parseKumaSlotEntry(mockSlot);
  assert.ok(parsed);
  assert.equal(parsed.uid, "kuma_slot_510");
  assert.equal(parsed.title, "熊熊親子營：家庭防災入門課（台北場｜09/19（六））");
  assert.equal(parsed.masterUnit, "黑熊學院");
  assert.equal(parsed.category, "npo");
  assert.equal(parsed.categoryLabel, "🤝 公益活動");
  assert.equal(parsed.city, "臺北市");
  assert.equal(parsed.startDate, "2026-09-19 13:30:00");
  assert.equal(parsed.endDate, "2026-09-19 18:00:00");
  assert.ok(parsed.description.includes("開放報名中"));
  assert.equal(parsed.imageUrl, "https://storage.googleapis.com/kuma-academy/course/test.png");
  assert.equal(parsed.sourceWebPromote, "https://kuma-academy.org/calendar");
});

test("Kuma Events: parseKumaSlotEntry gracefully handles missing fields", () => {
  assert.equal(parseKumaSlotEntry(null), null);
  assert.equal(parseKumaSlotEntry({}), null);

  const minimal = {
    id: 999,
    name: "台中場",
    event_time_start: "2026-10-01 10:00:00",
    address_city: 8,
  };
  const parsed = parseKumaSlotEntry(minimal);
  assert.ok(parsed);
  assert.equal(parsed.uid, "kuma_slot_999");
  assert.equal(parsed.city, "臺中市");
  assert.equal(parsed.category, "npo");
});
