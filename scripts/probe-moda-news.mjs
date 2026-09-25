import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const REPO_ROOT = new URL("../", import.meta.url);

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
        if (existsSync(fileURLToPath(candidate))) {
          return nextResolve(target + extension, { ...context, parentURL });
        }
      }
    }
    return nextResolve(target, { ...context, parentURL });
  },
});

const { fetchModaNews } = await import("../lib/server/rss/fetchModaNews.ts");

console.log("[probe-moda-news] Probing moda.gov.tw press releases (2 pages)...");
const result = await fetchModaNews({ pages: 2 });

console.log(`[probe-moda-news] Result ok: ${result.ok}, status: ${result.httpStatus}, count: ${result.itemCount}`);
if (!result.ok) {
  console.error(`[probe-moda-news] Error: ${result.errorMessage}`);
  process.exit(1);
}

for (let i = 0; i < Math.min(5, result.items.length); i++) {
  const item = result.items[i];
  console.log(`  [${i + 1}] (${item.deptName} | ${item.publishedAtUtc?.toISOString().slice(0, 10)}) ${item.title}`);
  console.log(`      URL: ${item.canonicalUrl}`);
  console.log(`      Tags: ${item.categoryRaw}`);
}

console.log(`[probe-moda-news] Successfully verified ${result.itemCount} items!`);
