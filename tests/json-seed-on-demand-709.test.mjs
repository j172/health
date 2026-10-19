import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

// #709：被靜態 import 進 server chunk 的大型 JSON 種子，改成請求時才讀檔、短暫停留後釋放。
// 這個檔案驗證三件事：
//   1. 原始碼層級：server 程式碼不得再靜態 import 超過 100 KB 的 JSON（防回歸）。
//   2. 各路由／函式在「資料庫不可用」時的輸出，與改動前的邏輯逐筆相同
//      （改動前的行為以黃金輸出核對過：用舊程式碼對 57 組請求產生輸出，新程式碼逐位元組相同；
//       做法與重跑指令見 scripts/ops/memory-attribution/seed-route-golden.mjs）。
//      這裡的種子取自 repo 真實資料的抽樣，所以不會因為資料更新而壞掉。
//   3. 種子檔不存在時的降級行為與日誌（部署缺檔的情境）。

const REPO_ROOT_PATH = fileURLToPath(new URL("../", import.meta.url));
const ROOT = pathToFileURL(REPO_ROOT_PATH);
const ORIGINAL_CWD = process.cwd();

Object.assign(process.env, {
  MYSQL_HOST: "127.0.0.1",
  MYSQL_PORT: "1", // 沒有任何服務在聽 → 立刻 ECONNREFUSED，等同「資料庫不可用」
  MYSQL_USER: "placeholder",
  MYSQL_PASSWORD: "placeholder",
  MYSQL_DATABASE: "placeholder",
  MYSQL_SSL: "false",
  RSS_SYNC_SECRET: "placeholder",
  RSS_SYNC_ADMIN_SECRET: "placeholder",
});

const EXTENSIONS = [".ts", ".tsx", ".js", ".mjs"];
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") return { url: "data:text/javascript,", shortCircuit: true };
    if (context.parentURL && context.parentURL.includes("/node_modules/")) return nextResolve(specifier, context);
    if (/^next\/[\w/-]+$/.test(specifier)) {
      const file = path.join(REPO_ROOT_PATH, "node_modules", `${specifier}.js`);
      if (fs.existsSync(file)) return nextResolve(pathToFileURL(file).href, context);
    }
    let base = null;
    if (specifier.startsWith("@/")) base = new URL(specifier.slice(2), ROOT);
    else if (specifier.startsWith(".") && context.parentURL) base = new URL(specifier, context.parentURL);
    if (base) {
      if (base.pathname.endsWith(".json")) {
        return { url: base.href, format: "json", importAttributes: { type: "json" }, shortCircuit: true };
      }
      const basePath = fileURLToPath(base);
      if (fs.existsSync(basePath) && fs.statSync(basePath).isFile()) return nextResolve(base.href, context);
      for (const extension of EXTENSIONS) {
        if (fs.existsSync(basePath + extension)) return nextResolve(pathToFileURL(basePath + extension).href, context);
      }
      for (const extension of EXTENSIONS) {
        const index = path.join(basePath, `index${extension}`);
        if (fs.existsSync(index)) return nextResolve(pathToFileURL(index).href, context);
      }
    }
    return nextResolve(specifier, context);
  },
});

const nextServer = await import(pathToFileURL(path.join(REPO_ROOT_PATH, "node_modules", "next", "server.js")).href);
const NextRequest = nextServer.NextRequest ?? nextServer.default.NextRequest;
const load = (relative) => import(pathToFileURL(path.join(REPO_ROOT_PATH, relative)).href);
const { clearTransientSeedCache } = await load("lib/server/db/transientSeed.ts");
const { normalizeCountyName } = await load("lib/constants/taiwanDistricts.ts");

