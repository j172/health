import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

process.env.MYSQL_HOST = process.env.MYSQL_HOST || "127.0.0.1";
process.env.MYSQL_USER = process.env.MYSQL_USER || "root";
process.env.MYSQL_PASSWORD = process.env.MYSQL_PASSWORD || "";
process.env.MYSQL_DATABASE = process.env.MYSQL_DATABASE || "health_db";

const REPO_ROOT = new URL("../../../", import.meta.url);

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return { url: "data:text/javascript,", shortCircuit: true };
    }
    if (specifier === "@/lib/server/config/env" || specifier.endsWith("/env.ts")) {
      return { url: "data:text/javascript,export const env = { mysql: {} };", shortCircuit: true };
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

const { applySourceDiversity } = await import("./queries.ts");

test("applySourceDiversity: caps single source at maxPerSource", () => {
  const mockItems = [
    // 5 items from shih_hsin
    { id: 1, source_name: "shih_hsin", title: "世新 1" },
    { id: 2, source_name: "shih_hsin", title: "世新 2" },
    { id: 3, source_name: "shih_hsin", title: "世新 3" },
    { id: 4, source_name: "shih_hsin", title: "世新 4" },
    { id: 5, source_name: "shih_hsin", title: "世新 5" },
    // 3 items from cdc
    { id: 6, source_name: "cdc", title: "疾管署 1" },
    { id: 7, source_name: "cdc", title: "疾管署 2" },
    { id: 8, source_name: "cdc", title: "疾管署 3" },
    // 2 items from tfda
    { id: 9, source_name: "tfda", title: "食藥署 1" },
    { id: 10, source_name: "tfda", title: "食藥署 2" },
  ];

  // Request 8 items with max 3 per source
  const result = applySourceDiversity(mockItems, 8, 3);
  assert.equal(result.length, 8);

  const shihHsinCount = result.filter((r) => r.source_name === "shih_hsin").length;
  const cdcCount = result.filter((r) => r.source_name === "cdc").length;
  const tfdaCount = result.filter((r) => r.source_name === "tfda").length;

  assert.equal(shihHsinCount, 3);
  assert.equal(cdcCount, 3);
  assert.equal(tfdaCount, 2);

  // The first 3 shih_hsin items should be selected, 4 and 5 skipped
  assert.deepEqual(result.map((r) => r.id), [1, 2, 3, 6, 7, 8, 9, 10]);
});

test("applySourceDiversity: backfills from skipped items if pool is limited", () => {
  const mockItems = [
    // 6 items from a single source and 1 from another
    { id: 1, source_name: "cna", title: "中央社 1" },
    { id: 2, source_name: "cna", title: "中央社 2" },
    { id: 3, source_name: "cna", title: "中央社 3" },
    { id: 4, source_name: "cna", title: "中央社 4" },
    { id: 5, source_name: "cna", title: "中央社 5" },
    { id: 6, source_name: "cna", title: "中央社 6" },
    { id: 7, source_name: "mohw", title: "衛福部 1" },
  ];

  // Request 5 items with max 3 per source
  const result = applySourceDiversity(mockItems, 5, 3);
  assert.equal(result.length, 5);

  // Initially takes cna 1, 2, 3 and mohw 1 (total 4), then backfills cna 4 to make 5
  assert.deepEqual(result.map((r) => r.id), [1, 2, 3, 7, 4]);
});
