import { NextRequest, NextResponse } from "next/server";
import { requireAdminSecret } from "@/lib/server/config/adminAuth";
import { withConnection, utcNowSql } from "@/lib/server/db/mysql";
import { classifyNewsTopics } from "@/lib/server/news/classifyTopics";

export const runtime = "nodejs";

/**
 * POST /api/admin/news-topics-backfill — issue #565.
 *
 * `scripts/backfill-news-topics.mjs` does the same job but is "direct-DB
 * only (no admin-API path)" per its own doc comment — unlike every other
 * one-off import/backfill in this repo, which runs through an admin route
 * instead of needing a live MYSQL_* env and either host SSH access or a
 * working tunnel. This route closes that gap by running the exact same
 * query/classify/write loop inside the already-running app process, which
 * already has a live DB connection — no SSH, no scp, no risk to the host's
 * limited Entry Process budget from spawning an extra `node` process.
 *
 * `classifyNewsTopics` is only ever invoked going forward by the single
 * news writer (`persistItems.ts`), and only on rows it actually
 * inserts/updates — an unchanged row never reaches it. This backfills the
 * last `days` (default 90, the site's news-freshness window) of existing
 * `news_items` once, so `/news?topic=` and the topic-scoped related-news
 * query have something to show immediately, without waiting for every
 * article to naturally get re-ingested.
 *
 * Defaults to dry-run (mirrors the script's own safety default) — pass
 * `?execute=1` to actually write. Fire-and-forget 202, same as every other
 * `/api/admin/*-sync` route: the full scan can run past Cloudflare's
 * edge-proxy timeout, so this responds immediately and finishes in the
 * long-lived pm2 process; check server logs for the final counts.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const unauthorized = requireAdminSecret(request);
  if (unauthorized) return unauthorized;

  const params = request.nextUrl.searchParams;
  const execute = params.get("execute") === "1";
  const days = Number(params.get("days") || "90");
  const batchSize = Number(params.get("batchSize") || "500");

  runBackfill({ execute, days, batchSize })
    .then((summary) => console.log("news-topics-backfill result:", JSON.stringify(summary)))
    .catch((error) => console.error("news-topics-backfill failed:", error));

  return NextResponse.json({ ok: true, status: "started", execute, days, batchSize }, { status: 202 });
}

interface BackfillSummary {
  scanned: number;
  withAtLeastOneTopic: number;
  topicCounts: Record<string, number>;
  dryRun: boolean;
}

async function runBackfill({
  execute,
  days,
  batchSize,
}: {
  execute: boolean;
  days: number;
  batchSize: number;
}): Promise<BackfillSummary> {
  const dryRun = !execute;

  return withConnection(async (conn) => {
    const topicCounts: Record<string, number> = {};
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
        [lastId, days, batchSize],
      );
      const batch = rows as Array<{ id: number; title: string; description_text: string | null; source_name: string }>;
      if (batch.length === 0) break;

      for (const row of batch) {
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
            topicCounts[topic] = (topicCounts[topic] || 0) + 1;
          }
        }

        if (!dryRun) {
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
    }

    return { scanned, withAtLeastOneTopic, topicCounts, dryRun };
  });
}
