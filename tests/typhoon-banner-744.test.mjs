// Issue #744 — 颱風警報全站橫幅＋首頁常駐大卡片。
//
// 覆蓋：
//  1. 海陸判斷純函式（含 CAP event／headline 變體、空值、亂碼）。
//  2. 端點回應形狀、快取標頭、資料庫讀不到時回 active:false 且短 TTL（真的呼叫 route 的 GET）。
//  3. 模擬機制只在「伺服器設定金鑰＋請求帶對金鑰」時生效，一般訪客帶參數無效。
//  4. 「頁面 HTML 不依賴警報」：用 react-dom/server 實際渲染，確認即使 store 已載入生效中的警報，
//     SSR 輸出仍是未知（null）；外加原始碼契約（頁面／layout 不引用任何伺服器端警報來源）。
//  5. 瀏覽器端 store：共用單一請求、失敗／逾時／壞回應都不顯示。
//  6. 文案不轉述各縣市是否放假；四種語言都有文案。
//
// 元件是 JSX（Node 不能直接執行），所以元件層用原始碼契約檢查，這是本 repo 既有的慣例
// （見 tests/home-rebuild-472.test.mjs）。
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
  buildTyphoonStatus,
  classifyTyphoonLevel,
  isTyphoonBannerExcludedPath,
  parseTyphoonStatus,
  pickTyphoonNames,
  shouldShowTyphoonBanner,
} = await import("../lib/typhoon/typhoonStatus.ts");
const { buildSimulatedStatus, resolveSimulatedLevel } = await import("../lib/server/typhoon/simulation.ts");
const cacheControl = await import("../lib/server/typhoon/cacheControl.ts");

// ---------------------------------------------------------------- 1. 海陸判斷 ---

test("classifyTyphoonLevel: 含「陸上」→ 陸上（含 海上陸上警報）", () => {
  assert.equal(classifyTyphoonLevel(["陸上警報"]), "land");
  assert.equal(classifyTyphoonLevel(["海上陸上警報"]), "land");
  assert.equal(classifyTyphoonLevel(["颱風海上陸上警報"]), "land");
  assert.equal(classifyTyphoonLevel(["颱風", "輕度颱風 陸上警報 發布"]), "land");
  assert.equal(classifyTyphoonLevel(["Typhoon Sea and Land Warning"]), "land");
  assert.equal(classifyTyphoonLevel(["Typhoon Land Warning"]), "land");
});

test("classifyTyphoonLevel: 只有「海上」→ 海上", () => {
  assert.equal(classifyTyphoonLevel(["海上警報"]), "sea");
  assert.equal(classifyTyphoonLevel(["颱風海上警報"]), "sea");
  assert.equal(classifyTyphoonLevel(["海上颱風警報", null]), "sea");
  assert.equal(classifyTyphoonLevel([null, "中度颱風 海上警報（第1報）"]), "sea");
  assert.equal(classifyTyphoonLevel(["Typhoon Sea Warning"]), "sea");
});

test("classifyTyphoonLevel: 全形字、空白、大小寫變體仍可辨識", () => {
  assert.equal(classifyTyphoonLevel(["　海上　警報"]), "sea");
  assert.equal(classifyTyphoonLevel(["ＳＥＡ　ＷＡＲＮＩＮＧ"]), "sea");
  assert.equal(classifyTyphoonLevel(["LAND WARNING"]), "land");
});

test("classifyTyphoonLevel: 無法判斷（空值、空字串、亂碼、非字串）一律當陸上", () => {
  assert.equal(classifyTyphoonLevel([]), "land");
  assert.equal(classifyTyphoonLevel([null, undefined]), "land");
  assert.equal(classifyTyphoonLevel([""]), "land");
  assert.equal(classifyTyphoonLevel(["颱風警報"]), "land");
  assert.equal(classifyTyphoonLevel(["��� ??? ���"]), "land");
  assert.equal(classifyTyphoonLevel([123, {}, [], true]), "land");
  // 「seashore」「landing」這類含 sea／land 字樣的英文單字不算。
  assert.equal(classifyTyphoonLevel(["seashore landing"]), "land");
});

test("buildTyphoonStatus: 空陣列／null → 不生效", () => {
  assert.deepEqual(buildTyphoonStatus([]), { active: false, level: null });
  assert.deepEqual(buildTyphoonStatus(null), { active: false, level: null });
});