const routes = {
  breastfeeding: await load("app/api/breastfeeding-rooms/route.ts"),
  contraception: await load("app/api/contraception-map/route.ts"),
  heritage: await load("app/api/heritage-map/route.ts"),
  books: await load("app/api/books/route.ts"),
  pets: await load("app/api/pet-adoptions/route.ts"),
  facilities: await load("app/api/facilities/route.ts"),
  cpcStations: await load("app/api/cpc-stations/route.ts"),
  cultureShows: await load("app/api/culture/shows/route.ts"),
  culturePublicArt: await load("app/api/culture/public-art/route.ts"),
};
const { filterAndSortBooks } = await load("lib/server/books/service.ts");

after(async () => {
  // 讓 mysql2 連線池不要拖住測試行程
  try {
    const { getMysqlPool } = await load("lib/server/db/mysql.ts");
    await getMysqlPool().end();
  } catch {
    // ignore
  }
});

// ---------------------------------------------------------------------------
// 共用工具
// ---------------------------------------------------------------------------

const readReal = (relative) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT_PATH, relative), "utf-8"));
const sample = (array, count) => {
  const step = Math.max(1, Math.floor(array.length / count));
  return array.filter((_, index) => index % step === 0).slice(0, count);
};

function writeJson(root, relative, value) {
  const full = path.join(root, relative);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, JSON.stringify(value), "utf-8");
}

/** 由真實資料抽樣建立的 fixture：形狀與真實檔一致，內容不隨資料更新而變。 */
function buildFixtures() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "seed-709-"));
  const bf = readReal("data/breastfeeding-rooms-seed.json");
  const fx = {
    breastfeeding: { ...bf, points: sample(bf.points, 80) },
    contraception: (() => {
      const real = readReal("data/contraception-map-seed.json");
      return { ...real, points: sample(real.points, 80) };
    })(),
    heritage: (() => {
      const real = readReal("data/heritage-map-seed.json");
      return { ...real, points: sample(real.points, 40) };
    })(),
    books: (() => {
      const real = readReal("data/latest-books-seed.json");
      return { ...real, books: sample(real.books, 60) };
    })(),
    pets: sample(readReal("data/pet-adoptions-seed.json"), 50),
    aed: sample(readReal("data/facilities-seeds/aed.json"), 30),
    vet: (() => {
      const real = readReal("data/facilities-seeds/vet_clinic.json");
      return { ...real, records: sample(real.records, 30) };
    })(),
    tourism: sample(readReal("data/facilities-seeds/tourism_factory.json"), 20),
    bookstore: sample(readReal("data/facilities-seeds/bookstore.json"), 25),
    cpc: sample(readReal("data/facilities-seeds/cpc_gas_station.json"), 40),
    events: (() => {
      const real = readReal("data/cultural-events-seed.json");
      return { ...real, events: sample(real.events, 40) };
    })(),
    publicArt: sample(readReal("data/public-art.json"), 50),
  };
  writeJson(root, "data/breastfeeding-rooms-seed.json", fx.breastfeeding);
  writeJson(root, "data/contraception-map-seed.json", fx.contraception);
  writeJson(root, "data/heritage-map-seed.json", fx.heritage);
  writeJson(root, "data/latest-books-seed.json", fx.books);
  writeJson(root, "data/pet-adoptions-seed.json", fx.pets);
  writeJson(root, "data/facilities-seeds/aed.json", fx.aed);
  writeJson(root, "data/facilities-seeds/vet_clinic.json", fx.vet);
  writeJson(root, "data/facilities-seeds/tourism_factory.json", fx.tourism);
  writeJson(root, "data/facilities-seeds/bookstore.json", fx.bookstore);
  writeJson(root, "data/facilities-seeds/cpc_gas_station.json", fx.cpc);
  writeJson(root, "data/cultural-events-seed.json", fx.events);
  writeJson(root, "data/public-art.json", fx.publicArt);
  return { root, fx };
}

/** 在指定 cwd 執行、靜音 console 並收集 warn／error 日誌。 */
async function withCwd(root, fn) {
  const logs = { warn: [], error: [] };
  const original = { warn: console.warn, error: console.error, log: console.log };
  console.warn = (...args) => logs.warn.push(args.map(String).join(" "));
  console.error = (...args) => logs.error.push(args.map(String).join(" "));
  console.log = () => {};
  clearTransientSeedCache();
  process.chdir(root);
  try {
    return await fn(logs);
  } finally {
    process.chdir(ORIGINAL_CWD);
    console.warn = original.warn;
    console.error = original.error;
    console.log = original.log;
    clearTransientSeedCache();
  }
}

