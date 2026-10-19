import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

// Issue #709：`cacheMaxMemorySize`（Next 記憶體內頁面快取上限，bytes）。
// 鍵名寫錯或放錯層級，Next 只會警告然後忽略，優化就悄悄失效，所以這裡直接用已安裝 Next 的
// 設定 schema 與原始碼確認：鍵在頂層、型別是數字、預設是 50 MB，而且伺服器真的拿它建快取。
// 不載入 .env、不啟動伺服器。

const require = createRequire(import.meta.url);
const nextConfig = require("../next.config.js");
const { configSchema } = require("next/dist/server/config-schema.js");
const { defaultConfig } = require("next/dist/server/config-shared.js");

const MB = 1024 * 1024;

test("next.config.js 把記憶體內頁面快取上限設在頂層，且比預設 50 MB 小", () => {
  assert.equal(typeof nextConfig.cacheMaxMemorySize, "number");
  assert.equal(nextConfig.cacheMaxMemorySize, 10 * MB);
  assert.ok(nextConfig.cacheMaxMemorySize < defaultConfig.cacheMaxMemorySize);
  assert.equal(nextConfig.experimental?.cacheMaxMemorySize, undefined, "這個鍵不在 experimental 底下");
});

test("整份 next.config.js 通過已安裝 Next 的設定 schema", () => {
  const result = configSchema.safeParse(nextConfig);
  assert.equal(result.success, true, result.success ? "" : JSON.stringify(result.error.issues));
  assert.equal(configSchema.safeParse({ cacheMaxMemorySize: "10MB" }).success, false, "型別必須是數字");
});

test("預設值是 50 MB，且 next-server 以 cacheMaxMemorySize 建立 ISR／fetch 記憶體快取", () => {
  assert.equal(defaultConfig.cacheMaxMemorySize, 50 * MB);
  const source = fs.readFileSync(require.resolve("next/dist/server/next-server.js"), "utf8");
  assert.match(source, /maxMemoryCacheSize:\s*this\.nextConfig\.cacheMaxMemorySize/);
});