test("buildTyphoonStatus: 單筆海上 → 橙色 sea，帶名稱與發布時間（UTC ISO）", () => {
  const status = buildTyphoonStatus([
    { event: "海上警報", headline: "颱風海上警報", effective: new Date("2026-10-21T06:00:00Z"), synced_at: null },
  ]);
  assert.deepEqual(status, {
    active: true,
    level: "sea",
    name: "海上警報",
    issuedAt: "2026-10-21T06:00:00.000Z",
  });
});

test("buildTyphoonStatus: 多筆中只要有一筆陸上就是陸上；name／issuedAt 取陸上中最新的一筆", () => {
  const status = buildTyphoonStatus([
    { event: "海上警報", effective: "2026-10-21T09:00:00Z" },
    { event: "海上陸上警報", effective: "2026-10-21T03:00:00Z" },
    { event: "陸上警報", effective: "2026-10-21T05:00:00Z" },
  ]);
  assert.equal(status.level, "land");
  assert.equal(status.name, "陸上警報");
  assert.equal(status.issuedAt, "2026-10-21T05:00:00.000Z");
});

test("buildTyphoonStatus: 沒有 effective 時退回 synced_at；兩者都壞則省略 issuedAt；名稱過長會截短", () => {
  const fallback = buildTyphoonStatus([{ event: "陸上警報", effective: null, synced_at: new Date("2026-10-20T00:00:00Z") }]);
  assert.equal(fallback.issuedAt, "2026-10-20T00:00:00.000Z");

  const garbage = buildTyphoonStatus([{ event: "x".repeat(200), effective: "not-a-date", synced_at: undefined }]);
  assert.equal(garbage.active, true);
  assert.equal("issuedAt" in garbage, false);
  assert.ok(garbage.name.length <= 60);
});

test("buildTyphoonStatus: event／headline 都是空值也算生效（無法判斷＝陸上），且沒有 name", () => {
  const status = buildTyphoonStatus([{ event: null, headline: null, effective: null, synced_at: null }]);
  assert.deepEqual(status, { active: true, level: "land" });
});

test("狀態裡不含任何縣市欄位（本站不轉述各縣市停班停課）", () => {
  const status = buildTyphoonStatus([{ event: "海上陸上警報", headline: "臺北市 新北市 停止上班", effective: null }]);
  assert.deepEqual(Object.keys(status).sort(), ["active", "level", "name"].sort());
  assert.ok(!/縣|市|停止上班|放假/.test(JSON.stringify({ ...status, name: undefined })));
});

// ------------------------------------------------- 顯示決策／瀏覽器端回應驗證 ---

test("parseTyphoonStatus: 壞掉或不完整的回應一律當作沒有警報", () => {
  for (const bad of [null, undefined, 0, "active", [], {}, { active: false }, { active: "true" }, { active: 1 }, { level: "land" }]) {
    assert.deepEqual(parseTyphoonStatus(bad), { active: false, level: null }, JSON.stringify(bad));
  }
});

test("parseTyphoonStatus: active:true 時，level 缺失或亂填 → 陸上；sea 保持海上", () => {
  assert.equal(parseTyphoonStatus({ active: true, level: "sea" }).level, "sea");
  assert.equal(parseTyphoonStatus({ active: true, level: "land" }).level, "land");
  assert.equal(parseTyphoonStatus({ active: true }).level, "land");
  assert.equal(parseTyphoonStatus({ active: true, level: "purple" }).level, "land");
  assert.equal(parseTyphoonStatus({ active: true, level: null }).level, "land");
});

test("parseTyphoonStatus: 只保留已知欄位，過濾無效的 issuedAt，並保留 simulated 旗標", () => {
  const parsed = parseTyphoonStatus({
    active: true,
    level: "sea",
    name: "  海上警報 ",
    issuedAt: "2026-10-21T06:00:00.000Z",
    simulated: true,
    county: "臺北市",
  });
  assert.deepEqual(parsed, { active: true, level: "sea", name: "海上警報", issuedAt: "2026-10-21T06:00:00.000Z", simulated: true });
  assert.equal("issuedAt" in parseTyphoonStatus({ active: true, issuedAt: "nope" }), false);
});

