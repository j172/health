import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// #741：種子檔的讀取只有一套順序（public/data 優先、data/ 墊後），而且所有讀取點都經由
// lib/server/db/transientSeed.ts。這份測試分三層：
//   1. 結構：repo 內沒有人再自己手寫 `process.cwd()` + "data" 去讀種子，也沒有第二個讀取器。
//   2. 行為：兩個位置都有檔且內容不同時讀到約定的那一份；缺檔／壞檔的降級與日誌。
//   3. 部署模擬：照 deploy-ftps.yml 與 .remote-health-index.php 的步驟，在 data/ 是舊的實體
//      資料夾（或符號連結）的情況下，讀到的仍是新版種子。

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(HERE, "..");
const ORIGINAL_CWD = process.cwd();

const { readSeedJson, readSeedText, readTransientSeedJson, clearTransientSeedCache, transientSeedCandidates } =
  await import(new URL("../lib/server/db/transientSeed.ts", import.meta.url).href);

const read = (relative) => fs.readFileSync(path.join(ROOT_DIR, relative), "utf8").replace(/\r\n/g, "\n");

// ---------------------------------------------------------------------------
// 1. 結構
// ---------------------------------------------------------------------------

function listSourceFiles() {
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
    }
  };
  for (const dir of ["app", "lib", "components"]) walk(path.join(ROOT_DIR, dir));
  return out;
}

const rel = (full) => path.relative(ROOT_DIR, full).replace(/\\/g, "/");
const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

