import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Issue #709：辭典後備種子（data/child-native-languages-seed.json，約 30 MB）不得再被打包進 bundle，
// 也不得永久常駐記憶體；改用 lib/server/db/transientSeed.ts 的 readTransientSeedJson（TTL 2 分鐘）。
// 這份測試證明：
//   1. 原始碼層面：service.ts 只透過 readTransientSeedJson 取得種子、DB 優先
//      （「app／lib／components 不得靜態 import 大型 JSON」的全站防回歸在 tests/json-seed-on-demand-709.test.mjs）。
//   2. 行為不變：資料庫不可用時，代表性查詢的輸出與改動前逐筆相同
//      （a. 與改動前演算法的內聯參考實作比對；b. 與舊程式碼產生的黃金摘要比對；c. API route 的輸出）。
//   3. 常駐時間有上限：辭典的 TTL 是 2 分鐘、到期放掉引用、計時器不拖住行程、找不到檔案時降級成空結果。

const HELPER = new URL("./helpers/register-ts-alias-hooks.mjs", import.meta.url);
await import(HELPER.href);

const ROOT_URL = new URL("../", import.meta.url);
const ROOT_DIR = fileURLToPath(ROOT_URL);
process.chdir(ROOT_DIR); // readTransientSeedJson 以 process.cwd() 找 public/data/、data/
// 讓 searchNativeDict 走「資料庫不可用 → 後備種子」的路徑
delete process.env.DATABASE_URL;
delete process.env.MYSQL_HOST;

const SEED_FILE = "child-native-languages-seed.json";
const SEED_PATH = path.join(ROOT_DIR, "data", SEED_FILE);
const GOLDEN = JSON.parse(
  fs.readFileSync(new URL("./fixtures/dictionary-seed-golden-709.json", import.meta.url), "utf8"),
);

const { searchNativeDict, getNativeDictWord } = await import(
  new URL("lib/server/dictionary/service.ts", ROOT_URL).href
);
const { CHILD_TOPIC_CATEGORIES } = await import(new URL("lib/server/dictionary/types.ts", ROOT_URL).href);
const { clearTransientSeedCache, transientSeedCacheSize } = await import(
  new URL("lib/server/db/transientSeed.ts", ROOT_URL).href
);

const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

// ---------------------------------------------------------------------------
// 1. 原始碼層面
// ---------------------------------------------------------------------------