async function get(route, url, { noArg = false } = {}) {
  const response = noArg ? await route.GET() : await route.GET(new NextRequest(`http://localhost${url}`));
  const text = await response.text();
  return {
    status: response.status,
    cacheControl: response.headers.get("cache-control"),
    text,
    json: JSON.parse(text),
  };
}

const EMPTY_ROOT = () => fs.mkdtempSync(path.join(os.tmpdir(), "seed-709-empty-"));

// ---------------------------------------------------------------------------
// 1. 防回歸：server 程式碼不得再靜態 import 大型 JSON
// ---------------------------------------------------------------------------

test("app/、lib/、components/ 不再靜態 import 超過 100 KB 的 JSON（除已知例外）", () => {
  // 例外只允許一項，且要有理由：
  //  - lib/server/news/data/cedict-terms.json：以 import() 惰性載入，只有每 10 分鐘的
  //    news-card-images 排程與管理 API 會用到；評估結果見 PR 說明。
  // （辭典種子 data/child-native-languages-seed.json 已改用 readTransientSeedJson，
  //   不再是例外；見 tests/dictionary-seed-on-demand-709.test.mjs。）
  const ALLOWED = new Set(["lib/server/news/data/cedict-terms.json"]);
  const LIMIT = 100 * 1024;
  const offenders = [];

  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (/\.(ts|tsx)$/.test(entry.name)) {
        // 先去掉註解，避免說明文字裡寫到 `import ... from "x.json"` 被誤判
        const source = fs
          .readFileSync(full, "utf-8")
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .replace(/(^|[^:])\/\/.*$/gm, "$1");
        const pattern = /(?:from\s+|import\s*\(\s*|require\s*\(\s*)["']([^"']+\.json)["']/g;
        let match;
        while ((match = pattern.exec(source))) {
          const specifier = match[1];
          const target = specifier.startsWith("@/")
            ? path.join(REPO_ROOT_PATH, specifier.slice(2))
            : path.resolve(path.dirname(full), specifier);
          if (!fs.existsSync(target)) continue;
          const relative = path.relative(REPO_ROOT_PATH, target).replace(/\\/g, "/");
          if (fs.statSync(target).size > LIMIT && !ALLOWED.has(relative)) {
            offenders.push(`${path.relative(REPO_ROOT_PATH, full).replace(/\\/g, "/")} → ${relative}`);
          }
        }
      }
    }
  };
  for (const dir of ["app", "lib", "components"]) walk(path.join(REPO_ROOT_PATH, dir));

  assert.deepEqual(
    offenders,
    [],
    "這些 JSON 會被打包進 server chunk 並在開機時永久常駐，請改用 readTransientSeedJson（lib/server/db/transientSeed.ts）",
  );
});

// ---------------------------------------------------------------------------
// 2. 有種子檔時：輸出與改動前的邏輯相同
// ---------------------------------------------------------------------------

