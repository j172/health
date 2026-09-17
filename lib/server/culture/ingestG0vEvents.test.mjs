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
  parseKktixEventEntry,
  runG0vEventsSync,
  G0V_KKTIX_SOURCES,
  parseIcsDate,
  parseG0vCalendarIcs,
  G0V_CALENDAR_PAGE_URL,
} = await import("./ingestG0vEvents.ts");

test("g0v Events: runG0vEventsSync is exported and is a function", () => {
  assert.equal(typeof runG0vEventsSync, "function");
  assert.ok(Array.isArray(G0V_KKTIX_SOURCES));
  assert.equal(G0V_KKTIX_SOURCES.length, 2);
});

test("g0v Events: parseKktixEventEntry extracts structured dates, city, and location", () => {
  const mockEntry = {
    url: "https://g0v-jothon.kktix.cc/events/g0v-hackath73n",
    published: "2026-05-31T10:30:00.000+08:00",
    title: "台灣零時政府第柒拾參次動手自造黑客松 | g0v Braiding our Future Hackath73n",
    summary: "歡迎參加 5/31 週日 g0v 黑客松！",
    content: "時間：2026/05/31 10:30(+0800)~17:30\n地點：g0v 台北社群空間 / g0v Community Hub, Taipei / 台北市中正區重慶南路三段2號",
    author: {
      name: "g0v 零時政府揪松團（g0v jothon）",
      uri: "https://jothon.g0v.tw/",
    },
  };

  const parsed = parseKktixEventEntry(mockEntry);
  assert.ok(parsed);
  assert.equal(parsed.uid, "g0v_kktix_g0v-hackath73n");
  assert.equal(parsed.title, mockEntry.title);
  assert.equal(parsed.startDate, "2026/05/31");
  assert.equal(parsed.endDate, "2026/05/31");
  assert.equal(parsed.city, "臺北市");
  assert.ok(parsed.location.includes("台北市中正區重慶南路"));
  assert.equal(parsed.locationName, "g0v 台北社群空間");
  assert.equal(parsed.masterUnit, "g0v 零時政府揪松團（g0v jothon）");
  assert.equal(parsed.sourceWebPromote, "https://g0v-jothon.kktix.cc/events/g0v-hackath73n");
});

test("g0v Events: parseKktixEventEntry falls back to online participation when no physical venue", () => {
  const mockEntry = {
    url: "https://vtaiwan.kktix.cc/events/vtaiwan-meetup-2",
    published: "2024-12-20T18:30:00.000+08:00",
    title: "【線上參與】vTaiwan 議題小聚#2 w/ TWNIC：台灣的人工智慧規範應該考慮什麼",
    summary: "歡迎線上參與討論！",
    content: "時間：2024/12/20 18:30(+0800)~20:30\n地點：線上會議（Google Meet 連結於報名後提供）",
  };

  const parsed = parseKktixEventEntry(mockEntry);
  assert.ok(parsed);
  assert.equal(parsed.city, null);
  assert.equal(parsed.location, "線上活動 / 全國參與");
  assert.equal(parsed.locationName, "線上活動");
});

test("g0v Events: parseKktixEventEntry returns null for invalid entry", () => {
  assert.equal(parseKktixEventEntry(null), null);
  assert.equal(parseKktixEventEntry({}), null);
});

test("g0v Events: parseIcsDate parses YYYYMMDD and UTC ISO formats accurately", () => {
  assert.equal(parseIcsDate("20260531"), "2026-05-31 00:00:00");
  assert.equal(parseIcsDate("20260531T023000Z"), "2026-05-31 10:30:00");
  assert.equal(parseIcsDate(null), null);
});

test("g0v Events: parseG0vCalendarIcs extracts events from Google Calendar ICS format", () => {
  const sampleIcs = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Google Inc//Google Calendar 70.9054//EN
BEGIN:VEVENT
DTSTART:20260531T023000Z
DTEND:20260531T093000Z
UID:sample_g0v_hackath73n@google.com
SUMMARY:台灣零時政府第柒拾參次動手自造黑客松
LOCATION:台北市中正區重慶南路三段2號
DESCRIPTION:歡迎參加黑客松！
END:VEVENT
BEGIN:VEVENT
DTSTART:20260615T100000Z
DTEND:20260615T120000Z
UID:sample_domain_reminder@google.com
SUMMARY:[domain] g0v.tw 到期提醒
DESCRIPTION:過期請續約
END:VEVENT
END:VCALENDAR`;

  const parsed = parseG0vCalendarIcs(sampleIcs, "2026-01-01");
  assert.equal(parsed.length, 1, "Should filter out [domain] reminder and keep 1 real event");
  assert.equal(parsed[0].title, "台灣零時政府第柒拾參次動手自造黑客松");
  assert.equal(parsed[0].startDate, "2026-05-31 10:30:00");
  assert.equal(parsed[0].endDate, "2026-05-31 17:30:00");
  assert.equal(parsed[0].city, "臺北市");
  assert.equal(parsed[0].sourceWebPromote, G0V_CALENDAR_PAGE_URL);
  assert.equal(parsed[0].masterUnit, "g0v 零時政府");
});

