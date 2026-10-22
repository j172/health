// 全站地震速報橫幅。架構比照颱風警報橫幅（issue #744，tests/typhoon-banner-744.test.mjs）。
//
// 覆蓋：
//  1. 有感判定純函式（area_intensity_json 有無內容，含字串／陣列／物件／壞值）。
//  2. 72 小時視窗純函式與 buildEarthquakeStatus 的選取規則（多筆取最新、過期排除、無感排除）。
//  3. 端點回應形狀、快取標頭、資料庫讀不到時回 active:false 且短 TTL（真的呼叫 route 的 GET）。
//  4. 「頁面 HTML 不依賴地震狀態」：用 react-dom/server 實際渲染，確認即使 store 已載入生效中的
//     地震，SSR 輸出仍是未知（null）；外加原始碼契約（頁面／layout 不引用任何伺服器端地震來源）。
//  5. 瀏覽器端 store：共用單一請求、失敗／逾時／壞回應都不顯示。
//  6. 四種語言都有文案。
//
// 元件是 JSX（Node 不能直接執行），所以元件層用原始碼契約檢查，這是本 repo 既有的慣例
// （見 tests/typhoon-banner-744.test.mjs）。
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "./helpers/register-ts-alias-hooks.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (...segments) => fs.readFileSync(path.join(ROOT, ...segments), "utf-8");
const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const {
  buildEarthquakeStatus,
  EARTHQUAKE_BANNER_WINDOW_MS,
  isEarthquakeBannerExcludedPath,
  isFeltEarthquake,
  isWithinEarthquakeBannerWindow,
  parseEarthquakeStatus,
  shouldShowEarthquakeBanner,
} = await import("../lib/earthquake/earthquakeStatus.ts");
const cacheControl = await import("../lib/server/earthquake/cacheControl.ts");

// ---------------------------------------------------------------- 1. 有感判定 ---

test("isFeltEarthquake: 有內容的 area_intensity_json（陣列／物件）→ 有感", () => {
  assert.equal(isFeltEarthquake({ area_intensity_json: [{ AreaDesc: "台北市", AreaIntensity: "3" }] }), true);
  assert.equal(isFeltEarthquake({ area_intensity_json: { AreaDesc: "台北市" } }), true);
  assert.equal(isFeltEarthquake({ area_intensity_json: '[{"AreaDesc":"台北市"}]' }), true);
});

test("isFeltEarthquake: null／空陣列／空物件／空字串 → 無感", () => {
  assert.equal(isFeltEarthquake({ area_intensity_json: null }), false);
  assert.equal(isFeltEarthquake({ area_intensity_json: undefined }), false);
  assert.equal(isFeltEarthquake({ area_intensity_json: [] }), false);
  assert.equal(isFeltEarthquake({ area_intensity_json: {} }), false);
  assert.equal(isFeltEarthquake({ area_intensity_json: "" }), false);
  assert.equal(isFeltEarthquake({ area_intensity_json: "[]" }), false);
  assert.equal(isFeltEarthquake({ area_intensity_json: "{}" }), false);
  assert.equal(isFeltEarthquake({ area_intensity_json: "null" }), false);
});

test("isFeltEarthquake: 壞掉但非空的字串（不是合法 JSON）寧可當作有感，不要漏掉", () => {
  assert.equal(isFeltEarthquake({ area_intensity_json: "not json but not empty" }), true);
});

// -------------------------------------------------------- 2. 72 小時視窗／選取 ---

test("isWithinEarthquakeBannerWindow: 72 小時內 true，超過 false，壞值 false", () => {
  const now = Date.parse("2026-10-22T12:00:00Z");
  assert.equal(isWithinEarthquakeBannerWindow("2026-10-22T11:00:00Z", now), true);
  assert.equal(isWithinEarthquakeBannerWindow("2026-10-19T13:00:00Z", now), true, "72 小時內（71 小時前）");
  assert.equal(isWithinEarthquakeBannerWindow("2026-10-19T11:00:00Z", now), false, "超過 72 小時（73 小時前）");
  assert.equal(isWithinEarthquakeBannerWindow(null, now), false);
  assert.equal(isWithinEarthquakeBannerWindow(undefined, now), false);
  assert.equal(isWithinEarthquakeBannerWindow("not-a-date", now), false);
  // 剛好 72 小時整：origin + 72hr > now，所以剛好 72 小時前已經不算（嚴格大於）。
  const exactly72hAgo = new Date(now - EARTHQUAKE_BANNER_WINDOW_MS).toISOString();
  assert.equal(isWithinEarthquakeBannerWindow(exactly72hAgo, now), false);
});