test("/api/breastfeeding-rooms：輸出與改動前的過濾邏輯相同（fixture）", async () => {
  const { root, fx } = buildFixtures();
  await withCwd(root, async () => {
    const reference = (params) => {
      let points = fx.breastfeeding.points || [];
      if (params.county) {
        const normalized = normalizeCountyName(params.county);
        points = points.filter((p) => normalizeCountyName(p.county) === normalized);
      }
      if (params.keyword) {
        const keyword = params.keyword.toLowerCase();
        points = points.filter(
          (p) =>
            (p.name && p.name.toLowerCase().includes(keyword)) ||
            (p.address && p.address.toLowerCase().includes(keyword)),
        );
      }
      return { ok: true, total: points.length, updatedAt: fx.breastfeeding.updatedAt || null, points };
    };

    const countyOfFirst = fx.breastfeeding.points[0].county;
    const cases = [
      ["", {}],
      [`?county=${encodeURIComponent(countyOfFirst)}`, { county: countyOfFirst }],
      ["?county=%E5%8F%B0%E5%8C%97%E5%B8%82", { county: "台北市" }],
      [`?keyword=${encodeURIComponent("衛生所")}`, { keyword: "衛生所" }],
      ["?keyword=zzzz_no_such", { keyword: "zzzz_no_such" }],
    ];
    for (const [query, params] of cases) {
      const result = await get(routes.breastfeeding, `/api/breastfeeding-rooms${query}`);
      assert.equal(result.status, 200, query);
      assert.equal(result.cacheControl, "public, s-maxage=600, stale-while-revalidate=1800", query);
      assert.deepEqual(result.json, reference(params), query);
    }
  });
});

test("/api/breastfeeding-rooms 與 /api/contraception-map：用 repo 真實資料也與參考邏輯一致", async () => {
  // cwd 設為 repo 根目錄，讀的是真正會被部署的 data/ 檔案（不是 fixture）
  await withCwd(REPO_ROOT_PATH, async () => {
    const bf = readReal("data/breastfeeding-rooms-seed.json");
    const all = await get(routes.breastfeeding, "/api/breastfeeding-rooms");
    assert.equal(all.status, 200);
    assert.equal(all.json.total, bf.points.length);
    assert.deepEqual(all.json.points, bf.points);
    assert.equal(all.json.updatedAt, bf.updatedAt || null);

    const cm = readReal("data/contraception-map-seed.json");
    const cmAll = await get(routes.contraception, "/api/contraception-map");
    assert.equal(cmAll.status, 200);
    assert.equal(cmAll.json.total, cm.points.length);
    assert.deepEqual(cmAll.json.points, cm.points);
    assert.equal(cmAll.json.clinicsCount, cm.clinicsCount || 88);
    assert.equal(cmAll.json.pharmaciesCount, cm.pharmaciesCount || 798);
  });
});

test("/api/contraception-map：輸出與改動前的過濾邏輯相同（fixture）", async () => {
  const { root, fx } = buildFixtures();
  await withCwd(root, async () => {
    const reference = (params) => {
      let points = fx.contraception.points || [];
      if (params.category && params.category !== "all") points = points.filter((p) => p.category === params.category);
      if (params.city && params.city !== "全部縣市") {
        points = points.filter((p) => p.city === params.city || (p.address && p.address.includes(params.city)));
      }
      if (params.keyword) {
        const keyword = params.keyword.toLowerCase();
        points = points.filter(
          (p) =>
            (p.name && p.name.toLowerCase().includes(keyword)) ||
            (p.address && p.address.toLowerCase().includes(keyword)) ||
            (p.categoryLabel && p.categoryLabel.toLowerCase().includes(keyword)),
        );
      }
      return {
        ok: true,
        total: points.length,
        clinicsCount: fx.contraception.clinicsCount || 88,
        pharmaciesCount: fx.contraception.pharmaciesCount || 798,
        updatedAt: fx.contraception.updatedAt || null,
        points,
      };
    };
    const cityOfFirst = fx.contraception.points[0].city;
    const cases = [
      ["", {}],
      ["?category=clinic", { category: "clinic" }],
      [`?category=pharmacy&city=${encodeURIComponent(cityOfFirst)}`, { category: "pharmacy", city: cityOfFirst }],
      ["?category=all&city=%E5%85%A8%E9%83%A8%E7%B8%A3%E5%B8%82", { category: "all", city: "全部縣市" }],
      [`?keyword=${encodeURIComponent("藥局")}`, { keyword: "藥局" }],
    ];
    for (const [query, params] of cases) {
      const result = await get(routes.contraception, `/api/contraception-map${query}`);
      assert.equal(result.status, 200, query);
      assert.equal(result.cacheControl, "public, s-maxage=600, stale-while-revalidate=1800", query);
      assert.deepEqual(result.json, reference(params), query);
    }
  });
});