test("service.ts 只透過 readTransientSeedJson 取得種子（TTL 2 分鐘），且保有 DB 優先的流程", () => {
  const source = stripComments(fs.readFileSync(path.join(ROOT_DIR, "lib/server/dictionary/service.ts"), "utf8"));
  assert.match(source, /readTransientSeedJson\s*</);
  assert.match(source, /from "@\/lib\/server\/db\/transientSeed"/);
  assert.match(source, /ttlMs:\s*SEED_TTL_MS/);
  assert.match(source, /SEED_TTL_MS\s*=\s*2\s*\*\s*60\s*\*\s*1000/);
  assert.ok(source.indexOf("native_dict_entries") < source.lastIndexOf("loadSeedPool("), "DB 查詢要在後備種子之前");
  assert.equal(
    /(?:\bfrom|\bimport\s*\(|\brequire\s*\()\s*["'][^"']*\.json["']/.test(source),
    false,
    "service.ts 不應再匯入任何 .json",
  );
});

// ---------------------------------------------------------------------------
// 2. 行為不變
// ---------------------------------------------------------------------------

/** 改動前 searchNativeDict 後備段落的演算法，原樣照抄，僅把資料來源換成直接讀檔的種子。 */
function referenceSearch(seed, params) {
  const lang = params.lang || "twblg";
  const query = (params.q || "").trim().toLowerCase();
  const topicId = (params.topic || "").trim();
  const page = Math.max(1, Number(params.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(params.limit) || 20));

  const pool = seed.languages[lang]?.entries || [];
  let filtered = pool;
  if (topicId) {
    const topicConfig = CHILD_TOPIC_CATEGORIES.find((c) => c.id === topicId);
    if (topicConfig) {
      const keywords = topicConfig.keywords[lang] || [];
      filtered = filtered.filter((item) =>
        keywords.some(
          (kw) =>
            item.title.includes(kw) ||
            (item.mandarin_keywords && item.mandarin_keywords.includes(kw)),
        ),
      );
    }
  }
  if (query) {
    filtered = filtered.filter((item) => {
      const matchTitle = item.title.toLowerCase().includes(query);
      const matchPinyin = item.pinyin.toLowerCase().includes(query);
      const matchMandarin =
        item.mandarin_keywords && item.mandarin_keywords.toLowerCase().includes(query);
      return matchTitle || matchPinyin || matchMandarin;
    });
  }
  const total = filtered.length;
  const offset = (page - 1) * limit;
  return {
    items: filtered.slice(offset, offset + limit),
    total,
    page,
    pageSize: limit,
    totalPages: Math.ceil(total / limit),
    source: "seed",
  };
}

const digest = (items) => createHash("sha256").update(JSON.stringify(items)).digest("hex");

test(`DB 不可用時，後備種子的輸出與改動前演算法逐筆相同（${GOLDEN.cases.length} 組查詢：兩種語言＋預設語言、q／topic／dialect／分頁／邊界值）`, async () => {
  const seed = JSON.parse(fs.readFileSync(SEED_PATH, "utf8"));
  assert.ok(GOLDEN.cases.length >= 100, "黃金檔應包含足夠的查詢組合");
  let nonEmpty = 0;
  for (const { params } of GOLDEN.cases) {
    const actual = await searchNativeDict({ ...params });
    const expected = referenceSearch(seed, params);
    assert.deepEqual(actual, expected, `查詢 ${JSON.stringify(params)} 的結果與改動前不同`);
    if (actual.items.length > 0) nonEmpty += 1;
  }
  assert.ok(nonEmpty > 80, "大多數查詢應有結果，否則比對沒有意義");
});

test("與舊程式碼（靜態 import 版）產生的黃金摘要一致", async (t) => {
  const seed = JSON.parse(fs.readFileSync(SEED_PATH, "utf8"));
  const header = {
    generatedAt: seed.generatedAt,
    totalCount: seed.totalCount,
    twblgCount: seed.languages.twblg.entries.length,
    hakkaCount: seed.languages.hakka.entries.length,
  };
  if (JSON.stringify(header) !== JSON.stringify(GOLDEN.seed)) {
    // 種子被重新匯入（scripts/import-moedict-languages.mjs）後內容本來就會變，摘要不再適用；
    // 上一個測試的參考實作比對仍然有效。
    t.skip(`種子已更新（${JSON.stringify(header)}），黃金摘要只適用於 ${JSON.stringify(GOLDEN.seed)}`);
    return;
  }
  for (const c of GOLDEN.cases) {
    const r = await searchNativeDict({ ...c.params });
    const label = JSON.stringify(c.params);
    assert.equal(r.total, c.total, `${label} total`);
    assert.equal(r.page, c.page, `${label} page`);
    assert.equal(r.pageSize, c.pageSize, `${label} pageSize`);
    assert.equal(r.totalPages, c.totalPages, `${label} totalPages`);
    assert.equal(r.source, c.source, `${label} source`);
    assert.equal(r.items.length, c.itemCount, `${label} itemCount`);
    assert.equal(digest(r.items), c.itemsSha256, `${label} items`);
  }
});

test("getNativeDictWord 仍然優先回傳完全相符、否則回傳第一筆", async () => {
  const exact = await getNativeDictWord("twblg", "食飽");
  assert.ok(exact);
  assert.equal(exact.title, "食飽");
  const none = await getNativeDictWord("hakka", "zzzzqqqq不存在");
  assert.equal(none, null);
});

test("API route 的輸出（狀態碼、本文、Cache-Control）與改動前一致", async () => {
  const { GET } = await import(new URL("app/api/tools/child-native-languages/route.ts", ROOT_URL).href);
  const seed = JSON.parse(fs.readFileSync(SEED_PATH, "utf8"));

  const url = "http://localhost/api/tools/child-native-languages?lang=hakka&q=%E9%A3%9F&page=2&limit=5";
  const res = await GET(new Request(url));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "public, s-maxage=300, stale-while-revalidate=600");
  assert.deepEqual(await res.json(), {
    ok: true,
    ...referenceSearch(seed, { lang: "hakka", q: "食", page: 2, limit: 5 }),
  });

  // 非 hakka 的 lang 一律當 twblg；page／limit 不是數字時退回預設
  const res2 = await GET(new Request("http://localhost/api/tools/child-native-languages?lang=xx&page=abc&limit=zz"));
  assert.deepEqual(await res2.json(), { ok: true, ...referenceSearch(seed, { lang: "twblg", page: 1, limit: 20 }) });
});

// ---------------------------------------------------------------------------
// 3. 常駐時間有上限
// ---------------------------------------------------------------------------

function withTempCwd(files, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dict-seed-"));
  const previous = process.cwd();
  for (const [rel, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), content);
  }
  process.chdir(dir);
  const restore = () => {
    process.chdir(previous);
    fs.rmSync(dir, { recursive: true, force: true });
  };
  try {
    const result = fn(dir);
    if (result && typeof result.then === "function") return result.finally(restore);
    restore();
    return result;
  } catch (error) {
    restore();
    throw error;
  }
}

