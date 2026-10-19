#!/usr/bin/env node
/**
 * 種子路由「黃金輸出」比對工具（#709）。
 *
 * 用途：把大型種子 JSON 從「靜態 import 進 server chunk」改成「請求時按需讀檔」時，
 * 證明改動前後每個受影響路由的輸出逐位元組相同。做法是在資料庫不可用
 * （MYSQL_PORT=1，立刻 ECONNREFUSED）的條件下，對舊、新兩棵 repo 樹各跑一次同一組固定請求，
 * 把狀態碼、Cache-Control、body 的 SHA-256 寫成檔，再互相比對。
 *
 * 不連資料庫、不碰 .env*／secrets；只用公開的 placeholder 環境變數。需要 Node >= 24
 * （直接 import .ts）與該 repo 樹已 `npm ci`（要用它的 node_modules/next）。
 *
 * 用法：
 *   node seed-route-golden.mjs run  --repo <repo 樹根目錄> --out <輸出資料夾> [--only <案例前綴>]
 *   node seed-route-golden.mjs diff <輸出資料夾 A> <輸出資料夾 B>      （全部相同 exit 0，否則 exit 1）
 *
 * 典型流程（舊樹＝改動前的 main，新樹＝這個分支）：
 *   node seed-route-golden.mjs run --repo ../health-main   --out /tmp/golden-old
 *   node seed-route-golden.mjs run --repo ../health-branch --out /tmp/golden-new
 *   node seed-route-golden.mjs diff /tmp/golden-old /tmp/golden-new
 *
 * body 內由 `new Date()` 產生的 `"updatedAt":"<ISO 時間>"` 會先換成 `<now>` 再算雜湊，
 * 其餘一字不動。
 */
import crypto from "node:crypto";
import fs from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const [mode, ...rest] = process.argv.slice(2);

// ---------------------------------------------------------------------------
// 固定的請求清單（每個值都挑過會命中資料的，避免空結果掩蓋差異）
// ---------------------------------------------------------------------------
const CASES = [];
const add = (name, route, url, call = "request") => CASES.push({ name, route, url: `http://x${url}`, call });
const addAll = (prefix, route, base, queries) => {
  for (const [name, query] of queries) add(`${prefix}-${name}`, route, `${base}${query}`);
};