test("/api/heritage-map：資料庫不可用時回傳種子本體（與改動前相同）；種子沒有點位時等同無種子", async () => {
  const { root, fx } = buildFixtures();
  await withCwd(root, async () => {
    const result = await get(routes.heritage, "/api/heritage-map", { noArg: true });
    assert.equal(result.status, 200);
    assert.deepEqual(result.json, fx.heritage);
  });

  // 種子存在但 points 為空：改動前會落到 `{ ok: true, ...data }`（data = 空點位）
  const emptyPoints = fs.mkdtempSync(path.join(os.tmpdir(), "seed-709-hm-"));
  writeJson(emptyPoints, "data/heritage-map-seed.json", { ok: true, points: [], updatedAt: "x" });
  await withCwd(emptyPoints, async () => {
    const result = await get(routes.heritage, "/api/heritage-map", { noArg: true });
    assert.equal(result.status, 200);
    assert.deepEqual(result.json, { ok: true, points: [], updatedAt: null });
  });
});

test("/api/books：資料庫不可用時走離線種子，結果與 filterAndSortBooks 一致且 source=offline_seed", async () => {
  const { root, fx } = buildFixtures();
  await withCwd(root, async () => {
    const cases = [
      ["", { page: 1, limit: 24 }],
      ["?sortBy=ranking&limit=5", { sortBy: "ranking", page: 1, limit: 5 }],
      ["?page=2&limit=10", { page: 2, limit: 10 }],
      [`?q=${encodeURIComponent(fx.books.books[3].title.slice(0, 2))}`, { search: fx.books.books[3].title.slice(0, 2), page: 1, limit: 24 }],
    ];
    for (const [query, params] of cases) {
      const result = await get(routes.books, `/api/books${query}`);
      assert.equal(result.status, 200, query);
      assert.equal(result.cacheControl, "public, s-maxage=300, stale-while-revalidate=600", query);
      assert.equal(result.json.source, "offline_seed", query);
      assert.deepEqual(result.json, JSON.parse(JSON.stringify(filterAndSortBooks(fx.books.books, params))), query);
    }
  });
});

test("/api/pet-adoptions：資料庫不可用時走離線種子，過濾與分頁與改動前相同", async () => {
  const { root, fx } = buildFixtures();
  await withCwd(root, async () => {
    const all = await get(routes.pets, "/api/pet-adoptions?limit=60");
    assert.equal(all.status, 200);
    assert.equal(all.cacheControl, "public, s-maxage=300, stale-while-revalidate=600");
    assert.equal(all.json.totalAll, fx.pets.length);
    assert.equal(all.json.total, fx.pets.length);
    assert.deepEqual(all.json.items, fx.pets);

    const kind = fx.pets[0].animal_kind;
    const byKind = await get(routes.pets, `/api/pet-adoptions?kind=${encodeURIComponent(kind)}&limit=5&page=1`);
    const expected = fx.pets.filter((x) => x.animal_kind === kind);
    assert.equal(byKind.json.total, expected.length);
    assert.deepEqual(byKind.json.items, expected.slice(0, 5));
    assert.equal(byKind.json.totalAll, fx.pets.length);
  });
});