test("shouldShowTyphoonBanner: 只有確定生效才顯示；未載入／失敗／無警報都不顯示（版面不留空）", () => {
  assert.equal(shouldShowTyphoonBanner(null), false);
  assert.equal(shouldShowTyphoonBanner(undefined), false);
  assert.equal(shouldShowTyphoonBanner({ active: false, level: null }), false);
  assert.equal(shouldShowTyphoonBanner({ active: true, level: null }), false);
  assert.equal(shouldShowTyphoonBanner({ active: true, level: "land" }), true);
  assert.equal(shouldShowTyphoonBanner({ active: true, level: "sea" }), true);
});

test("isTyphoonBannerExcludedPath: 後台頁面不顯示橫幅，其他頁面（含 /en 語系、新聞單篇）顯示", () => {
  assert.equal(isTyphoonBannerExcludedPath("/admin"), true);
  assert.equal(isTyphoonBannerExcludedPath("/admin/social-queue"), true);
  for (const p of ["/", "/news/123", "/tools/bmi", "/en", "/ja/tools/weather-alerts", "/administrators", null, undefined]) {
    assert.equal(isTyphoonBannerExcludedPath(p), false, String(p));
  }
});

// ---------------------------------------------------------------- 2. 端點 ---

test("快取標頭常數：正常 60 秒（含 s-maxage 與 stale-while-revalidate）、讀不到時短 TTL、模擬 no-store", () => {
  assert.equal(cacheControl.TYPHOON_STATUS_CACHE_NORMAL, "public, max-age=0, s-maxage=60, stale-while-revalidate=120");
  assert.match(cacheControl.TYPHOON_STATUS_CACHE_DB_UNAVAILABLE, /s-maxage=10\b/);
  assert.ok(!/stale-while-revalidate/.test(cacheControl.TYPHOON_STATUS_CACHE_DB_UNAVAILABLE));
  assert.equal(cacheControl.TYPHOON_STATUS_CACHE_SIMULATED, "no-store");
});

test("GET /api/typhoon-status：資料庫讀不到 → 200、active:false、短 TTL 標頭（真的呼叫 route）", async () => {
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
  delete process.env.TYPHOON_SIM_KEY;
  const warn = console.warn;
  console.warn = () => {};
  try {
    const { GET } = await import("../app/api/typhoon-status/route.ts");
    const { NextRequest } = await import("next/server.js");
    const response = await GET(new NextRequest("http://localhost/api/typhoon-status"));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { active: false, level: null });
    assert.equal(response.headers.get("cache-control"), cacheControl.TYPHOON_STATUS_CACHE_DB_UNAVAILABLE);

    // 沒有金鑰時，帶 ?sim=land 的請求也只會得到真實（這裡是讀不到）的結果。
    const forged = await GET(new NextRequest("http://localhost/api/typhoon-status?sim=land", { headers: { "x-typhoon-sim-key": "guess" } }));
    assert.deepEqual(await forged.json(), { active: false, level: null });
  } finally {
    console.warn = warn;
    for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key];
    Object.assign(process.env, previous);
  }
});

test("GET /api/typhoon-status：模擬只在伺服器設定金鑰且請求帶對金鑰時生效，並回 no-store", async () => {
  const previous = { ...process.env };
  Object.assign(process.env, {
    MYSQL_HOST: "127.0.0.1",
    MYSQL_PORT: "1",
    MYSQL_USER: "test-unreachable",
    MYSQL_PASSWORD: "test-unreachable",
    MYSQL_DATABASE: "test-unreachable",
    RSS_SYNC_ADMIN_SECRET: "test-unreachable",
    TYPHOON_SIM_KEY: "unit-test-sim-key",
  });
  const warn = console.warn;
  console.warn = () => {};
  try {
    const { GET } = await import("../app/api/typhoon-status/route.ts");
    const { NextRequest } = await import("next/server.js");
    const call = (query, key) =>
      GET(new NextRequest(`http://localhost/api/typhoon-status${query}`, { headers: key ? { "x-typhoon-sim-key": key } : {} }));

    const land = await call("?sim=land", "unit-test-sim-key");
    const landBody = await land.json();
    assert.equal(landBody.active, true);
    assert.equal(landBody.level, "land");
    assert.equal(landBody.simulated, true);
    assert.equal(land.headers.get("cache-control"), "no-store");

    const sea = await (await call("?sim=sea", "unit-test-sim-key")).json();
    assert.equal(sea.level, "sea");

    // 錯誤金鑰、沒有金鑰、sim 值不合法 → 全部當一般請求（這裡資料庫不可用 → active:false）。
    for (const [query, key] of [["?sim=land", "wrong-key"], ["?sim=land", null], ["?sim=purple", "unit-test-sim-key"], ["?sim=", "unit-test-sim-key"], ["", "unit-test-sim-key"]]) {
      const res = await call(query, key);
      const body = await res.json();
      assert.equal(body.active, false, `${query} / ${key}`);
      assert.notEqual(res.headers.get("cache-control"), "no-store");
    }
  } finally {
    console.warn = warn;
    for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key];
    Object.assign(process.env, previous);
  }
});