addAll("breastfeeding", "app/api/breastfeeding-rooms/route.ts", "/api/breastfeeding-rooms", [
  ["all", ""],
  ["county-alt-char", "?county=台北市"],
  ["county-keyword", "?county=新北市&keyword=醫院"],
  ["keyword-none", "?keyword=zzzz_no_such"],
  ["keyword-hospital", "?keyword=%E9%86%AB%E9%99%A2"],
]);
addAll("contraception", "app/api/contraception-map/route.ts", "/api/contraception-map", [
  ["all", ""],
  ["clinic", "?category=clinic"],
  ["pharmacy-city", "?category=pharmacy&city=臺北市"],
  ["keyword", "?keyword=藥局"],
  ["all-cities", "?category=all&city=全部縣市"],
]);
add("heritage-all", "app/api/heritage-map/route.ts", "/api/heritage-map", "no-arg");
addAll("books", "app/api/books/route.ts", "/api/books", [
  ["all", ""],
  ["q", "?q=醫"],
  ["rank5", "?sortBy=ranking&limit=5"],
  ["page2", "?page=2&limit=10"],
  ["price", "?sortBy=priceAsc&limit=7&page=3"],
]);
addAll("pets", "app/api/pet-adoptions/route.ts", "/api/pet-adoptions", [
  ["all", ""],
  ["dog5", "?kind=%E7%8B%97&limit=5"],
  ["city-keyword", "?city=彰化縣&keyword=%E6%B7%B7%E7%A8%AE"],
  ["kind-sex-body", "?kind=%E7%8B%97&sex=M&bodytype=MEDIUM&limit=60"],
  ["page3", "?page=3&limit=10"],
]);
addAll("facilities", "app/api/facilities/route.ts", "/api/facilities", [
  ["aed", "?type=aed&limit=20"],
  ["aed-keyword", "?type=aed&keyword=%E9%86%AB%E9%99%A2&limit=50"],
  ["aed-county", "?type=aed&county=台北市&limit=500"],
  ["aed-gps", "?type=aed&lat=25.04&lng=121.51&radius=3000&limit=50"],
  ["vet", "?type=vet_clinic&limit=30"],
  ["vet-county-sort", "?type=vet_clinic&county=新北市&sort=name&limit=40"],
  ["vet-gps", "?type=vet_clinic&lat=25.03&lng=121.56&radius=5000"],
  ["tourism", "?type=tourism_factory&limit=500"],
  ["bookstore-keyword", "?type=bookstore&keyword=%E6%9B%B8&limit=60"],
  ["bookstore-newest", "?type=bookstore&sort=newest&limit=10&page=2"],
  ["cpc", "?type=cpc_gas_station&limit=25"],
  ["cpc-keyword-miss", "?type=cpc_gas_station&keyword=%E5%8F%B0%E5%8C%97&limit=25"],
  ["cpc-keyword-hit", "?type=cpc_gas_station&keyword=%E5%9F%BA%E9%9A%86&limit=25"],
  ["contraception-clinic", "?type=clinic&category=%E9%81%BF%E5%AD%95%E8%AB%AE%E8%A9%A2&limit=500"],
  ["contraception-pharmacy", "?type=pharmacy&category=%E9%81%BF%E5%AD%95%E8%AB%AE%E8%A9%A2&county=台北市&limit=100"],
  ["contraception-gps", "?type=pharmacy&category=%E9%81%BF%E5%AD%95%E8%AB%AE%E8%A9%A2&lat=25.04&lng=121.5&radius=2000"],
  ["generic-file", "?type=green_shop&limit=20"],
  ["generic-empty-file", "?type=smoking_cessation"],
  ["unknown-type", "?type=no_such_type"],
  ["missing-type", ""],
]);
addAll("cpc-stations", "app/api/cpc-stations/route.ts", "/api/cpc-stations", [
  ["all", ""],
  ["keyword", "?keyword=%E5%9F%BA%E9%9A%86"],
  ["keyword-name", "?keyword=%E4%B8%AD%E6%B2%B9"],
  ["services", "?services=%E5%8A%A0%E6%B0%B4%E6%9C%8D%E5%8B%99,%E4%B8%80%E5%8D%A1%E9%80%9A"],
  ["gps", "?lat=25.03&lng=121.56&radius=3000"],
  ["limit5", "?limit=5"],
]);
addAll("culture-shows", "app/api/culture/shows/route.ts", "/api/culture/shows", [
  ["all", ""],
  ["keyword", "?keyword=%E9%9F%B3%E6%A8%82"],
  ["category-city", "?category=1&city=桃園市&limit=20"],
  ["venue-category", "?category=venue_h&limit=20"],
  ["none", "?keyword=zzzz_no_such_event"],
]);
addAll("culture-public-art", "app/api/culture/public-art/route.ts", "/api/culture/public-art", [
  ["all", ""],
  ["keyword", "?keyword=%E9%9B%95%E5%A1%91"],
  ["gps", "?lat=25.04&lng=121.5&radius=3"],
  ["venue", "?fieldType=venue&limit=50"],
  ["city", "?city=臺北市&limit=20"],
]);

const normalize = (text) => text.replace(/"updatedAt":"\d{4}-\d{2}-\d{2}T[\d:.]+Z"/g, '"updatedAt":"<now>"');
const opt = (name) => {
  const index = rest.indexOf(`--${name}`);
  return index >= 0 ? rest[index + 1] : undefined;
};

// ---------------------------------------------------------------------------
// diff
// ---------------------------------------------------------------------------
if (mode === "diff") {
  const [a, b] = rest.map((p) => path.resolve(p));
  if (!a || !b) {
    console.error("usage: seed-route-golden.mjs diff <dirA> <dirB>");
    process.exit(2);
  }
  const read = (dir) => {
    const map = new Map();
    for (const line of fs.readFileSync(path.join(dir, "_summary.tsv"), "utf-8").trim().split("\n")) {
      const [name, ...fields] = line.split("\t");
      map.set(name, fields.join("\t"));
    }
    return map;
  };
  const left = read(a);
  const right = read(b);
  let differences = 0;
  for (const name of new Set([...left.keys(), ...right.keys()])) {
    if (left.get(name) !== right.get(name)) {
      differences += 1;
      console.log(`DIFF ${name}\n  A: ${left.get(name) ?? "(missing)"}\n  B: ${right.get(name) ?? "(missing)"}`);
    }
  }
  console.log(`${left.size} cases in A, ${right.size} in B, ${differences} differing`);
  process.exit(differences === 0 && left.size === right.size ? 0 : 1);
}

