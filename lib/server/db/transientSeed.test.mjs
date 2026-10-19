import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { mock } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  DEFAULT_TRANSIENT_SEED_TTL_MS,
  clearTransientSeedCache,
  readTransientSeedJson,
  transientSeedCacheSize,
  transientSeedCandidates,
} from "./transientSeed.ts";

// #709：大型種子 JSON 改成「按需讀取、短暫停留後釋放」。這裡驗證讀取器本身：
// 找檔順序（public/data 優先，才能和部署覆寫的內容一致）、TTL 內共用同一份物件、
// 逾時後確實釋放參照（用 WeakRef＋--expose-gc 實測，不是只看計時器）、計時器 unref
// （不會拖住行程結束），以及找不到檔／檔案壞掉時的降級與日誌。

const ORIGINAL_CWD = process.cwd();
const HERE = path.dirname(fileURLToPath(import.meta.url));
const HELPER = path.join(HERE, "transientSeed.ts");

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "transient-seed-"));
}

function writeJson(root, relative, value) {
  const full = path.join(root, relative);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, typeof value === "string" ? value : JSON.stringify(value), "utf-8");
}

/** 在指定 cwd 下執行並攔截 console.warn。 */
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
  }
}

test("預設 TTL 是 60 秒，且依序嘗試 public/data、data", () => {
  assert.equal(DEFAULT_TRANSIENT_SEED_TTL_MS, 60_000);
  const root = makeTempRoot();
  return inCwd(root, () => {
    const candidates = transientSeedCandidates("x.json");
    assert.equal(candidates.length, 2);
    assert.ok(candidates[0].endsWith(path.join("public", "data", "x.json")));
    assert.ok(candidates[1].endsWith(path.join("data", "x.json")));
    assert.ok(!candidates[1].includes(path.join("public", "data")));
  });
});

test("兩處都有檔時優先讀 public/data（部署每次覆寫它；data/ 可能是舊的實體資料夾）", async () => {
  const root = makeTempRoot();
  writeJson(root, "public/data/seed.json", { from: "public" });
  writeJson(root, "data/seed.json", { from: "data" });
  await inCwd(root, (warnings) => {
    assert.deepEqual(readTransientSeedJson("seed.json"), { from: "public" });
    assert.deepEqual(warnings, []);
  });
});

test("public/data 沒有該檔時退到 data/（本機開發與測試）", async () => {
  const root = makeTempRoot();
  writeJson(root, "public/data/other.json", { x: 1 });
  writeJson(root, "data/facilities-seeds/aed.json", [{ id: 1 }]);
  await inCwd(root, () => {
    assert.deepEqual(readTransientSeedJson("facilities-seeds/aed.json"), [{ id: 1 }]);
  });
});

test("TTL 內共用同一份物件、不重讀檔；逾時後移除並重新讀到新內容", async () => {
  const root = makeTempRoot();
  writeJson(root, "data/seed.json", { v: 1 });
  await inCwd(root, () => {
    // 用假計時器推進時間，避免 CI 忙碌時的時間抖動造成測試不穩
    mock.timers.enable({ apis: ["setTimeout"] });
    try {
      const first = readTransientSeedJson("seed.json", { ttlMs: 60_000 });
      assert.deepEqual(first, { v: 1 });
      assert.equal(transientSeedCacheSize(), 1);

      writeJson(root, "data/seed.json", { v: 2 });
      mock.timers.tick(59_999);
      assert.equal(readTransientSeedJson("seed.json", { ttlMs: 60_000 }), first, "TTL 內應是同一個物件，且不重讀檔");
      assert.equal(transientSeedCacheSize(), 1);

      mock.timers.tick(1);
      assert.equal(transientSeedCacheSize(), 0, "逾時後參照必須被移除");
      assert.deepEqual(readTransientSeedJson("seed.json", { ttlMs: 60_000 }), { v: 2 }, "逾時後應重新讀檔");
    } finally {
      clearTransientSeedCache();
      mock.timers.reset();
    }
  });
});