test("resolveSimulatedLevel: 伺服器未設定金鑰時，模擬功能不存在", () => {
  assert.equal(resolveSimulatedLevel("land", "anything", undefined), null);
  assert.equal(resolveSimulatedLevel("land", "anything", ""), null);
  assert.equal(resolveSimulatedLevel("land", "", ""), null);
  assert.equal(resolveSimulatedLevel("land", undefined, "k"), null);
  assert.equal(resolveSimulatedLevel("land", "k", "k"), "land");
  assert.equal(resolveSimulatedLevel("sea", "k", "k"), "sea");
  assert.equal(resolveSimulatedLevel("sea", "k2", "k"), null);
  assert.equal(resolveSimulatedLevel("LAND", "k", "k"), null);
  assert.equal(resolveSimulatedLevel(null, "k", "k"), null);
});

test("buildSimulatedStatus 帶 simulated:true 且名稱標明「模擬」", () => {
  const s = buildSimulatedStatus("sea", new Date("2026-10-21T00:00:00Z"));
  assert.equal(s.simulated, true);
  assert.match(s.name, /模擬/);
  assert.equal(s.issuedAt, "2026-10-21T00:00:00.000Z");
});

test("route 原始碼：顯式宣告 Cache-Control（上游對無標頭的 /api/* 會補 30 分鐘）、不輸出非 GET 的欄位", () => {
  const code = stripComments(read("app", "api", "typhoon-status", "route.ts"));
  assert.match(code, /"Cache-Control": cacheControl/);
  assert.match(code, /TYPHOON_STATUS_CACHE_NORMAL/);
  assert.match(code, /TYPHOON_STATUS_CACHE_DB_UNAVAILABLE/);
  assert.match(code, /export const dynamic = "force-dynamic"/);
  // Next 的 route 檔只能匯出 GET/runtime/dynamic 等，匯出其他常數會讓 build 失敗。
  const exports = [...code.matchAll(/^export\s+(?:async\s+)?(?:const|function)\s+(\w+)/gm)].map((m) => m[1]);
  assert.deepEqual(exports.sort(), ["GET", "dynamic", "runtime"]);
});

test("狀態查詢沿用既有的「生效中」規則（同一份 SQL 條件）並只讀 W-C0034-001", () => {
  const warning = stripComments(read("lib", "server", "officeCalendar", "typhoonWarning.ts"));
  const status = stripComments(read("lib", "server", "typhoon", "status.ts"));
  assert.match(warning, /export const TYPHOON_WARNING_IN_FORCE_SQL/);
  assert.match(warning, /WHERE \$\{TYPHOON_WARNING_IN_FORCE_SQL\}/, "既有的 isTyphoonWarningActive 也改用同一份條件");
  assert.match(status, /\$\{TYPHOON_WARNING_IN_FORCE_SQL\}/);
  assert.match(status, /TYPHOON_WARNING_DATASET_ID/);
  assert.ok(!/W-C0034-005/.test(status));
  assert.match(status, /return null;/);
});

// ----------------------------------- 4/5. 頁面 HTML 不依賴警報；瀏覽器端 store ---

const REACT = await import("react");
const { renderToString } = await import("react-dom/server");

const installFakeBrowser = ({ fetchImpl, search = "", session = {} } = {}) => {
  const store = { ...session };
  globalThis.window = {
    location: { search },
    sessionStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => {
        store[k] = String(v);
      },
      removeItem: (k) => {
        delete store[k];
      },
    },
  };
  globalThis.fetch = fetchImpl;
  return store;
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