test("buildEarthquakeStatus: 空陣列／null → 不生效", () => {
  assert.deepEqual(buildEarthquakeStatus([], 0), { active: false });
  assert.deepEqual(buildEarthquakeStatus(null, 0), { active: false });
});

test("buildEarthquakeStatus: 單筆有感且在視窗內 → 生效，帶規模／震度／地點／時間", () => {
  const now = Date.parse("2026-10-22T12:00:00Z");
  const status = buildEarthquakeStatus(
    [
      {
        earthquake_no: 11400001,
        origin_time: "2026-10-22T10:00:00Z",
        location: "花蓮縣政府東北東方 25.3 公里 (位於花蓮縣秀林鄉)",
        magnitude_value: 5.8,
        max_intensity: "5弱",
        area_intensity_json: [{ AreaDesc: "花蓮縣", AreaIntensity: "5弱" }],
      },
    ],
    now,
  );
  assert.deepEqual(status, {
    active: true,
    originTime: "2026-10-22T10:00:00.000Z",
    magnitude: 5.8,
    maxIntensity: "5弱",
    location: "花蓮縣政府東北東方 25.3 公里 (位於花蓮縣秀林鄉)",
  });
});

test("buildEarthquakeStatus: 無感（沒有 area_intensity_json）即使很新也不生效", () => {
  const now = Date.parse("2026-10-22T12:00:00Z");
  const status = buildEarthquakeStatus(
    [{ origin_time: "2026-10-22T11:59:00Z", magnitude_value: 3.2, area_intensity_json: null }],
    now,
  );
  assert.deepEqual(status, { active: false });
});

test("buildEarthquakeStatus: 超過 72 小時的有感地震不生效", () => {
  const now = Date.parse("2026-10-22T12:00:00Z");
  const status = buildEarthquakeStatus(
    [
      {
        origin_time: "2026-10-01T00:00:00Z",
        magnitude_value: 6.5,
        area_intensity_json: [{ AreaDesc: "台北市", AreaIntensity: "4" }],
      },
    ],
    now,
  );
  assert.deepEqual(status, { active: false });
});

test("buildEarthquakeStatus: 多筆都在視窗內 → 只取 origin_time 最新的一筆", () => {
  const now = Date.parse("2026-10-22T12:00:00Z");
  const status = buildEarthquakeStatus(
    [
      { earthquake_no: 1, origin_time: "2026-10-21T00:00:00Z", magnitude_value: 4.0, area_intensity_json: [{}] },
      { earthquake_no: 2, origin_time: "2026-10-22T09:00:00Z", magnitude_value: 5.5, area_intensity_json: [{}] },
      { earthquake_no: 3, origin_time: "2026-10-20T00:00:00Z", magnitude_value: 6.0, area_intensity_json: [{}] },
    ],
    now,
  );
  assert.equal(status.active, true);
  assert.equal(status.magnitude, 5.5);
  assert.equal(status.originTime, "2026-10-22T09:00:00.000Z");
});

test("buildEarthquakeStatus: 混合有感／無感、視窗內／外 → 只在候選中挑最新的有感＋視窗內", () => {
  const now = Date.parse("2026-10-22T12:00:00Z");
  const status = buildEarthquakeStatus(
    [
      // 最新但無感：排除。
      { earthquake_no: 1, origin_time: "2026-10-22T11:00:00Z", magnitude_value: 2.0, area_intensity_json: null },
      // 有感但超過 72 小時：排除。
      { earthquake_no: 2, origin_time: "2026-10-01T00:00:00Z", magnitude_value: 7.0, area_intensity_json: [{}] },
      // 有感且在視窗內：中選。
      { earthquake_no: 3, origin_time: "2026-10-22T06:00:00Z", magnitude_value: 4.8, max_intensity: "3", location: "宜蘭縣", area_intensity_json: [{}] },
    ],
    now,
  );
  assert.deepEqual(status, {
    active: true,
    originTime: "2026-10-22T06:00:00.000Z",
    magnitude: 4.8,
    maxIntensity: "3",
    location: "宜蘭縣",
  });
});