test("只有 transientSeed.ts 自己會用 process.cwd() 組出 data/ 或 public/data/ 的路徑去讀種子", () => {
  // 寫入不在此限：nhiPenalties 的離線備份是「產生」種子，不是讀取。
  const WRITERS = new Set(["lib/server/facilities/sources/nhiPenalties.ts"]);
  const offenders = [];
  for (const file of listSourceFiles()) {
    const name = rel(file);
    if (name === "lib/server/db/transientSeed.ts" || WRITERS.has(name)) continue;
    const source = stripComments(fs.readFileSync(file, "utf8"));
    if (/cwd\(\)[^;]*["']data["']/.test(source)) offenders.push(name);
  }
  assert.deepEqual(offenders, [], "請改用 readSeedJson／readSeedText／readTransientSeedJson（lib/server/db/transientSeed.ts）");
});

test("寫種子的地方只有 nhiPenalties，而且它不讀取", () => {
  const source = stripComments(read("lib/server/facilities/sources/nhiPenalties.ts"));
  assert.match(source, /writeFileSync\(seedFile/);
  assert.doesNotMatch(source, /readFileSync/);
});

test("沒有第二套讀取器：seedReader.ts 已移除，也沒有人從它匯入", () => {
  assert.equal(fs.existsSync(path.join(ROOT_DIR, "lib/server/db/seedReader.ts")), false);
  const importers = listSourceFiles()
    .filter((file) => /seedReader/.test(stripComments(fs.readFileSync(file, "utf8"))))
    .map(rel);
  assert.deepEqual(importers, []);
});

test("順序只定義一次：TRANSIENT_SEED_DIRS 是 public/data → data，且 repo 內沒有別處寫死這個順序", () => {
  const source = read("lib/server/db/transientSeed.ts");
  assert.match(source, /TRANSIENT_SEED_DIRS[^=]*=\s*\[\s*\["public", "data"\],\s*\["data"\],?\s*\]/);
  const duplicates = listSourceFiles()
    .map(rel)
    .filter((name) => name !== "lib/server/db/transientSeed.ts")
    .filter((name) => /["']public["']\s*,\s*["']data["']/.test(stripComments(read(name))));
  assert.deepEqual(duplicates, []);
});

test("每個已知的讀取點都 import 共用函式", () => {
  const READ_POINTS = [
    "app/(zh)/tools/child-subsidies/page.tsx",
    "app/(zh)/tools/emergency-hotlines/page.tsx",
    "app/[locale]/tools/emergency-hotlines/page.tsx",
    "app/(zh)/tools/ltc-benefits/page.tsx",
    "app/(zh)/tools/social-welfare-centers/page.tsx",
    "app/api/admin/hotlines-sync/route.ts",
    "app/api/facilities/route.ts",
    "lib/server/cdc/ingestCdcAlerts.ts",
    "lib/server/culture/ingestPublicArt.ts",
    "lib/server/db/mysql.ts",
    "lib/server/officeCalendar/calendarSource.ts",
  ];
  for (const file of READ_POINTS) {
    const source = read(file);
    assert.match(
      source,
      /import\s*\{[^}]*\b(readSeedJson|readSeedText|readTransientSeedJson)\b[^}]*\}\s*from\s*"(@\/lib\/server\/db\/transientSeed|\.\/transientSeed)"/,
      `${file} 應從 transientSeed 匯入讀取函式`,
    );
  }
});

// ---------------------------------------------------------------------------
// 2. 行為
// ---------------------------------------------------------------------------

function makeTempRoot(prefix = "seed-order-741-") {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeFile(root, relative, content) {
  const full = path.join(root, relative);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, typeof content === "string" ? content : JSON.stringify(content), "utf8");
}

async function inCwd(root, fn) {
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args.map(String).join(" "));
  clearTransientSeedCache();
  process.chdir(root);
  try {
    return await fn(warnings);
  } finally {
    process.chdir(ORIGINAL_CWD);
    console.warn = originalWarn;
    clearTransientSeedCache();
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test("三個讀取函式的候選路徑完全相同：public/data 在前、data 在後", () => {
  const candidates = transientSeedCandidates("facilities-seeds/aed.json");
  assert.equal(candidates.length, 2);
  assert.ok(candidates[0].endsWith(path.join("public", "data", "facilities-seeds", "aed.json")));
  assert.ok(candidates[1].endsWith(path.join("data", "facilities-seeds", "aed.json")));
});

test("兩個位置都有檔、內容不同：三個讀取函式都讀到 public/data 那份", async () => {
  const root = makeTempRoot();
  writeFile(root, "public/data/seed.json", { from: "public" });
  writeFile(root, "data/seed.json", { from: "data" });
  writeFile(root, "public/data/list.csv", "a,b\nnew,1\n");
  writeFile(root, "data/list.csv", "a,b\nold,1\n");
  await inCwd(root, () => {
    assert.deepEqual(readSeedJson("seed.json"), { from: "public" });
    assert.deepEqual(readTransientSeedJson("seed.json"), { from: "public" });
    assert.equal(readSeedText("list.csv"), "a,b\nnew,1\n");
  });
});

test("只有 data/ 有檔（本機開發）：退到 data/，不寫警告", async () => {
  const root = makeTempRoot();
  writeFile(root, "data/facilities-seeds/aed.json", [{ id: 1 }]);
  await inCwd(root, (warnings) => {
    assert.deepEqual(readSeedJson("facilities-seeds/aed.json"), [{ id: 1 }]);
    assert.deepEqual(warnings, []);
  });
});

test("public/data 的檔壞掉或是空的：退到 data/ 的好檔", async () => {
  const root = makeTempRoot();
  writeFile(root, "public/data/seed.json", "{ truncated");
  writeFile(root, "data/seed.json", { ok: true });
  writeFile(root, "public/data/empty.csv", "  \n");
  writeFile(root, "data/empty.csv", "x\n1\n");
  await inCwd(root, () => {
    assert.deepEqual(readSeedJson("seed.json"), { ok: true });
    assert.equal(readSeedText("empty.csv"), "x\n1\n");
  });
});

test("兩處都沒有檔：回傳 null，警告列出兩個嘗試過的路徑；同一檔一分鐘內只警告一次", async () => {
  const root = makeTempRoot();
  await inCwd(root, (warnings) => {
    assert.equal(readSeedJson("missing.json"), null);
    assert.equal(readSeedJson("missing.json"), null);
    assert.equal(readSeedText("missing.csv"), null);
    assert.equal(warnings.length, 2);
    assert.ok(warnings[0].includes(path.join("public", "data", "missing.json")));
    assert.ok(warnings[0].includes(path.join("data", "missing.json")));
    assert.ok(warnings[0].includes("降級"));
    assert.ok(warnings[1].includes("missing.csv"));
  });
});

test("optional：找不到檔不警告（網址參數猜的種子名），但檔案壞掉仍會警告", async () => {
  const root = makeTempRoot();
  writeFile(root, "data/broken.json", "{ nope");
  await inCwd(root, (warnings) => {
    for (let i = 0; i < 50; i++) assert.equal(readSeedJson(`guess-${i}.json`, { optional: true }), null);
    assert.deepEqual(warnings, []);
    assert.equal(readSeedJson("broken.json", { optional: true }), null);
    assert.equal(warnings.length, 1);
    assert.ok(warnings[0].includes("無法讀取或解析"));
  });
});

test("readSeedJson 不快取：檔案更新後下一次呼叫就讀到新內容", async () => {
  const root = makeTempRoot();
  writeFile(root, "public/data/seed.json", { v: 1 });
  await inCwd(root, () => {
    assert.deepEqual(readSeedJson("seed.json"), { v: 1 });
    writeFile(root, "public/data/seed.json", { v: 2 });
    assert.deepEqual(readSeedJson("seed.json"), { v: 2 });
  });
});

// ---------------------------------------------------------------------------
// 3. 部署模擬
// ---------------------------------------------------------------------------

// 把部署流程的兩段檔案操作用 node:fs 重現（並用下面的測試把它們和真實的 yml／php 綁在一起）：
//   deploy-ftps.yml：  mkdir -p public/data && cp -r data/* public/data/   （在 CI 的 checkout 內）
//   主機端（php）：    解壓 public.tgz 到 ~/health_app/public（覆寫 public/data）；
//                      data 不存在 → ln -sfn public/data data；
//                      data 是實體資料夾 → cp -rn public/data/* data/（不覆寫既有檔）
function simulateDeploy({ ciRepo, host, dataKind }) {
  // CI：把 data/ 複製進 public/data/
  fs.mkdirSync(path.join(ciRepo, "public", "data"), { recursive: true });
  for (const name of fs.readdirSync(path.join(ciRepo, "data"))) {
    fs.cpSync(path.join(ciRepo, "data", name), path.join(ciRepo, "public", "data", name), { recursive: true, force: true });
  }
  // 主機：解壓 public/ 覆寫 ~/health_app/public
  fs.cpSync(path.join(ciRepo, "public"), path.join(host, "public"), { recursive: true, force: true });
  // 主機：data 的處理
  const hostData = path.join(host, "data");
  if (!fs.existsSync(hostData) && dataKind === "absent") {
    fs.symlinkSync(path.join(host, "public", "data"), hostData, "junction");
  } else if (fs.existsSync(hostData) && !fs.lstatSync(hostData).isSymbolicLink()) {
    fs.cpSync(path.join(host, "public", "data"), hostData, { recursive: true, force: false, errorOnExist: false });
  }
}

test("部署模擬：主機上的 data/ 是舊的實體資料夾，部署後仍讀到新版種子", async () => {
  const ciRepo = makeTempRoot("seed-order-741-ci-");
  const host = makeTempRoot("seed-order-741-host-");
  try {
    // 主機上的舊狀態：舊版種子在 data/（實體資料夾），public/data 也是舊的
    writeFile(host, "data/facilities-seeds/aed.json", [{ id: 1, name: "舊版" }]);
    writeFile(host, "data/office-calendar-seed.json", { days: { "2026-01-01": [2, "舊"] } });
    writeFile(host, "public/data/facilities-seeds/aed.json", [{ id: 1, name: "舊版" }]);
    // 新版 commit 的 data/
    writeFile(ciRepo, "data/facilities-seeds/aed.json", [{ id: 1, name: "新版" }, { id: 2, name: "新增" }]);
    writeFile(ciRepo, "data/office-calendar-seed.json", { days: { "2026-01-01": [2, "新"] } });

    simulateDeploy({ ciRepo, host, dataKind: "physical" });

    // 前提：cp -rn 沒有覆寫，所以 data/ 仍是舊的——這正是舊版 readSeedJson（data 優先）會踩到的狀況
    assert.equal(JSON.parse(fs.readFileSync(path.join(host, "data/facilities-seeds/aed.json"), "utf8"))[0].name, "舊版");

    await inCwd(host, () => {
      assert.deepEqual(readSeedJson("facilities-seeds/aed.json"), [{ id: 1, name: "新版" }, { id: 2, name: "新增" }]);
      assert.deepEqual(readTransientSeedJson("facilities-seeds/aed.json"), [{ id: 1, name: "新版" }, { id: 2, name: "新增" }]);
      assert.deepEqual(readSeedJson("office-calendar-seed.json"), { days: { "2026-01-01": [2, "新"] } });
    });
  } finally {
    fs.rmSync(ciRepo, { recursive: true, force: true });
    fs.rmSync(host, { recursive: true, force: true });
  }
});

test("部署模擬：data 是指向 public/data 的符號連結時，同樣讀到新版種子", async (t) => {
  const ciRepo = makeTempRoot("seed-order-741-ci-");
  const host = makeTempRoot("seed-order-741-host-");
  try {
    writeFile(ciRepo, "data/seed.json", { v: "new" });
    try {
      simulateDeploy({ ciRepo, host, dataKind: "absent" });
    } catch (error) {
      t.skip(`此環境無法建立目錄連結：${error.code ?? error.message}`);
      return;
    }
    await inCwd(host, () => {
      assert.deepEqual(readSeedJson("seed.json"), { v: "new" });
    });
  } finally {
    fs.rmSync(ciRepo, { recursive: true, force: true });
    fs.rmSync(host, { recursive: true, force: true });
  }
});

test("部署模擬是照真實流程寫的：deploy-ftps.yml 與 .remote-health-index.php 仍是這兩步", () => {
  const workflow = read(".github/workflows/deploy-ftps.yml");
  assert.match(workflow, /mkdir -p public\/data\n\s*cp -r data\/\* public\/data\//, "CI 必須把 data/ 複製進 public/data/ 再打包 public/");
  const php = read(".remote-health-index.php");
  assert.match(php, /ln -sfn public\/data data/, "data 不存在時建成指向 public/data 的符號連結");
  assert.match(php, /cp -rn public\/data\/\* data\//, "data 是實體資料夾時只做不覆寫的複製（所以讀取端必須優先 public/data）");
});

test("the nhi-penalties offline backup is written to public/data, where the reader looks first", () => {
  const src = fs.readFileSync(new URL("../lib/server/facilities/sources/nhiPenalties.ts", import.meta.url), "utf8");
  assert.match(src, /seedWriteDirectory\("facilities-seeds"\)/);
  assert.doesNotMatch(src, /process\.cwd\(\)/);
  const helper = fs.readFileSync(new URL("../lib/server/db/transientSeed.ts", import.meta.url), "utf8");
  assert.match(helper, /seedWriteDirectory[\s\S]*?\.\.\.TRANSIENT_SEED_DIRS\[0\]/);
});