test("SSR 輸出不依賴警報：即使 store 已載入「陸上警報生效中」，伺服器渲染仍是未知（null）", async () => {
  const typhoonStore = await import("../lib/client/typhoonStatusStore.ts");
  typhoonStore.__resetTyphoonStatusStoreForTests();
  installFakeBrowser({ fetchImpl: async () => jsonResponse({ active: true, level: "land", name: "陸上警報" }) });
  try {
    await typhoonStore.refreshTyphoonStatus(true);
    assert.deepEqual(typhoonStore.getTyphoonStatusSnapshot(), { active: true, level: "land", name: "陸上警報" });

    const Probe = () => {
      const status = typhoonStore.useTyphoonStatus();
      return REACT.createElement("span", { "data-status": String(status === null ? "unknown" : status.level) }, status === null ? "" : "ALERT");
    };
    const html = renderToString(REACT.createElement(Probe));
    assert.match(html, /data-status="unknown"/);
    assert.ok(!html.includes("ALERT"));

    // 沒有警報時的輸出與有警報時逐字相同 → 被快取的 HTML 與有無警報無關。
    typhoonStore.__resetTyphoonStatusStoreForTests();
    globalThis.fetch = async () => jsonResponse({ active: false, level: null });
    await typhoonStore.refreshTyphoonStatus(true);
    assert.equal(renderToString(REACT.createElement(Probe)), html);
  } finally {
    uninstallFakeBrowser();
    typhoonStore.__resetTyphoonStatusStoreForTests();
  }
});

test("store：同時多個元件只會發出一次請求；60 秒內不重抓", async () => {
  const typhoonStore = await import("../lib/client/typhoonStatusStore.ts");
  typhoonStore.__resetTyphoonStatusStoreForTests();
  let calls = 0;
  installFakeBrowser({
    fetchImpl: async () => {
      calls += 1;
      return jsonResponse({ active: true, level: "sea" });
    },
  });
  try {
    await Promise.all([typhoonStore.refreshTyphoonStatus(), typhoonStore.refreshTyphoonStatus(), typhoonStore.refreshTyphoonStatus()]);
    assert.equal(calls, 1);
    await typhoonStore.refreshTyphoonStatus();
    assert.equal(calls, 1, "60 秒內不重抓");
    await typhoonStore.refreshTyphoonStatus(true);
    assert.equal(calls, 2);
    assert.equal(typhoonStore.getTyphoonStatusSnapshot().level, "sea");
  } finally {
    uninstallFakeBrowser();
    typhoonStore.__resetTyphoonStatusStoreForTests();
  }
});

test("store：HTTP 錯誤、網路錯誤、壞 JSON、壞形狀 → 都不顯示橫幅，且已顯示的也會撤掉", async () => {
  const typhoonStore = await import("../lib/client/typhoonStatusStore.ts");
  const failures = [
    async () => jsonResponse({ active: true, level: "land" }, { ok: false, status: 503 }),
    async () => {
      throw new TypeError("network down");
    },
    async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError("bad json"); } }),
    async () => jsonResponse("<html>cloudflare challenge</html>"),
    async () => jsonResponse({ active: "yes" }),
  ];
  for (const failing of failures) {
    typhoonStore.__resetTyphoonStatusStoreForTests();
    installFakeBrowser({ fetchImpl: async () => jsonResponse({ active: true, level: "land" }) });
    try {
      await typhoonStore.refreshTyphoonStatus(true);
      assert.equal(typhoonStore.getTyphoonStatusSnapshot().active, true);
      globalThis.fetch = failing;
      await typhoonStore.refreshTyphoonStatus(true);
      assert.equal(shouldShowTyphoonBanner(typhoonStore.getTyphoonStatusSnapshot()), false);
    } finally {
      uninstallFakeBrowser();
    }
  }
  typhoonStore.__resetTyphoonStatusStoreForTests();
});

test("store：逾時（請求被 abort）→ 不顯示橫幅", async () => {
  const typhoonStore = await import("../lib/client/typhoonStatusStore.ts");
  typhoonStore.__resetTyphoonStatusStoreForTests();
  installFakeBrowser({
    fetchImpl: (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      }),
  });
  const realSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (fn, _ms, ...rest) => realSetTimeout(fn, 1, ...rest);
  try {
    await typhoonStore.refreshTyphoonStatus(true);
    assert.equal(shouldShowTyphoonBanner(typhoonStore.getTyphoonStatusSnapshot()), false);
  } finally {
    globalThis.setTimeout = realSetTimeout;
    uninstallFakeBrowser();
    typhoonStore.__resetTyphoonStatusStoreForTests();
  }
});

