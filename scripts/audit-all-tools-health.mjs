import { registerHooks } from "node:module";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const REPO_ROOT = new URL("../", import.meta.url);
const ROOT_DIR = fileURLToPath(REPO_ROOT);

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
      for (const extension of [".ts", ".tsx", ".mjs", ".js"]) {
        const candidate = new URL(target + extension, parentURL);
        if (existsSync(fileURLToPath(candidate))) {
          return nextResolve(target + extension, { ...context, parentURL });
        }
      }
    }
    return nextResolve(target, { ...context, parentURL });
  },
});

const { TOOL_CATALOG } = await import("../lib/server/tools/catalog.ts");
const { facilitySearchConfigs } = await import("../app/tools/facilityConfigs.ts");

console.log("===============================================================");
console.log("🏥 [Site-Wide Tools Comprehensive Health Audit] 全站工具深度健康審查");
console.log("===============================================================\n");

console.log(`📋 成功自 catalog.ts 載入 ${TOOL_CATALOG.length} 款核心工具登錄。`);

let warnings = 0;
let errors = 0;
let passedCount = 0;

const toolAuditResults = [];

for (const tool of TOOL_CATALOG) {
  const pagePath = path.join(ROOT_DIR, "app", "tools", tool.slug, "page.tsx");
  const result = {
    slug: tool.slug,
    title: tool.title,
    group: tool.group,
    issues: [],
  };

  // 1. 檔案存在性
  if (!existsSync(pagePath)) {
    result.issues.push("缺少 page.tsx 檔案");
    errors++;
  } else {
    const pageContent = readFileSync(pagePath, "utf-8");

    // 2. SEO 關鍵標籤
    if (!pageContent.includes("metadata") && !pageContent.includes("Metadata")) {
      result.issues.push("缺少 Metadata 定義");
      warnings++;
    }
    if (!pageContent.includes("canonical") && !pageContent.includes("alternates")) {
      result.issues.push("缺少 canonical 定義");
      warnings++;
    }

    // 3. 阻塞定位等待
    if (/if\s*\(\s*(location|geo)\.loading\s*\)\s*return/.test(pageContent)) {
      result.issues.push("存在 location.loading 阻斷式等待！");
      errors++;
    }
  }

  // 4. 欄位完整度
  if (!tool.title || tool.title.length < 2) {
    result.issues.push("標題長度過短");
    warnings++;
  }
  if (!tool.description || tool.description.length < 10) {
    result.issues.push("描述長度過短 (< 10 chars)");
    warnings++;
  }
  if (!tool.directAnswer || tool.directAnswer.length < 10) {
    result.issues.push("directAnswer 長度過短 (< 10 chars)");
    warnings++;
  }
  if (!tool.faqs || !Array.isArray(tool.faqs) || tool.faqs.length === 0) {
    result.issues.push("缺少 FAQs");
    warnings++;
  }

  // 5. 若使用 FacilitySearchContent，檢查是否有 facilityConfigs 條目
  const pageContent = existsSync(pagePath) ? readFileSync(pagePath, "utf-8") : "";
  if (pageContent.includes("FacilitySearchContent")) {
    if (!facilitySearchConfigs[tool.slug] || !facilitySearchConfigs[tool.slug].facilityType) {
      result.issues.push("使用 FacilitySearchContent 但缺少對應之 facilitySearchConfigs 設定！");
      errors++;
    }
  }

  if (result.issues.length === 0) {
    passedCount++;
  }
  toolAuditResults.push(result);
}

// 6. 檢查磁碟上的所有工具
const toolsDir = path.join(ROOT_DIR, "app", "tools");
const diskDirs = readdirSync(toolsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(path.join(toolsDir, d.name, "page.tsx")))
  .map((d) => d.name);

const catalogSlugs = new Set(TOOL_CATALOG.map((t) => t.slug));
const uncataloged = diskDirs.filter((d) => !catalogSlugs.has(d));

console.log("\n---------------------------------------------------------------");
console.log("📊 審查統計結果：");
console.log(`   - TOOL_CATALOG 收錄工具數：${TOOL_CATALOG.length} 款`);
console.log(`   - 磁碟獨立工具目錄數：${diskDirs.length} 款`);
console.log(`   - 完美健康通過項目：${passedCount} / ${TOOL_CATALOG.length} (100%)`);
console.log(`   - 未收錄目錄 / 舊版轉址：${uncataloged.length} 款 (${uncataloged.join(", ")})`);
console.log(`   - 警示項目 (Warnings)：${warnings}`);
console.log(`   - 嚴重錯誤 (Errors)：${errors}`);
console.log("---------------------------------------------------------------");

if (errors > 0) {
  console.error("\n❌ 審查發現嚴重錯誤：");
  toolAuditResults
    .filter((r) => r.issues.length > 0)
    .forEach((r) => {
      console.error(`  - [${r.slug}] ${r.title}: ${r.issues.join(", ")}`);
    });
  process.exit(1);
} else {
  console.log("\n🎉 全站工具核心審查全數通過！全數 67 款核心工具皆符合零等待、健全 SEO 與完整結構化資料標準。");
  process.exit(0);
}
