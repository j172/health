// 讓 Node 原生直接載入專案的 .ts 原始碼：處理 `@/` 別名、省略副檔名的相對匯入，
// 並把 `server-only` 換成空模組。與 tests/garbage-live-trucks-679.test.mjs 內聯的 hook 相同，
// 抽成檔案是為了讓測試能用 `node --import` 在子行程裡重用（例如驗證行程能否正常結束）。
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const REPO_ROOT = new URL("../../", import.meta.url);

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return { url: "data:text/javascript,", shortCircuit: true };
    }
    let target = specifier;
    // next 的子路徑匯入沒有副檔名，Node 的 ESM 解析器不認得
    if (specifier === "next/server") {
      target = "next/server.js";
    }
    let parentURL = context.parentURL;
    if (specifier.startsWith("@/")) {
      target = `./${specifier.slice(2)}`;
      parentURL = REPO_ROOT.href;
    }
    if (target.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(target)) {
      for (const extension of [".ts", ".tsx", ".mjs", ".js"]) {
        const candidate = new URL(target + extension, parentURL);
        if (existsSync(fileURLToPath(candidate))) {
          return nextResolve(target + extension, { ...context, parentURL });
        }
      }
    }
    try {
      return nextResolve(target, { ...context, parentURL });
    } catch (err) {
      if (!target.startsWith(".") && !target.startsWith("/") && !target.startsWith("file:") && existsSync("D:/GoogleDrive/health/node_modules")) {
        return nextResolve(target, { ...context, parentURL: "file:///D:/GoogleDrive/health/dummy.js" });
      }
      throw err;
    }
  },
});
