import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { registerHooks } from "node:module";

const REPO_ROOT = new URL("../../../", import.meta.url);

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
        if (existsSyncSafe(candidate)) {
          return nextResolve(target + extension, { ...context, parentURL });
        }
      }
    }
    return nextResolve(target, { ...context, parentURL });
  },
});

function existsSyncSafe(url) {
  try {
    return fs.existsSync(fileURLToPath(url));
  } catch {
    return false;
  }
}

const { parseOdsFirstSheet } = await import("./ods.ts");

// Real ODS structure sliced down to 5 real rows sampled from data.gov.tw
// 130229's actual export (issue #613) — including the same
// table:number-columns-repeated (16375 blank trailing cells per row) and
// table:number-rows-repeated (1,047,235-row blank padding row at the end)
// artifacts the real file carries, so this test exercises the exact shape
// parseOdsFirstSheet has to tolerate in production, not a simplified one.
const FIXTURE_PATH = path.join(fileURLToPath(REPO_ROOT), "lib/server/facilities/__fixtures__/early-intervention-130229-sample.ods");

function loadFixtureRows() {
  const buffer = fs.readFileSync(FIXTURE_PATH);
  return parseOdsFirstSheet(buffer);
}

test("real fixture (130229 sample): parses the real header row", () => {
  const rows = loadFixtureRows();
  assert.equal(rows.length, 5);
  assert.deepEqual(Object.keys(rows[0]), ["縣市", "鄉鎮市區", "單位別", "服務方式", "單位名稱", "地址", "連絡電話", "療育服務內容", "服務時間"]);
});

test("real fixture: reads real row values across all 3 單位別 and multiple 服務方式 combinations", () => {
  const rows = loadFixtureRows();
  assert.equal(rows[0]["單位別"], "衛生單位");
  assert.equal(rows[0]["服務方式"], "時段");
  assert.equal(rows[0]["單位名稱"], "中英醫療社團法人板英醫院");
  assert.equal(rows[0]["地址"], "新北市板橋區文化路1段269號");

  assert.equal(rows[1]["單位別"], "社福單位");
  assert.equal(rows[1]["服務方式"], "日間");

  assert.equal(rows[2]["單位別"], "教育單位");

  assert.equal(rows[3]["服務方式"], "到宅");

  assert.equal(rows[4]["服務方式"], "日間、時段、到宅");
});

test("real fixture: tolerates a legitimately blank 療育服務內容 cell (self-closing table:table-cell with no text:p)", () => {
  const rows = loadFixtureRows();
  assert.equal(rows[1]["療育服務內容"], "");
});

test("real fixture: the huge table:number-columns-repeated filler cell never leaks into the row objects", () => {
  const rows = loadFixtureRows();
  for (const row of rows) {
    assert.equal(Object.keys(row).length, 9);
  }
});

test("real fixture: the huge table:number-rows-repeated blank padding row at the end produces no extra rows", () => {
  const rows = loadFixtureRows();
  assert.equal(rows.length, 5);
});

test("parseOdsFirstSheet: throws on a non-ODS buffer", () => {
  assert.throws(() => parseOdsFirstSheet(Buffer.from("not a zip file")));
});

test("parseOdsFirstSheet: returns an empty array for a sheet with only a header row", async () => {
  // Build a minimal in-memory ODS (header-only) without needing a fixture file.
  const { default: AdmZip } = await import("adm-zip");
  const header = ["縣市", "單位名稱"];
  const content = `<?xml version="1.0" encoding="UTF-8"?><office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"><office:body><office:spreadsheet><table:table table:name="Sheet1"><table:table-row>${header
    .map((h) => `<table:table-cell office:value-type="string"><text:p>${h}</text:p></table:table-cell>`)
    .join("")}</table:table-row></table:table></office:spreadsheet></office:body></office:document-content>`;
  const zip = new AdmZip();
  zip.addFile("content.xml", Buffer.from(content, "utf-8"));
  const rows = parseOdsFirstSheet(zip.toBuffer());
  assert.deepEqual(rows, []);
});
