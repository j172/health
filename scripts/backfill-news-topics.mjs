#!/usr/bin/env node
/**
 * scripts/backfill-news-topics.mjs
 *
 * One-time backfill for issue #565 (新聞主題標籤). classifyNewsTopics()
 * (lib/server/news/classifyTopics.ts) is only ever invoked going forward by
 * the single news writer, lib/server/rss/persistItems.ts — and only on rows
 * it actually INSERTs/UPDATEs. An article whose payload_hash hasn't changed
 * takes persistItems.ts's early "unchanged" branch and never reaches the
 * classification call, so every article already in `news_items` before this
 * feature shipped would otherwise stay topic-less forever. This script
 * classifies the last `--days` (default 90, matching the site's news
 * freshness window) of existing news_items rows once, so /news?topic= and
 * the topic-scoped related-news query (lib/server/content/relatedNewsForTool.ts)
 * have something to show immediately after deploy.
 *
 * This is NOT a cron job — run it by hand, once, after this PR deploys:
 *   node --env-file=.env scripts/backfill-news-topics.mjs            # dry-run (default)
 *   node --env-file=.env scripts/backfill-news-topics.mjs --execute  # actually write
 *   node --env-file=.env scripts/backfill-news-topics.mjs --execute --days=180
 *
 * Direct-DB only (no admin-API path, unlike scripts/import-government-hotlines.mjs)
 * — this needs to run somewhere with real MYSQL_* env vars, i.e. on the
 * production host itself or against a tunnel to it. Local .env's
 * MYSQL_PASSWORD is known to be stale (see docs/domains memory), so run this
 * over SSH on the host where the app is actually deployed if the local
 * connection fails.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
if (typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile(path.resolve(__dirname, "../.env"));
  } catch {}
}

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const prefix = `--${name}=`;
  const match = args.find((a) => a.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
};

const EXECUTE = args.includes("--execute");
const DRY_RUN = !EXECUTE;
const DAYS = Number(getArg("days", "90"));
const BATCH_SIZE = Number(getArg("batch-size", "500"));

async function main() {
  console.log("==================================================================");
  console.log("  新聞主題一次性回填 (issue #565)");
  console.log("==================================================================");
  console.log(`模式: ${DRY_RUN ? "🔍 [DRY-RUN] 僅預覽統計，不寫入任何資料" : "⚡ [EXECUTE] 正式寫入 news_item_topics"}`);
  console.log(`回填範圍: 最近 ${DAYS} 天`);
  console.log(`批次大小: ${BATCH_SIZE}\n`);

  const { withConnection, utcNowSql } = await import("../lib/server/db/mysql.ts");
  const { classifyNewsTopics } = await import("../lib/server/news/classifyTopics.ts");

  await withConnection(async (conn) => {
    const [[{ total }]] = await conn.query(
      `
      SELECT COUNT(*) AS total
      FROM news_items
      WHERE COALESCE(published_at_utc, first_seen_at_utc) >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)
      `,
      [DAYS],
    );
    console.log(`📊 符合範圍的新聞總數: ${Number(total).toLocaleString()} 筆\n`);

    const topicCounts = new Map();
    let scanned = 0;
    let withAtLeastOneTopic = 0;
    let lastId = 0;

    for (;;) {
      const [rows] = await conn.query(
        `
        SELECT id, title, description_text, source_name
        FROM news_items
        WHERE id > ?
          AND COALESCE(published_at_utc, first_seen_at_utc) >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)
        ORDER BY id ASC
        LIMIT ?
        `,
        [lastId, DAYS, BATCH_SIZE],
      );
      if (rows.length === 0) break;

      for (const row of rows) {
        scanned += 1;
        lastId = row.id;

        const topics = classifyNewsTopics({
          title: row.title,
          summary: row.description_text,
          sourceName: row.source_name,
        });

        if (topics.length > 0) {
          withAtLeastOneTopic += 1;
          for (const topic of topics) {
            topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1);
          }
        }

        if (!DRY_RUN) {
          await conn.execute("DELETE FROM news_item_topics WHERE news_item_id = ?", [row.id]);
          const now = utcNowSql();
          for (const topic of topics) {
            await conn.execute(
              `
              INSERT INTO news_item_topics (news_item_id, topic, created_at)
              VALUES (?, ?, ?)
              `,
              [row.id, topic, now],
            );
          }
        }
      }

      console.log(`  ...已處理 ${scanned.toLocaleString()} / ${Number(total).toLocaleString()} 筆`);
    }

    console.log("\n==================================================================");
    console.log(`✅ 掃描完成: ${scanned.toLocaleString()} 筆`);
    console.log(`🏷️  至少命中一個主題: ${withAtLeastOneTopic.toLocaleString()} 筆`);
    for (const [topic, count] of topicCounts.entries()) {
      console.log(`   - ${topic}: ${count.toLocaleString()} 筆`);
    }
    if (DRY_RUN) {
      console.log("\nℹ️  [DRY-RUN] 若確認無誤，請加上 --execute 正式寫入 news_item_topics。");
    } else {
      console.log("\n🎉 回填完成，news_item_topics 已更新。");
    }
  });
}

main().catch((err) => {
  console.error("❌ 執行過程發生錯誤:", err);
  process.exit(1);
});