test("buildEarthquakeStatus: 缺規模／震度／地點時省略對應欄位；地點過長會截短", () => {
  const now = Date.parse("2026-10-22T12:00:00Z");
  const sparse = buildEarthquakeStatus(
    [{ origin_time: "2026-10-22T06:00:00Z", magnitude_value: null, max_intensity: null, location: null, area_intensity_json: [{}] }],
    now,
  );
  assert.deepEqual(sparse, { active: true, originTime: "2026-10-22T06:00:00.000Z" });

  const long = buildEarthquakeStatus(
    [{ origin_time: "2026-10-22T06:00:00Z", location: "x".repeat(200), area_intensity_json: [{}] }],
    now,
  );
  assert.ok(long.location.length <= 80);
});

// ------------------------------------------------- 顯示決策／瀏覽器端回應驗證 ---

test("parseEarthquakeStatus: 壞掉或不完整的回應一律當作沒有地震", () => {
  for (const bad of [null, undefined, 0, "active", [], {}, { active: false }, { active: "true" }, { active: 1 }, { magnitude: 5 }]) {
    assert.deepEqual(parseEarthquakeStatus(bad), { active: false }, JSON.stringify(bad));
  }
});

test("parseEarthquakeStatus: 只保留已知欄位，過濾無效的 originTime", () => {
  const parsed = parseEarthquakeStatus({
    active: true,
    magnitude: 5.8,
    maxIntensity: "5弱",
    location: "  花蓮縣秀林鄉 ",
    originTime: "2026-10-22T10:00:00.000Z",
    county: "花蓮縣",
  });
  assert.deepEqual(parsed, {
    active: true,
    magnitude: 5.8,
    maxIntensity: "5弱",
    location: "花蓮縣秀林鄉",
    originTime: "2026-10-22T10:00:00.000Z",
  });
  assert.equal("originTime" in parseEarthquakeStatus({ active: true, originTime: "nope" }), false);
});

test("shouldShowEarthquakeBanner: 只有確定生效才顯示；未載入／失敗／無地震都不顯示（版面不留空）", () => {
  assert.equal(shouldShowEarthquakeBanner(null), false);
  assert.equal(shouldShowEarthquakeBanner(undefined), false);
  assert.equal(shouldShowEarthquakeBanner({ active: false }), false);
  assert.equal(shouldShowEarthquakeBanner({ active: true }), true);
});

test("isEarthquakeBannerExcludedPath: 後台頁面不顯示橫幅，其他頁面（含 /en 語系、新聞單篇）顯示", () => {
  assert.equal(isEarthquakeBannerExcludedPath("/admin"), true);
  assert.equal(isEarthquakeBannerExcludedPath("/admin/social-queue"), true);
  for (const p of ["/", "/news/123", "/tools/bmi", "/en", "/ja/tools/weather-alerts", "/administrators", null, undefined]) {
    assert.equal(isEarthquakeBannerExcludedPath(p), false, String(p));
  }
});

// ---------------------------------------------------------------- 3. 端點 ---

test("快取標頭常數：正常 60 秒（含 s-maxage 與 stale-while-revalidate）、讀不到時短 TTL", () => {
  assert.equal(cacheControl.EARTHQUAKE_STATUS_CACHE_NORMAL, "public, max-age=0, s-maxage=60, stale-while-revalidate=120");
  assert.match(cacheControl.EARTHQUAKE_STATUS_CACHE_DB_UNAVAILABLE, /s-maxage=10\b/);
  assert.ok(!/stale-while-revalidate/.test(cacheControl.EARTHQUAKE_STATUS_CACHE_DB_UNAVAILABLE));
});

