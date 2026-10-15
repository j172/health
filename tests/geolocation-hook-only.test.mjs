import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// PRD #438 §K / 接縫 ②（原始碼掃描）：「`navigator.geolocation` 只允許出現在
// 定位 hook。」全站定位收斂為單一 hook（lib/hooks/useSharedGeolocation.ts）的
// 目的，是讓「逾時沒有等瀏覽器授權彈窗被回應」這類 bug 修一次全站生效——曾經
// 因為 25 個檔案各自呼叫、4 處各自修過同一個 timeout bug（見
// tests/useSharedGeolocation.test.mjs）。這個測試把那條規則變成會擋 CI 的硬性
// 檢查，避免之後又有人在元件裡直接呼叫瀏覽器定位 API。
//
// 刻意用「原始文字」掃描、不做註解剝除：簡單的註解剝除器遇到字串裡的 `//`
// （例如 "https://..."）會把同一行後面真正的呼叫一起吞掉，反而變成繞過掃描的
// 洞。真的需要在其他檔案的註解提到它時，改寫措辭即可（例如「瀏覽器定位 API」）。
//
// 除了字面的 `navigator.geolocation` 之外，也擋會繞過它的寫法：
//   - `navigator["geolocation"]`
//   - 解構／別名之後直接呼叫的 getCurrentPosition／watchPosition
//   - Leaflet 的 `map.locate()`（內部其實就是呼叫 navigator.geolocation）

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const SCAN_DIRS = ["app", "components", "lib"];

/** 唯一允許直接碰瀏覽器定位 API 的檔案（相對 repo 根目錄、使用 `/`）。 */
const ALLOWLIST = new Set(["lib/hooks/useSharedGeolocation.ts"]);

const SOURCE_FILE = /\.(?:[cm]?[jt]sx?)$/;
const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$/;

const FORBIDDEN_PATTERNS = [
  { name: "navigator.geolocation", regex: /navigator\s*(?:\?\.|\.)\s*geolocation/ },
  { name: 'navigator["geolocation"]', regex: /navigator\s*\[\s*["'`]geolocation["'`]\s*\]/ },
  // 呼叫形式才算（`getCurrentPosition(`），註解裡單純提到 API 名稱不算違規。
  { name: "getCurrentPosition() / watchPosition()", regex: /\b(?:getCurrentPosition|watchPosition)\s*\(/ },
  { name: "Leaflet map.locate()", regex: /\.locate\s*\(/ },
];

function findViolations(text) {
  const violations = [];
  text.split(/\r?\n/).forEach((line, index) => {
    for (const { name, regex } of FORBIDDEN_PATTERNS) {
      if (regex.test(line)) {
        violations.push({ line: index + 1, pattern: name, code: line.trim() });
      }
    }
  });
  return violations;
}

function listSourceFiles(absDir) {
  const results = [];
  if (!fs.existsSync(absDir)) return results;
  for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
    const full = path.join(absDir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      results.push(...listSourceFiles(full));
    } else if (entry.isFile() && SOURCE_FILE.test(entry.name) && !TEST_FILE.test(entry.name) && !entry.name.endsWith(".d.ts")) {
      results.push(full);
    }
  }
  return results;
}

function toRepoRelative(absPath) {
  return path.relative(REPO_ROOT, absPath).split(path.sep).join("/");
}

const scannedFiles = SCAN_DIRS.flatMap((dir) => listSourceFiles(path.join(REPO_ROOT, dir)));

// --- 掃描器本身的自我驗證：確保它真的抓得到違規、也不會誤殺正常程式碼 ---

test("scanner self-check: flags every direct way of reaching the browser geolocation API", () => {
  const offenders = [
    "navigator.geolocation.getCurrentPosition(ok, fail);",
    "if (!navigator.geolocation) return;",
    "const geo = window.navigator.geolocation;",
    "navigator?.geolocation?.watchPosition(cb);",
    "navigator . geolocation",
    'const g = navigator["geolocation"];',
    "const { getCurrentPosition } = navigator.geolocation;",
    "getCurrentPosition(ok, fail);",
    "geo.watchPosition(cb);",
    "map.locate({ setView: true });",
    // 同一行先有字串裡的 `//` 再呼叫：不能被當成註解吞掉
    'const u = "https://example.com"; navigator.geolocation.getCurrentPosition(a, b);',
  ];
  for (const code of offenders) {
    assert.ok(findViolations(code).length > 0, `scanner must flag: ${code}`);
  }
});

test("scanner self-check: does not flag unrelated code", () => {
  const innocent = [
    "const geolocation = useSharedGeolocation();",
    "geolocation.refresh();",
    "if (geolocation.status === 'denied') return null;",
    "const located = locate;",
    "import { useSharedGeolocation } from '@/lib/hooks/useSharedGeolocation';",
    "navigator.permissions.query({ name: 'microphone' });",
    // 註解裡單純提到 API 名稱（沒有呼叫）不算違規
    "// getCurrentPosition 的 error callback 直接判斷 PERMISSION_DENIED",
  ];
  for (const code of innocent) {
    assert.deepEqual(findViolations(code), [], `scanner must not flag: ${code}`);
  }
});

test("scanner reports the correct line number", () => {
  const text = "line one\nline two\n  navigator.geolocation.getCurrentPosition(a, b);\n";
  const found = findViolations(text);
  assert.ok(found.length >= 1);
  assert.equal(found[0].line, 3);
});

// --- 掃描範圍的完整性檢查：避免「掃了個寂寞」 ---

test("the scan actually walks app/, components/ and lib/ (not an empty or misconfigured glob)", () => {
  assert.ok(scannedFiles.length > 100, `expected to scan well over 100 source files, got ${scannedFiles.length}`);
  const relative = scannedFiles.map(toRepoRelative);
  for (const dir of SCAN_DIRS) {
    assert.ok(
      relative.some((file) => file.startsWith(`${dir}/`)),
      `no source files found under ${dir}/`,
    );
  }
});

test("every allowlisted file exists and really does touch the browser geolocation API (a stale allowlist entry is a hole in the rule)", () => {
  for (const allowed of ALLOWLIST) {
    const abs = path.join(REPO_ROOT, allowed);
    assert.ok(fs.existsSync(abs), `allowlisted file is missing: ${allowed} (renamed or deleted? update ALLOWLIST)`);
    assert.ok(
      scannedFiles.map(toRepoRelative).includes(allowed),
      `allowlisted file is not within the scanned directories: ${allowed}`,
    );
    assert.ok(findViolations(fs.readFileSync(abs, "utf-8")).length > 0, `${allowed} no longer calls navigator.geolocation — remove it from ALLOWLIST`);
  }
});

// --- 規則本身 ---

test("PRD #438 §K: navigator.geolocation appears only in the shared geolocation hook", () => {
  const offenders = [];
  for (const abs of scannedFiles) {
    const rel = toRepoRelative(abs);
    if (ALLOWLIST.has(rel)) continue;
    for (const v of findViolations(fs.readFileSync(abs, "utf-8"))) {
      offenders.push(`${rel}:${v.line}  [${v.pattern}]  ${v.code}`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    [
      "Only lib/hooks/useSharedGeolocation.ts may call the browser geolocation API (PRD #438 §K).",
      "Use `useSharedGeolocation()` instead (pass `{ skip: true }` to locate only on an explicit refresh(),",
      "and `{ persist: false }` on pages that must not write to browser storage). Offending call sites:",
      ...offenders,
    ].join("\n"),
  );
});