test("/api/facilities：各內建種子類型在資料庫不可用時的後備輸出與改動前相同", async () => {
  const { root, fx } = buildFixtures();
  await withCwd(root, async () => {
    const cache = "public, s-maxage=60, stale-while-revalidate=300";

    // 以原樣陣列為來源的類型：沒有任何過濾時，輸出就是種子的淺拷貝，順序不變
    for (const [type, seed] of [
      ["aed", fx.aed],
      ["tourism_factory", fx.tourism],
      ["bookstore", fx.bookstore],
      ["cpc_gas_station", fx.cpc],
    ]) {
      const result = await get(routes.facilities, `/api/facilities?type=${type}&limit=500`);
      assert.equal(result.status, 200, type);
      assert.equal(result.cacheControl, cache, type);
      assert.equal(result.json.total, seed.length, type);
      assert.equal(result.json.allTotal, seed.length, type);
      assert.deepEqual(result.json.facilities, seed, type);
    }

    // vet_clinic：records 經過欄位對應（id 從 1 起算）
    const vet = await get(routes.facilities, "/api/facilities?type=vet_clinic&limit=500");
    assert.equal(vet.status, 200);
    assert.equal(vet.json.allTotal, fx.vet.records.length);
    const r0 = fx.vet.records[0];
    assert.deepEqual(vet.json.facilities[0], {
      id: 1,
      name: r0.name,
      address: r0.address || null,
      phone: r0.phone || null,
      lat: r0.lat ? Number(r0.lat) : null,
      lng: r0.lng ? Number(r0.lng) : null,
      service_item: r0.serviceItem || null,
      service_time: r0.serviceTime || null,
      extra_json: r0.extra || null,
    });

    // 關鍵字過濾（含「臺→台」正規化）
    const keyword = fx.bookstore[0].name.slice(0, 2);
    const kw = await get(routes.facilities, `/api/facilities?type=bookstore&keyword=${encodeURIComponent(keyword)}&limit=500`);
    const expectedKw = fx.bookstore.filter((item) => {
      const norm = (s) => (s || "").toLowerCase().replace(/臺/g, "台");
      const k = keyword.toLowerCase().replace(/臺/g, "台");
      return norm(item.name).includes(k) || norm(item.address).includes(k) || norm(item.service_item).includes(k);
    });
    assert.equal(kw.json.total, expectedKw.length);
    assert.deepEqual(kw.json.facilities, expectedKw);

    // 避孕諮詢：來源是 contraception-map-seed.json，且「在查資料庫之前」就直接回傳
    for (const [type, category, label] of [
      ["clinic", "clinic", "避孕諮詢診所"],
      ["pharmacy", "pharmacy", "避孕諮詢藥局"],
    ]) {
      const result = await get(routes.facilities, `/api/facilities?type=${type}&category=${encodeURIComponent("避孕諮詢")}&limit=500`);
      const expectedPoints = fx.contraception.points.filter((p) => p.category === category);
      assert.equal(result.status, 200, type);
      assert.equal(result.json.total, expectedPoints.length, type);
      assert.deepEqual(
        result.json.facilities.map((f) => [f.id, f.name, f.service_item, f.extra_json]),
        expectedPoints.map((p) => [p.id, p.name, label, { beokCertified: true, source: p.source }]),
        type,
      );
    }

    // 通用後備：沒有內建種子的類型（這裡用 aed 的複本檔名模擬 data/facilities-seeds/<type>.json）
    writeJson(root, "data/facilities-seeds/green_shop.json", [
      { id: 7, name: "綠色商店甲", address: "臺北市中正區", service_item: "綠色" },
      { name: "綠色商店乙", address: "新北市板橋區" },
    ]);
    const generic = await get(routes.facilities, "/api/facilities?type=green_shop&limit=10");
    assert.equal(generic.status, 200);
    assert.deepEqual(generic.json.facilities.map((f) => [f.id, f.name]), [[7, "綠色商店甲"], [2, "綠色商店乙"]]);

    // 完全不存在的類型：502（與改動前相同）
    const unknown = await get(routes.facilities, "/api/facilities?type=no_such_type");
    assert.equal(unknown.status, 502);
    assert.deepEqual(unknown.json, { error: "查詢機構資料失敗" });
  });
});