test("TTL 是從載入時起算的絕對時間：持續有請求也不會一直續命", async () => {
  const root = makeTempRoot();
  writeJson(root, "data/seed.json", { v: 1 });
  await inCwd(root, () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    try {
      const first = readTransientSeedJson("seed.json", { ttlMs: 100 });
      mock.timers.tick(40);
      // 40ms 時又讀了一次（TTL 內）：拿到同一份，而且這次讀取不能把到期時間往後延
      assert.equal(readTransientSeedJson("seed.json", { ttlMs: 100 }), first);
      mock.timers.tick(59);
      assert.equal(transientSeedCacheSize(), 1, "99ms 時還在");
      mock.timers.tick(1);
      assert.equal(transientSeedCacheSize(), 0, "距離載入滿 100ms 就必須釋放，不因中途被讀過而續命");
      const second = readTransientSeedJson("seed.json", { ttlMs: 100 });
      assert.notEqual(second, first, "TTL 到期後必須是重新解析出來的新物件");
      assert.deepEqual(second, first);
    } finally {
      clearTransientSeedCache();
      mock.timers.reset();
    }
  });
});

test("找不到檔：回傳 null，日誌列出檔名與嘗試過的路徑，同一檔一分鐘內只警告一次", async () => {
  const root = makeTempRoot();
  await inCwd(root, (warnings) => {
    assert.equal(readTransientSeedJson("missing-seed.json"), null);
    assert.equal(readTransientSeedJson("missing-seed.json"), null);
    assert.equal(transientSeedCacheSize(), 0, "失敗不得留下快取項目");
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /\[seed\] 找不到種子檔 missing-seed\.json/);
    assert.ok(warnings[0].includes(path.join("public", "data", "missing-seed.json")));
    assert.ok(warnings[0].includes(path.join("data", "missing-seed.json")));
    assert.match(warnings[0], /降級/);
    // 不同的檔案各自警告
    assert.equal(readTransientSeedJson("another-missing.json"), null);
    assert.equal(warnings.length, 2);
  });
});

test("檔案存在但不是合法 JSON：回傳 null 並記錄解析失敗（不誤報成找不到檔）", async () => {
  const root = makeTempRoot();
  writeJson(root, "data/broken.json", "{ not json");
  await inCwd(root, (warnings) => {
    assert.equal(readTransientSeedJson("broken.json"), null);
    assert.equal(transientSeedCacheSize(), 0);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /無法讀取或解析種子檔 broken\.json/);
    assert.doesNotMatch(warnings[0], /找不到種子檔/);
  });
});

test("public/data 的檔壞掉但 data/ 的是好的：退到 data/", async () => {
  const root = makeTempRoot();
  writeJson(root, "public/data/seed.json", "{ truncated");
  writeJson(root, "data/seed.json", { ok: true });
  await inCwd(root, () => {
    assert.deepEqual(readTransientSeedJson("seed.json"), { ok: true });
  });
});

test("計時器已 unref：載入種子後行程不會被 TTL 拖住，會立刻自然結束", () => {
  const root = makeTempRoot();
  writeJson(root, "data/seed.json", { v: 1 });
  const script = `
    import { readTransientSeedJson, transientSeedCacheSize } from ${JSON.stringify(pathToFileURL(HELPER).href)};
    const value = readTransientSeedJson("seed.json", { ttlMs: 120000 });
    if (!value || transientSeedCacheSize() !== 1) process.exit(2);
  `;
  const started = Date.now();
  // 若計時器沒有 unref，這個行程會活到 120 秒後；execFileSync 的 timeout 會讓測試失敗。
  execFileSync(process.execPath, ["--input-type=module", "-e", script], {
    cwd: root,
    timeout: 20_000,
    stdio: "pipe",
  });
  assert.ok(Date.now() - started < 15_000, "行程應在 TTL 之前就自然結束");
});

test("逾時後物件真的能被 GC 回收（WeakRef 實測，不是只看 Map 清掉）", () => {
  const root = makeTempRoot();
  // 約 2 MB 的物件，確保若還被參照一定看得出來
  const big = { rows: Array.from({ length: 20_000 }, (_, i) => ({ id: i, name: `項目-${i}`, pad: "x".repeat(60) })) };
  writeJson(root, "data/big.json", big);
  const script = `
    import { readTransientSeedJson, transientSeedCacheSize } from ${JSON.stringify(pathToFileURL(HELPER).href)};
    const load = () => {
      const value = readTransientSeedJson("big.json", { ttlMs: 50 });
      return new WeakRef(value);
    };
    const ref = load();
    if (!ref.deref() || ref.deref().rows.length !== 20000) process.exit(2);
    await new Promise((resolve) => setTimeout(resolve, 200));
    if (transientSeedCacheSize() !== 0) process.exit(3);
    for (let i = 0; i < 5; i++) {
      globalThis.gc();
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    process.exit(ref.deref() === undefined ? 0 : 4);
  `;
  execFileSync(process.execPath, ["--expose-gc", "--input-type=module", "-e", script], {
    cwd: root,
    timeout: 30_000,
    stdio: "pipe",
  });
});
