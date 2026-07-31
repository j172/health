import fs from "node:fs";
import path from "node:path";

// Load .env manually if process.env isn't populated
function loadEnv() {
  const envPath = path.join(process.cwd(), ".env");
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        const value = trimmed.slice(eqIdx + 1).trim();
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    }
  }
}

loadEnv();

const baseUrl = (process.env.APP_BASE_URL || "https://health.j172.tw").replace(/\/$/, "");
const adminSecret = process.env.RSS_SYNC_ADMIN_SECRET || "";

if (!adminSecret) {
  console.error("❌ ERROR: RSS_SYNC_ADMIN_SECRET is missing in .env");
  process.exit(1);
}

const headers = {
  "Content-Type": "application/json",
  "x-rss-sync-admin-secret": adminSecret,
};

// ─── Stage 1: News Image Backfill ─────────────────────────────────────────────

async function backfillNewsImages() {
  console.log("\n========================================================");
  console.log("📸 [Stage 1] 新聞文章補圖 (Jieba + Pixabay + LOGO)");
  console.log("========================================================\n");

  try {
    console.log("🧹 正在清理舊的 Pixabay API 快取...");
    await fetch(`${baseUrl}/api/admin/news-images`, {
      method: "POST",
      headers,
      body: JSON.stringify({ clearCache: true }),
    });
  } catch {
    // Ignore cache clear failure
  }

  let totalAssigned = 0;
  let totalFailed = 0;
  let round = 1;

  while (true) {
    console.log(`▶ [Round ${round}] 正在向 ${baseUrl}/api/admin/news-images 請求 3 篇補圖...`);
    try {
      const res = await fetch(`${baseUrl}/api/admin/news-images`, {
        method: "POST",
        headers,
        body: JSON.stringify({ limit: 3 }),
      });

      if (!res.ok) {
        console.error(`❌ HTTP Error: ${res.status} ${res.statusText}`);
        const errText = await res.text();
        console.error(`  Detail: ${errText}`);
        break;
      }

      const data = await res.json();
      if (!data.ok) {
        console.error("❌ API 返回失敗:", data.error);
        break;
      }

      const s = data.summary || {};
      console.log(
        `  ✓ 完成: 配對成功 ${s.assigned ?? 0} 篇 | 成功已存在跳過 ${s.skipped ?? 0} 篇 | 無圖失敗 ${s.failed ?? 0} 篇`,
      );

      totalAssigned += s.assigned ?? 0;
      totalFailed += s.failed ?? 0;

      if (s.rateLimited) {
        console.log(`⚠️ Pixabay API Rate Limit 已達上限: ${s.reason}`);
        break;
      }

      if ((s.assigned ?? 0) === 0 && (s.failed ?? 0) === 0) {
        console.log("🎉 所有新聞文章已全部檢查完成（無剩餘缺圖文章）！");
        break;
      }

      round++;
      // Wait 1.5s between rounds to respect API rates
      await new Promise((r) => setTimeout(r, 1500));
    } catch (err) {
      console.error("❌ 網路連線錯誤:", err instanceof Error ? err.message : err);
      break;
    }
  }

  console.log(`\n📊 [新聞補圖總計] 成功分配圖片: ${totalAssigned} 篇 | 無可用候選圖: ${totalFailed} 篇`);
}

// ─── Stage 2: Facility Geocoding Backfill ────────────────────────────────────

const FACILITY_SOURCES = [
  { facilityType: "clinic", sourceKey: "nhi-clinics", label: "診所" },
  { facilityType: "pharmacy", sourceKey: "nhi-pharmacies", label: "藥局" },
  { facilityType: "ltc-contracted", sourceKey: "mohw-ltc-contracted", label: "長照特約機構" },
  { facilityType: "elder-welfare", sourceKey: "mohw-elder-welfare", label: "老人福利機構" },
  { facilityType: "disability-welfare", sourceKey: "mohw-disability-welfare", label: "身障福利機構" },
  { facilityType: "health-check", sourceKey: "hpa-health-checks", label: "健檢機構" },
];

async function geocodeFacilities() {
  console.log("\n========================================================");
  console.log("🗺️ [Stage 2] 機構地理座標 Geocoding (Google/OpenCage/Nominatim)");
  console.log("========================================================\n");

  let grandGeocoded = 0;
  let grandFailed = 0;

  for (const item of FACILITY_SOURCES) {
    console.log(`\n📍 正在檢查 [${item.label}] (${item.facilityType} / ${item.sourceKey})...`);
    let sourceGeocoded = 0;
    let sourceFailed = 0;
    let round = 1;

    while (true) {
      try {
        const res = await fetch(`${baseUrl}/api/admin/facilities-geocode`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            facilityType: item.facilityType,
            sourceKey: item.sourceKey,
            limit: 20,
          }),
        });

        if (!res.ok) {
          console.error(`❌ HTTP Error ${res.status} for ${item.label}`);
          break;
        }

        const data = await res.json();
        if (!data.ok) {
          console.error(`❌ API Error for ${item.label}:`, data.error);
          break;
        }

        const s = data.summary || {};
        const attempted = s.attempted ?? 0;
        const geocoded = s.geocoded ?? 0;
        const failed = s.failed ?? 0;

        if (attempted === 0) {
          console.log(`  ✓ [${item.label}] 已無缺座標之機構。`);
          break;
        }

        console.log(`  ▶ [${item.label} Round ${round}] 嘗試 ${attempted} 家 | 成功座標化 ${geocoded} 家 | 失敗 ${failed} 家`);
        sourceGeocoded += geocoded;
        sourceFailed += failed;
        grandGeocoded += geocoded;
        grandFailed += failed;

        if (attempted < 20) {
          console.log(`  ✓ [${item.label}] 此類別批次處理完成！`);
          break;
        }

        round++;
        // Wait 1.5s between geocode rounds
        await new Promise((r) => setTimeout(r, 1500));
      } catch (err) {
        console.error(`❌ 網路錯誤 [${item.label}]:`, err instanceof Error ? err.message : err);
        break;
      }
    }

    console.log(`📊 [${item.label} 小計] 成功座標化 ${sourceGeocoded} 家 | 失敗 ${sourceFailed} 家`);
  }

  console.log(`\n========================================================`);
  console.log(`🎉 [全站機構座標總計] 成功取得座標: ${grandGeocoded} 家 | 失敗無法定位: ${grandFailed} 家`);
  console.log(`========================================================\n`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`🚀 開始線上資料庫批次補全任務`);
  console.log(`🔗 目標網站: ${baseUrl}`);

  await backfillNewsImages();
  await geocodeFacilities();

  console.log("✅ 批次任務全數完成！");
}

main().catch((err) => {
  console.error("FATAL ERROR:", err);
  process.exit(1);
});