test("store 測試模擬：網址參數存進 sessionStorage，之後的請求帶 ?sim= 與金鑰標頭；off 清除", async () => {
  const typhoonStore = await import("../lib/client/typhoonStatusStore.ts");
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push({ url, key: init?.headers?.["x-typhoon-sim-key"] ?? null });
    return jsonResponse({ active: true, level: "sea", simulated: true });
  };

  typhoonStore.__resetTyphoonStatusStoreForTests();
  const session = installFakeBrowser({ fetchImpl, search: "?typhoon-sim=sea&typhoon-sim-key=abc123" });
  try {
    await typhoonStore.refreshTyphoonStatus(true);
    assert.deepEqual(seen[0], { url: "/api/typhoon-status?sim=sea", key: "abc123" });
    assert.equal(session.typhoonSim, "sea");

    // 換頁（網址不再帶參數）：仍沿用同一分頁的模擬設定。
    globalThis.window.location.search = "";
    await typhoonStore.refreshTyphoonStatus(true);
    assert.deepEqual(seen[1], { url: "/api/typhoon-status?sim=sea", key: "abc123" });

    // off：清除，之後是一般請求。
    globalThis.window.location.search = "?typhoon-sim=off";
    await typhoonStore.refreshTyphoonStatus(true);
    assert.deepEqual(seen[2], { url: "/api/typhoon-status", key: null });
    assert.equal(session.typhoonSim, undefined);
  } finally {
    uninstallFakeBrowser();
    typhoonStore.__resetTyphoonStatusStoreForTests();
  }

  // 只有 sim 沒有金鑰 → 不啟用。
  typhoonStore.__resetTyphoonStatusStoreForTests();
  seen.length = 0;
  installFakeBrowser({ fetchImpl, search: "?typhoon-sim=land" });
  try {
    await typhoonStore.refreshTyphoonStatus(true);
    assert.deepEqual(seen[0], { url: "/api/typhoon-status", key: null });
  } finally {
    uninstallFakeBrowser();
    typhoonStore.__resetTyphoonStatusStoreForTests();
  }
});

// ------------------------------------------------------- 原始碼契約（掛載與快取） ---

test("橫幅掛在 zh 與 /en /ja /ko 兩個根 layout，位於 SkipToContent 之後、主內容之前", () => {
  for (const file of [["app", "(zh)", "layout.tsx"], ["app", "[locale]", "layout.tsx"]]) {
    const source = read(...file);
    assert.match(source, /import TyphoonBanner from "@\/components\/Typhoon\/TyphoonBanner"/, file.join("/"));
    const skip = source.indexOf("<SkipToContent />");
    const banner = source.indexOf("<TyphoonBanner />");
    const main = source.indexOf('id="main-content"');
    assert.ok(skip !== -1 && banner > skip && banner < main, `${file.join("/")}: banner order`);
  }
});

test("被快取的頁面與 layout 不引用任何伺服器端警報來源（HTML 與警報無關）", () => {
  for (const file of [
    ["app", "(zh)", "layout.tsx"],
    ["app", "[locale]", "layout.tsx"],
    ["app", "(zh)", "(site)", "page.tsx"],
    ["app", "[locale]", "page.tsx"],
  ]) {
    const code = stripComments(read(...file));
    assert.ok(!/isTyphoonWarningActive|loadTyphoonStatus|typhoonWarning|lib\/server\/typhoon|cwa_alerts|buildTyphoonStatus/.test(code), file.join("/"));
  }
});