test("GET /api/earthquake-status：資料庫讀不到 → 200、active:false、短 TTL 標頭（真的呼叫 route）", async () => {
  // 假的、不可連線的設定，只為了讓模組能載入；連線會立刻被拒絕。沒有任何真實憑證。
  const previous = { ...process.env };
  Object.assign(process.env, {
    MYSQL_HOST: "127.0.0.1",
    MYSQL_PORT: "1",
    MYSQL_USER: "test-unreachable",
    MYSQL_PASSWORD: "test-unreachable",
    MYSQL_DATABASE: "test-unreachable",
    RSS_SYNC_ADMIN_SECRET: "test-unreachable",
  });
  const warn = console.warn;
  console.warn = () => {};
  try {
    const { GET } = await import("../app/api/earthquake-status/route.ts");
    const response = await GET();
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { active: false });
    assert.equal(response.headers.get("cache-control"), cacheControl.EARTHQUAKE_STATUS_CACHE_DB_UNAVAILABLE);
  } finally {
    console.warn = warn;
    for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key];
    Object.assign(process.env, previous);
  }
});

test("route 原始碼：顯式宣告 Cache-Control（上游對無標頭的 /api/* 會補 30 分鐘）、只匯出 GET/runtime/dynamic", () => {
  const code = stripComments(read("app", "api", "earthquake-status", "route.ts"));
  assert.match(code, /"Cache-Control": cacheControl/);
  assert.match(code, /EARTHQUAKE_STATUS_CACHE_NORMAL/);
  assert.match(code, /EARTHQUAKE_STATUS_CACHE_DB_UNAVAILABLE/);
  assert.match(code, /export const dynamic = "force-dynamic"/);
  const exports = [...code.matchAll(/^export\s+(?:async\s+)?(?:const|function)\s+(\w+)/gm)].map((m) => m[1]);
  assert.deepEqual(exports.sort(), ["GET", "dynamic", "runtime"]);
});

test("狀態查詢只讀 cwa_earthquakes（CWA 地震報告 E-A0015-001），SQL 用 origin_time 做 72 小時粗篩", () => {
  const status = stripComments(read("lib", "server", "earthquake", "status.ts"));
  assert.match(status, /FROM cwa_earthquakes/);
  assert.match(status, /origin_time >= DATE_SUB\(UTC_TIMESTAMP\(\), INTERVAL \? HOUR\)/);
  assert.match(status, /area_intensity_json IS NOT NULL/);
  assert.match(status, /EARTHQUAKE_BANNER_WINDOW_HOURS/);
  assert.match(status, /return null;/);
});

// ----------------------------------- 4/5. 頁面 HTML 不依賴地震狀態；瀏覽器端 store ---

const REACT = await import("react");
const { renderToString } = await import("react-dom/server");

const installFakeBrowser = ({ fetchImpl } = {}) => {
  globalThis.window = { location: { search: "" } };
  globalThis.fetch = fetchImpl;
};
const uninstallFakeBrowser = () => {
  delete globalThis.window;
  delete globalThis.fetch;
};

const jsonResponse = (body, init = {}) => ({
  ok: init.ok ?? true,
  status: init.status ?? 200,
  json: async () => body,
});

test("SSR 輸出不依賴地震狀態：即使 store 已載入「生效中」，伺服器渲染仍是未知（null）", async () => {
  const eqStore = await import("../lib/client/earthquakeStatusStore.ts");
  eqStore.__resetEarthquakeStatusStoreForTests();
  installFakeBrowser({ fetchImpl: async () => jsonResponse({ active: true, magnitude: 5.8, originTime: "2026-10-22T10:00:00.000Z" }) });
  try {
    await eqStore.refreshEarthquakeStatus(true);
    assert.equal(eqStore.getEarthquakeStatusSnapshot().active, true);

    const Probe = () => {
      const status = eqStore.useEarthquakeStatus();
      return REACT.createElement("span", { "data-status": String(status === null ? "unknown" : status.active) }, status === null ? "" : "ALERT");
    };
    const html = renderToString(REACT.createElement(Probe));
    assert.match(html, /data-status="unknown"/);
    assert.ok(!html.includes("ALERT"));

    // 沒有地震時的輸出與有地震時逐字相同 → 被快取的 HTML 與有無地震無關。
    eqStore.__resetEarthquakeStatusStoreForTests();
    globalThis.fetch = async () => jsonResponse({ active: false });
    await eqStore.refreshEarthquakeStatus(true);
    assert.equal(renderToString(REACT.createElement(Probe)), html);
  } finally {
    uninstallFakeBrowser();
    eqStore.__resetEarthquakeStatusStoreForTests();
  }
});

