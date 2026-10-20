import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

// Issue #709：`experimental.preloadEntriesOnStart: false`。
// Next 把設定寫錯（鍵名拼錯、被改名）只會警告然後忽略，記憶體優化就悄悄失效，
// 所以這裡直接用「已安裝的 Next 自己的設定 schema 與原始碼」確認這個鍵在這個版本真的存在、
// 型別正確、而且 next-server 真的讀它。不載入 .env、不啟動伺服器。

const require = createRequire(import.meta.url);
const nextConfig = require("../next.config.js");
const { configSchema } = require("next/dist/server/config-schema.js");
const { defaultConfig } = require("next/dist/server/config-shared.js");

test("next.config.js 關閉開機預載全部路由（experimental.preloadEntriesOnStart: false）", () => {
  assert.equal(nextConfig.experimental?.preloadEntriesOnStart, false);
});

test("整份 next.config.js 通過已安裝 Next 的設定 schema（experimental 為 strict，拼錯的鍵會被擋下）", () => {
  const result = configSchema.safeParse(nextConfig);
  assert.equal(result.success, true, result.success ? "" : JSON.stringify(result.error.issues));
  assert.equal(
    configSchema.safeParse({ experimental: { preloadEntriesOnStartTypo: false } }).success,
    false,
    "schema 應拒絕未知的 experimental 鍵，否則這個測試擋不住拼錯",
  );
});

test("預設值是 true，所以只有明確寫 false 才會改變行為", () => {
  assert.equal(defaultConfig.experimental.preloadEntriesOnStart, true);
});

test("next-server 仍然以 experimental.preloadEntriesOnStart 決定要不要 unstable_preloadEntries", () => {
  const source = fs.readFileSync(require.resolve("next/dist/server/next-server.js"), "utf8");
  assert.match(
    source,
    /!options\.dev\s*&&\s*!this\.minimalMode\s*&&\s*this\.nextConfig\.experimental\.preloadEntriesOnStart\)\s*\{\s*this\.unstable_preloadEntries\(\)/,
  );
});