// ---------------------------------------------------------------------------
// run
// ---------------------------------------------------------------------------
if (mode !== "run" || !opt("repo") || !opt("out")) {
  console.error("usage: seed-route-golden.mjs run --repo <tree> --out <dir> [--only <prefix>] | diff <dirA> <dirB>");
  process.exit(2);
}
const repoRoot = path.resolve(opt("repo"));
const outDir = path.resolve(opt("out"));
const only = opt("only") ?? "";
fs.mkdirSync(outDir, { recursive: true });

// 公開的 placeholder：埠 1 沒有任何服務在聽 → 立刻 ECONNREFUSED ＝「資料庫不可用」
Object.assign(process.env, {
  NODE_ENV: "production",
  MYSQL_HOST: "127.0.0.1",
  MYSQL_PORT: "1",
  MYSQL_USER: "placeholder",
  MYSQL_PASSWORD: "placeholder",
  MYSQL_DATABASE: "placeholder",
  MYSQL_SSL: "false",
  RSS_SYNC_SECRET: "placeholder",
  RSS_SYNC_ADMIN_SECRET: "placeholder",
});
process.chdir(repoRoot); // 與 `next start` 一樣，種子依 process.cwd() 找

const ROOT = pathToFileURL(repoRoot + path.sep);
const EXTENSIONS = [".ts", ".tsx", ".js", ".mjs"];
const resolveFile = (base) => {
  const file = fileURLToPath(base);
  if (fs.existsSync(file) && fs.statSync(file).isFile()) return base.href;
  for (const extension of EXTENSIONS) if (fs.existsSync(file + extension)) return pathToFileURL(file + extension).href;
  for (const extension of EXTENSIONS) {
    const index = path.join(file, `index${extension}`);
    if (fs.existsSync(index)) return pathToFileURL(index).href;
  }
  return null;
};
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") return { url: "data:text/javascript,", shortCircuit: true };
    if (context.parentURL && context.parentURL.includes("/node_modules/")) return nextResolve(specifier, context);
    if (/^next\/[\w/-]+$/.test(specifier)) {
      const file = path.join(repoRoot, "node_modules", `${specifier}.js`);
      if (fs.existsSync(file)) return nextResolve(pathToFileURL(file).href, context);
    }
    let base = null;
    if (specifier.startsWith("@/")) base = new URL(specifier.slice(2), ROOT);
    else if (specifier.startsWith(".") && context.parentURL) base = new URL(specifier, context.parentURL);
    if (base) {
      // 舊樹用 `import x from "@/data/foo.json"`；Node 需要 import attributes
      if (base.pathname.endsWith(".json")) {
        return { url: base.href, format: "json", importAttributes: { type: "json" }, shortCircuit: true };
      }
      const hit = resolveFile(base);
      if (hit) return nextResolve(hit, context);
    }
    return nextResolve(specifier, context);
  },
});

const nextServer = await import(pathToFileURL(path.join(repoRoot, "node_modules", "next", "server.js")).href);
const NextRequest = nextServer.NextRequest ?? nextServer.default.NextRequest;

const original = { warn: console.warn, error: console.error, log: console.log };
const quiet = () => {
  console.warn = () => {};
  console.error = () => {};
  console.log = () => {};
};
const loud = () => Object.assign(console, original);

const modules = new Map();
const summary = [];
for (const testCase of CASES) {
  if (only && !testCase.name.startsWith(only)) continue;
  quiet();
  let record;
  try {
    let routeModule = modules.get(testCase.route);
    if (!routeModule) {
      routeModule = await import(pathToFileURL(path.join(repoRoot, testCase.route)).href);
      modules.set(testCase.route, routeModule);
    }
    const response =
      testCase.call === "no-arg" ? await routeModule.GET() : await routeModule.GET(new NextRequest(testCase.url));
    const body = normalize(await response.text());
    record = {
      status: response.status,
      cacheControl: response.headers.get("cache-control"),
      contentType: response.headers.get("content-type"),
      bytes: Buffer.byteLength(body),
      sha256: crypto.createHash("sha256").update(body).digest("hex"),
      body,
    };
  } catch (error) {
    record = { thrown: String(error?.message ?? error) };
  } finally {
    loud();
  }
  fs.writeFileSync(path.join(outDir, `${testCase.name}.json`), JSON.stringify(record));
  summary.push(
    [testCase.name, record.status ?? "THROWN", record.bytes ?? "-", record.cacheControl ?? "-", (record.sha256 ?? record.thrown ?? "").slice(0, 16)].join("\t"),
  );
}
fs.writeFileSync(path.join(outDir, "_summary.tsv"), `${summary.join("\n")}\n`);
console.log(summary.join("\n"));
process.exit(0); // mysql2 連線池不一定讓事件迴圈自然結束