test("store：同時多個元件只會發出一次請求；60 秒內不重抓", async () => {
  const eqStore = await import("../lib/client/earthquakeStatusStore.ts");
  eqStore.__resetEarthquakeStatusStoreForTests();
  let calls = 0;
  installFakeBrowser({
    fetchImpl: async () => {
      calls += 1;
      return jsonResponse({ active: true, magnitude: 4.5 });
    },
  });
  try {
    await Promise.all([eqStore.refreshEarthquakeStatus(), eqStore.refreshEarthquakeStatus(), eqStore.refreshEarthquakeStatus()]);
    assert.equal(calls, 1);
    await eqStore.refreshEarthquakeStatus();
    assert.equal(calls, 1, "60 秒內不重抓");
    await eqStore.refreshEarthquakeStatus(true);
    assert.equal(calls, 2);
    assert.equal(eqStore.getEarthquakeStatusSnapshot().magnitude, 4.5);
  } finally {
    uninstallFakeBrowser();
    eqStore.__resetEarthquakeStatusStoreForTests();
  }
});

test("store：HTTP 錯誤、網路錯誤、壞 JSON、壞形狀 → 都不顯示橫幅，且已顯示的也會撤掉", async () => {
  const eqStore = await import("../lib/client/earthquakeStatusStore.ts");
  const failures = [
    async () => jsonResponse({ active: true }, { ok: false, status: 503 }),
    async () => {
      throw new TypeError("network down");
    },
    async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError("bad json"); } }),
    async () => jsonResponse("<html>cloudflare challenge</html>"),
    async () => jsonResponse({ active: "yes" }),
  ];
  for (const failing of failures) {
    eqStore.__resetEarthquakeStatusStoreForTests();
    installFakeBrowser({ fetchImpl: async () => jsonResponse({ active: true }) });
    try {
      await eqStore.refreshEarthquakeStatus(true);
      assert.equal(eqStore.getEarthquakeStatusSnapshot().active, true);
      globalThis.fetch = failing;
      await eqStore.refreshEarthquakeStatus(true);
      assert.equal(shouldShowEarthquakeBanner(eqStore.getEarthquakeStatusSnapshot()), false);
    } finally {
      uninstallFakeBrowser();
    }
  }
  eqStore.__resetEarthquakeStatusStoreForTests();
});

test("store：逾時（請求被 abort）→ 不顯示橫幅", async () => {
  const eqStore = await import("../lib/client/earthquakeStatusStore.ts");
  eqStore.__resetEarthquakeStatusStoreForTests();
  installFakeBrowser({
    fetchImpl: (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      }),
  });
  const realSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (fn, _ms, ...rest) => realSetTimeout(fn, 1, ...rest);
  try {
    await eqStore.refreshEarthquakeStatus(true);
    assert.equal(shouldShowEarthquakeBanner(eqStore.getEarthquakeStatusSnapshot()), false);
  } finally {
    globalThis.setTimeout = realSetTimeout;
    uninstallFakeBrowser();
    eqStore.__resetEarthquakeStatusStoreForTests();
  }
});

test("the client store revalidates instead of trusting a Cloudflare-inflated max-age", () => {
  const store = fs.readFileSync(new URL("../lib/client/earthquakeStatusStore.ts", import.meta.url), "utf8");
  assert.match(store, /cache: "no-cache"/);
});

// ------------------------------------------------------- 原始碼契約（掛載與快取） ---