test("/api/cpc-stations：資料庫不可用時走種子；allServices 是種子所有服務項目的排序去重", async () => {
  const { root, fx } = buildFixtures();
  // 每個測試用獨立的模組實例，避免「服務項目清單永久記住」跨測試殘留
  const { searchCpcStations } = await import(`${pathToFileURL(path.join(REPO_ROOT_PATH, "lib/server/cpc/stations.ts")).href}?fixture=1`);
  await withCwd(root, async () => {
    const expectedServices = [...new Set(fx.cpc.flatMap((s) => s.extra_json?.services || []))].sort();

    const all = await searchCpcStations({ limit: 600 });
    assert.equal(all.total, fx.cpc.length);
    assert.deepEqual(all.stations, fx.cpc);
    assert.deepEqual(all.allServices, expectedServices);

    const wanted = expectedServices.slice(0, 2);
    const filtered = await searchCpcStations({ services: wanted, limit: 600 });
    const expected = fx.cpc.filter((s) => wanted.every((w) => (s.extra_json?.services || []).includes(w)));
    assert.equal(filtered.total, expected.length);
    assert.deepEqual(filtered.stations, expected);

    // 路由層：快取標頭與改動前相同
    const response = await get(routes.cpcStations, "/api/cpc-stations?limit=5");
    assert.equal(response.status, 200);
    assert.equal(response.cacheControl, "public, s-maxage=600, stale-while-revalidate=1800");
    assert.equal(response.json.stations.length, 5);
    assert.deepEqual(response.json.allServices, expectedServices);
  });
});

test("藝文活動／公共藝術：資料庫不可用時走種子，輸出形狀與改動前相同", async () => {
  const { root, fx } = buildFixtures();
  await withCwd(root, async () => {
    const shows = await get(routes.cultureShows, "/api/culture/shows?limit=300");
    assert.equal(shows.status, 200);
    assert.equal(shows.json.ok, true);
    assert.equal(shows.json.totalMatched, fx.events.events.length);
    assert.equal(shows.json.count, fx.events.events.length);
    assert.deepEqual(shows.json.items, fx.events.events);
    assert.equal(shows.json.updatedAt, fx.events.updatedAt);

    const firstTitle = fx.events.events[0].title;
    const byKeyword = await get(routes.cultureShows, `/api/culture/shows?keyword=${encodeURIComponent(firstTitle.slice(0, 4))}`);
    const kw = firstTitle.slice(0, 4).toLowerCase();
    const expected = fx.events.events.filter(
      (e) =>
        e.title.toLowerCase().includes(kw) ||
        (e.description && e.description.toLowerCase().includes(kw)) ||
        (e.masterUnit && e.masterUnit.toLowerCase().includes(kw)) ||
        (e.shows && e.shows.some((s) => s.location.toLowerCase().includes(kw) || s.locationName.toLowerCase().includes(kw))),
    );
    assert.equal(byKeyword.json.totalMatched, expected.length);

    const art = await get(routes.culturePublicArt, "/api/culture/public-art?limit=500");
    assert.equal(art.status, 200);
    assert.equal(art.cacheControl, "no-store, no-cache, must-revalidate, proxy-revalidate");
    assert.equal(art.json.totalMatched, fx.publicArt.length);
    assert.equal(art.json.items.length, fx.publicArt.length);
    assert.equal(art.json.items[0].artNo, String(fx.publicArt[0].artNo || fx.publicArt[0].id));
    assert.equal(art.json.items[0].title, fx.publicArt[0].title);
  });
});

// ---------------------------------------------------------------------------
// 3. 種子檔不存在：降級行為與日誌
// ---------------------------------------------------------------------------

test("種子檔不存在：沒有其他資料來源的路由回 503 且 no-store，並留下找不到檔的日誌", async () => {
  await withCwd(EMPTY_ROOT(), async (logs) => {
    const bf = await get(routes.breastfeeding, "/api/breastfeeding-rooms");
    assert.equal(bf.status, 503);
    assert.equal(bf.cacheControl, "no-store");
    assert.equal(bf.json.ok, false);

    const cm = await get(routes.contraception, "/api/contraception-map");
    assert.equal(cm.status, 503);
    assert.equal(cm.cacheControl, "no-store");
    assert.equal(cm.json.ok, false);

    const warned = logs.warn.filter((line) => line.includes("[seed] 找不到種子檔"));
    assert.ok(warned.some((line) => line.includes("breastfeeding-rooms-seed.json")), "應記錄哺乳室種子缺檔");
    assert.ok(warned.some((line) => line.includes("contraception-map-seed.json")), "應記錄避孕諮詢種子缺檔");
    assert.ok(warned.every((line) => line.includes("public") && line.includes("data")), "日誌要列出嘗試過的路徑");
  });
});