test("橫幅與卡片都是 client component，且只透過共用 store 取得狀態（不自己 fetch）", () => {
  for (const file of [["components", "Typhoon", "TyphoonBanner.tsx"], ["components", "Home", "HomeQuickEntryCards.tsx"]]) {
    const source = read(...file);
    assert.match(source, /^"use client";/, file.join("/"));
    assert.match(source, /useTyphoonStatus\(/);
    assert.ok(!/\bfetch\(/.test(stripComments(source)), `${file.join("/")} 不應自己 fetch`);
    assert.ok(!/from "@\/lib\/server\//.test(source), `${file.join("/")} 不應匯入伺服器端模組`);
  }
  const storeSource = read("lib", "client", "typhoonStatusStore.ts");
  assert.match(storeSource, /const getServerSnapshot = \(\): TyphoonStatus \| null => null;/);
});

test("首頁（zh 與多語）：兩張大卡片在 HomeStatusBar 之上", () => {
  for (const file of [["app", "(zh)", "(site)", "page.tsx"], ["app", "[locale]", "page.tsx"]]) {
    const source = read(...file);
    const cards = source.indexOf("<HomeQuickEntryCards />");
    const bar = source.indexOf("<HomeStatusBar />");
    assert.ok(cards !== -1 && bar !== -1 && cards < bar, file.join("/"));
  }
});

test("首頁卡片連結：颱風與警報 → /tools/weather-alerts；明天放假嗎 → /tools/work-school-status（多語路徑會加語系前綴）", () => {
  const source = read("components", "Home", "HomeQuickEntryCards.tsx");
  assert.match(source, /localize\("\/tools\/weather-alerts"\)/);
  assert.match(source, /localize\("\/tools\/work-school-status"\)/);
  assert.match(source, /buildLocalizedPath\(path, locale\)/);
  for (const dir of ["app/(zh)/tools/weather-alerts", "app/(zh)/tools/work-school-status", "app/[locale]/tools/weather-alerts", "app/[locale]/tools/work-school-status"]) {
    assert.ok(fs.existsSync(path.join(ROOT, dir, "page.tsx")), `${dir} 存在`);
  }
});

test("橫幅：三個連結、「以官方公告為準」、紅（陸上）／橙（海上）、文字也標示級別、不靠顏色單獨表達", () => {
  const source = read("components", "Typhoon", "TyphoonBanner.tsx");
  assert.match(source, /DGPA_CLOSURE_PAGE_URL/);
  assert.match(source, /Contact_Phone\.html|id === "contacts"/);
  assert.match(source, /\/tools\/weather-alerts/);
  assert.match(source, /請以官方公告為準/);
  assert.match(source, /bg-red-700/);
  assert.match(source, /bg-orange-400/);
  assert.match(source, /陸上警報/);
  assert.match(source, /海上警報/);
  assert.match(source, /role=\{isLand \? "alert" : "status"\}/);
  assert.match(source, /isTyphoonBannerExcludedPath\(pathname\)/);
});

test("官方連結常數指向 DGPA 公告頁與洽詢電話頁", async () => {
  const { DGPA_CLOSURE_PAGE_URL, CLOSURE_OFFICIAL_LINKS } = await import("../lib/tools/workSchoolStatus/closureGuidance.ts");
  assert.equal(DGPA_CLOSURE_PAGE_URL, "https://www.dgpa.gov.tw/typh/daily/nds.html");
  assert.ok(CLOSURE_OFFICIAL_LINKS.some((l) => l.id === "contacts" && l.url.includes("Contact_Phone")));
});

// ------------------------------------------------------------------- 文案 ---

const TYPHOON_KEYS = {
  banner: ["ariaLabel", "landTitle", "seaTitle", "landBadge", "seaBadge", "notice", "linkOfficial", "linkContacts", "linkTool", "issuedAtTemplate", "simulated"],
  cards: ["sectionAriaLabel", "alertsTitle", "alertsDesc", "alertsActiveDesc", "holidayTitle", "holidayDesc", "holidayActiveDesc", "cta"],
};

test("en／ja／ko 都有完整的橫幅與卡片文案，且 {time} 樣板保留", () => {
  for (const locale of ["en", "ja", "ko"]) {
    const dict = JSON.parse(read("locales", `${locale}.json`));
    for (const [group, keys] of Object.entries(TYPHOON_KEYS)) {
      for (const key of keys) {
        assert.equal(typeof dict.typhoon?.[group]?.[key], "string", `${locale}.typhoon.${group}.${key}`);
        assert.ok(dict.typhoon[group][key].length > 0);
      }
    }
    assert.match(dict.typhoon.banner.issuedAtTemplate, /\{time\}/);
  }
});

test("zh 預設文案：每個 t() 的 key 都在四種語言的結構裡，且全站不出現「某縣市放假／上班」的轉述", () => {
  const sources = [read("components", "Typhoon", "TyphoonBanner.tsx"), read("components", "Home", "HomeQuickEntryCards.tsx")];
  const keys = new Set(sources.flatMap((s) => [...s.matchAll(/t\(\s*"(typhoon\.[\w.]+)"/g)].map((m) => m[1])));
  assert.ok(keys.size >= 15);
  const en = JSON.parse(read("locales", "en.json"));
  for (const key of keys) {
    const value = key.split(".").reduce((acc, part) => acc?.[part], en);
    assert.equal(typeof value, "string", `en.${key}`);
  }
  const zhDefaults = sources.flatMap((s) => [...s.matchAll(/t\(\s*"typhoon\.[\w.]+"\s*,\s*"([^"]+)"/g)].map((m) => m[1]));
  assert.ok(zhDefaults.length >= 15);
  const allCopy = zhDefaults.join("\n") + ["en", "ja", "ko"].map((l) => JSON.stringify(JSON.parse(read("locales", `${l}.json`)).typhoon)).join("\n");
  // 不得出現「某縣市停止上班／放假／照常上班」這類自行轉述。
  assert.ok(!/(?:縣|市)[^"\n]{0,6}(?:停止上班|停止上課|照常上班|照常上課|放假)/.test(allCopy));
});

test("the client store revalidates instead of trusting a Cloudflare-inflated max-age", () => {
  const store = fs.readFileSync(new URL("../lib/client/typhoonStatusStore.ts", import.meta.url), "utf8");
  assert.match(store, /cache: "no-cache"/);
});

// ---------------------------------------------------------------- 7. 置中與颱風名稱 ---

test("pickTyphoonNames: 熱帶性低氣壓不列入、去重、最多三個、非字串略過", () => {
  assert.deepEqual(pickTyphoonNames(["輕度颱風 薔琵 (CHAMPI) 第29號"]), ["輕度颱風 薔琵 (CHAMPI) 第29號"]);
  assert.deepEqual(pickTyphoonNames(["熱帶性低氣壓 TD22", "強烈颱風 山竹 (Mangkhut) 第22號"]), ["強烈颱風 山竹 (Mangkhut) 第22號"]);
  assert.deepEqual(pickTyphoonNames(["中度颱風 A 第1號", "中度颱風 A 第1號"]), ["中度颱風 A 第1號"]);
  assert.equal(pickTyphoonNames(["a 1", "b 2", "c 3", "d 4", "e 5"]).length, 3);
  assert.deepEqual(pickTyphoonNames([null, 42, "", "   "]), []);
  assert.deepEqual(pickTyphoonNames(null), []);
  assert.deepEqual(pickTyphoonNames(undefined), []);
});

test("parseTyphoonStatus: names 只接受字串陣列，壞值被丟掉且不影響橫幅", () => {
  assert.deepEqual(parseTyphoonStatus({ active: true, level: "sea", names: ["輕度颱風 薔琵 (CHAMPI) 第29號"] }).names, ["輕度颱風 薔琵 (CHAMPI) 第29號"]);
  assert.equal(parseTyphoonStatus({ active: true, level: "sea", names: "oops" }).names, undefined);
  assert.equal(parseTyphoonStatus({ active: true, level: "sea", names: [1, null] }).names, undefined);
  assert.equal(parseTyphoonStatus({ active: false, names: ["x"] }).active, false);
});

test("模擬回應帶有明顯標示的假颱風名稱", () => {
  const sim = buildSimulatedStatus("land");
  assert.equal(sim.names.length, 1);
  assert.match(sim.names[0], /^（模擬）/);
});

test("伺服器端：警報生效時才查颱風動態取名稱，且用 pickTyphoonNames 過濾", () => {
  const src = stripComments(read("lib", "server", "typhoon", "status.ts"));
  assert.match(src, /if \(status\.active\) \{[\s\S]*?pickTyphoonNames\([\s\S]*?listActiveCwaTyphoons\(\)/);
});

test("橫幅三塊（標題列、說明、連結）都置中，名稱顯示在標題列", () => {
  const src = stripComments(read("components", "Typhoon", "TyphoonBanner.tsx"));
  assert.match(src, /flex max-w-5xl flex-col items-center gap-1\.5 text-center/);
  assert.match(src, /flex flex-wrap items-center justify-center gap-x-2 gap-y-1 font-bold/);
  assert.match(src, /<ul className="flex flex-wrap justify-center gap-x-4 gap-y-1/);
  assert.match(src, /status\.names\?\.length[\s\S]*?data-typhoon-names[\s\S]*?status\.names\.join\("、"\)/);
});