const TINY_SEED = JSON.stringify({
  languages: {
    twblg: { count: 0, entries: [] },
    hakka: { count: 1, entries: [{ id: "h1", lang: "hakka", title: "食飯", pinyin: "siid fan", definitions: [] }] },
  },
});

test("辭典種子的 TTL 是 2 分鐘：期內共用、到期放掉參照、再用才重新載入", async (t) => {
  clearTransientSeedCache();
  await withTempCwd({ [`data/${SEED_FILE}`]: TINY_SEED }, async () => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const reads = t.mock.method(fs, "readFileSync");
    // 先找 public/data（ENOENT，不算）再找 data/：只數成功讀到檔案的次數
    const seedReads = () =>
      reads.mock.calls.filter((c) => String(c.arguments[0]).endsWith(SEED_FILE) && c.error === undefined).length;
    const TWO_MINUTES = 2 * 60 * 1000;

    assert.equal(transientSeedCacheSize(), 0);
    const first = await searchNativeDict({ lang: "hakka", q: "食" });
    assert.equal(first.total, 1);
    assert.equal(transientSeedCacheSize(), 1, "第一次需要時才載入");
    await searchNativeDict({ lang: "hakka", q: "食" });
    assert.equal(seedReads(), 1, "TTL 內只讀檔一次");

    t.mock.timers.tick(TWO_MINUTES - 1);
    assert.equal(transientSeedCacheSize(), 1, "還沒到 2 分鐘");
    t.mock.timers.tick(1);
    assert.equal(transientSeedCacheSize(), 0, "滿 2 分鐘就放掉參照，交給 GC");

    const again = await searchNativeDict({ lang: "hakka", q: "食" });
    assert.equal(again.total, 1);
    assert.equal(seedReads(), 2, "到期後再用才重新讀檔");
    assert.equal(transientSeedCacheSize(), 1);
  });
  clearTransientSeedCache();
});

test("種子檔不存在時：回傳空結果並由 helper 警告（不丟例外），補上檔案後立即可用", async (t) => {
  clearTransientSeedCache();
  await withTempCwd({}, async (dir) => {
    const warn = t.mock.method(console, "warn", () => {});
    const empty = await searchNativeDict({ lang: "hakka", q: "食" });
    assert.deepEqual(empty, { items: [], total: 0, page: 1, pageSize: 20, totalPages: 0, source: "seed" });
    assert.equal(warn.mock.calls.length, 1);
    assert.match(String(warn.mock.calls[0].arguments[0]), /\[seed\] 找不到種子檔 child-native-languages-seed\.json/);
    assert.equal(transientSeedCacheSize(), 0, "失敗不留快取項目");

    fs.mkdirSync(path.join(dir, "data"), { recursive: true });
    fs.writeFileSync(path.join(dir, "data", SEED_FILE), TINY_SEED);
    const found = await searchNativeDict({ lang: "hakka", q: "食" });
    assert.equal(found.total, 1);
    assert.equal(found.items[0].title, "食飯");
  });
  clearTransientSeedCache();
});

const runChild = (code, cwd) =>
  spawnSync(process.execPath, ["--import", HELPER.href, "--input-type=module", "-e", code], {
    cwd,
    encoding: "utf8",
    timeout: 60_000,
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP, TMP: process.env.TMP },
  });

test("計時器已 unref：載入種子後行程可立刻正常結束，不必等 2 分鐘 TTL（子行程）", () => {
  const code = `
    const { searchNativeDict } = await import(${JSON.stringify(new URL("lib/server/dictionary/service.ts", ROOT_URL).href)});
    const r = await searchNativeDict({ lang: "twblg", q: "食", limit: 3 });
    console.log(JSON.stringify({ total: r.total, source: r.source }));
  `;
  const started = Date.now();
  const child = runChild(code, ROOT_DIR);
  assert.equal(child.status, 0, child.stderr);
  assert.ok(Date.now() - started < 30_000, "若計時器沒有 unref，行程會被拖住整整 2 分鐘");
  const out = JSON.parse(child.stdout.trim().split("\n").pop());
  assert.equal(out.source, "seed");
  assert.ok(out.total > 0);
});