test("種子檔不存在：有資料庫後備的路由維持原本「沒資料」的回應形狀，不丟例外", async () => {
  await withCwd(EMPTY_ROOT(), async (logs) => {
    // 遺產地圖：和「資料庫沒資料且沒有種子」時一樣
    const heritage = await get(routes.heritage, "/api/heritage-map", { noArg: true });
    assert.equal(heritage.status, 200);
    assert.deepEqual(heritage.json, { ok: true, points: [], updatedAt: null });

    // 書籍：離線種子為空 → books: []
    const books = await get(routes.books, "/api/books");
    assert.equal(books.status, 200);
    assert.equal(books.json.source, "offline_seed");
    assert.deepEqual(books.json.books, []);
    assert.equal(books.json.total, 0);

    // 寵物領養：DB 不可用且無種子 → 500（與改動前相同）
    const pets = await get(routes.pets, "/api/pet-adoptions");
    assert.equal(pets.status, 500);
    assert.deepEqual(pets.json, { error: "查詢認領養資料失敗" });

    // 設施：內建種子類型找不到檔 → 502；避孕諮詢找不到檔 → 回到資料庫路徑（不可用 → 502）
    for (const url of [
      "/api/facilities?type=aed",
      "/api/facilities?type=vet_clinic",
      `/api/facilities?type=clinic&category=${encodeURIComponent("避孕諮詢")}`,
    ]) {
      const facilities = await get(routes.facilities, url);
      assert.equal(facilities.status, 502, url);
      assert.deepEqual(facilities.json, { error: "查詢機構資料失敗" }, url);
    }

    // 中油站點：空清單，且不會把「空的服務項目清單」永久記住
    const { searchCpcStations } = await import(`${pathToFileURL(path.join(REPO_ROOT_PATH, "lib/server/cpc/stations.ts")).href}?fixture=2`);
    const cpc = await searchCpcStations({ limit: 600 });
    assert.deepEqual(cpc, { stations: [], total: 0, allServices: [] });

    // 藝文：空結果而不是 500
    const shows = await get(routes.cultureShows, "/api/culture/shows");
    assert.equal(shows.status, 200);
    assert.equal(shows.json.count, 0);
    const art = await get(routes.culturePublicArt, "/api/culture/public-art");
    assert.equal(art.status, 200);
    assert.equal(art.json.count, 0);

    assert.ok(
      logs.warn.some((line) => line.includes("[seed] 找不到種子檔")),
      "缺檔必須留下日誌，讓營運端看得到而不是靜默變空",
    );
  });
});

test("中油站點：種子之後才出現時，服務項目清單會被記住（只記住小結果，不記住整份種子）", async () => {
  const { root, fx } = buildFixtures();
  const { searchCpcStations } = await import(`${pathToFileURL(path.join(REPO_ROOT_PATH, "lib/server/cpc/stations.ts")).href}?fixture=3`);
  await withCwd(EMPTY_ROOT(), async () => {
    const before = await searchCpcStations({ limit: 5 });
    assert.deepEqual(before.allServices, []);
  });
  await withCwd(root, async () => {
    const expectedServices = [...new Set(fx.cpc.flatMap((s) => s.extra_json?.services || []))].sort();
    const after = await searchCpcStations({ limit: 5 });
    assert.deepEqual(after.allServices, expectedServices, "缺檔期間不能把空清單永久記住");
  });
  // 清單已記住：即使種子不在了也不必再讀
  await withCwd(EMPTY_ROOT(), async () => {
    const expectedServices = [...new Set(fx.cpc.flatMap((s) => s.extra_json?.services || []))].sort();
    const again = await searchCpcStations({ limit: 5 });
    assert.deepEqual(again.allServices, expectedServices);
  });
});