test("橫幅掛在 (zh) 與 [locale] 兩個根 layout，在 TyphoonBanner 之後、SkipToContent 之後、主內容之前", () => {
  for (const file of [["app", "(zh)", "layout.tsx"], ["app", "[locale]", "layout.tsx"]]) {
    const source = read(...file);
    assert.match(source, /import EarthquakeBanner from "@\/components\/Earthquake\/EarthquakeBanner"/, file.join("/"));
    const skip = source.indexOf("<SkipToContent />");
    const typhoon = source.indexOf("<TyphoonBanner />");
    const earthquake = source.indexOf("<EarthquakeBanner />");
    const main = source.indexOf('id="main-content"');
    assert.ok(skip !== -1 && typhoon > skip && earthquake > typhoon && earthquake < main, `${file.join("/")}: banner order`);
  }
});

test("被快取的頁面與 layout 不引用任何伺服器端地震狀態來源（HTML 與地震狀態無關）", () => {
  for (const file of [
    ["app", "(zh)", "layout.tsx"],
    ["app", "[locale]", "layout.tsx"],
    ["app", "(zh)", "(site)", "page.tsx"],
    ["app", "[locale]", "page.tsx"],
  ]) {
    const code = stripComments(read(...file));
    assert.ok(!/loadEarthquakeStatus|lib\/server\/earthquake|cwa_earthquakes|buildEarthquakeStatus/.test(code), file.join("/"));
  }
});

test("橫幅是 client component，且只透過共用 store 取得狀態（不自己 fetch）", () => {
  const source = read("components", "Earthquake", "EarthquakeBanner.tsx");
  assert.match(source, /^"use client";/);
  assert.match(source, /useEarthquakeStatus\(/);
  assert.ok(!/\bfetch\(/.test(stripComments(source)), "不應自己 fetch");
  assert.ok(!/from "@\/lib\/server\//.test(source), "不應匯入伺服器端模組");
  const storeSource = read("lib", "client", "earthquakeStatusStore.ts");
  assert.match(storeSource, /const getServerSnapshot = \(\): EarthquakeStatus \| null => null;/);
});

test("橫幅：連到地震工具頁、提到中央氣象署、role=status、後台頁面排除", () => {
  const source = read("components", "Earthquake", "EarthquakeBanner.tsx");
  assert.match(source, /\/tools\/global-watch\/earthquakes/);
  assert.match(source, /role="status"/);
  assert.match(source, /isEarthquakeBannerExcludedPath\(pathname\)/);
  assert.match(source, /shouldShowEarthquakeBanner\(status\)/);
});

// ------------------------------------------------------------------- 文案 ---

const EARTHQUAKE_KEYS = {
  banner: ["ariaLabel", "badge", "title", "magnitudeTemplate", "intensityTemplate", "originTimeTemplate", "notice", "linkTool"],
};

test("en／ja／ko 都有完整的橫幅文案，且 {magnitude}／{intensity}／{time} 樣板保留", () => {
  for (const locale of ["en", "ja", "ko"]) {
    const dict = JSON.parse(read("locales", `${locale}.json`));
    for (const [group, keys] of Object.entries(EARTHQUAKE_KEYS)) {
      for (const key of keys) {
        assert.equal(typeof dict.earthquake?.[group]?.[key], "string", `${locale}.earthquake.${group}.${key}`);
        assert.ok(dict.earthquake[group][key].length > 0);
      }
    }
    assert.match(dict.earthquake.banner.magnitudeTemplate, /\{magnitude\}/);
    assert.match(dict.earthquake.banner.intensityTemplate, /\{intensity\}/);
    assert.match(dict.earthquake.banner.originTimeTemplate, /\{time\}/);
  }
});

test("zh 預設文案：每個 t() 的 key 都在三種語言的結構裡", () => {
  const source = read("components", "Earthquake", "EarthquakeBanner.tsx");
  const keys = new Set([...source.matchAll(/t\(\s*"(earthquake\.[\w.]+)"/g)].map((m) => m[1]));
  assert.ok(keys.size >= 8);
  const en = JSON.parse(read("locales", "en.json"));
  for (const key of keys) {
    const value = key.split(".").reduce((acc, part) => acc?.[part], en);
    assert.equal(typeof value, "string", `en.${key}`);
  }
  const zhDefaults = [...source.matchAll(/t\(\s*"earthquake\.[\w.]+"\s*,\s*"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(zhDefaults.length >= 8);
});
