#!/usr/bin/env node
/**
 * External OG card-image backfill for GitHub Actions.
 *
 * Why: the production shared-host IP is blocked by some publishers (ltn.com.tw
 * returns 403 for article HTML). GHA runners have clean egress — fetch HTML +
 * extract og:image here, then ask the app (via SSH tunnel to loopback) to
 * re-host the CDN image URL into news_assets.
 *
 * Env:
 *   RSS_SYNC_ADMIN_SECRET  admin header
 *   NEWS_IMAGES_BASE_URL   default http://127.0.0.1:18080
 *   OG_BACKFILL_LIMIT      items per list call (default 20)
 *   OG_BACKFILL_ROUNDS     list rounds (default 15)
 */
import { load } from "cheerio";

const BASE = (process.env.NEWS_IMAGES_BASE_URL || "http://127.0.0.1:18080").replace(/\/$/, "");
const SECRET = process.env.RSS_SYNC_ADMIN_SECRET || "";
const LIMIT = Math.min(50, Math.max(1, Number(process.env.OG_BACKFILL_LIMIT || 20)));
const ROUNDS = Math.min(50, Math.max(1, Number(process.env.OG_BACKFILL_ROUNDS || 15)));
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

if (!SECRET) {
  console.error("Missing RSS_SYNC_ADMIN_SECRET");
  process.exit(1);
}

const adminPost = async (body) => {
  const res = await fetch(`${BASE}/api/admin/news-images`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-rss-sync-admin-secret": SECRET,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`non-json ${res.status}: ${text.slice(0, 200)}`);
  }
  return { status: res.status, json };
};

const extractOgImage = (html, baseUrl) => {
  const $ = load(html);
  const raws = [
    $('meta[property="og:image"]').attr("content"),
    $('meta[property="og:image:secure_url"]').attr("content"),
    $('meta[property="og:image:url"]').attr("content"),
    $('meta[name="twitter:image"]').attr("content"),
    $('meta[name="twitter:image:src"]').attr("content"),
  ];
  for (const raw of raws) {
    if (!raw?.trim()) continue;
    try {
      const abs = new URL(raw.trim(), baseUrl).toString();
      if (!/^https?:\/\//i.test(abs)) continue;
      if (/logo|favicon|icon|sprite|placeholder|\/aa\.(png|gif)|\/x\.png|1x1|pixel|tracking/i.test(abs)) continue;
      return abs;
    } catch {
      /* next */
    }
  }
  return null;
};

const fetchHtml = async (url) => {
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) return { ok: false, status: res.status, html: "" };
  const html = await res.text();
  return { ok: true, status: res.status, html };
};

const main = async () => {
  let assigned = 0;
  let failed = 0;
  let skipped = 0;

  for (let round = 1; round <= ROUNDS; round += 1) {
    const { json: listed } = await adminPost({ listMissing: true, limit: LIMIT });
    if (!listed.ok) {
      console.error("list failed", listed);
      process.exit(1);
    }
    const items = listed.items || [];
    console.log(`round ${round}: listed ${items.length}`);
    if (items.length === 0) break;

    let roundAssigned = 0;
    for (const item of items) {
      if (!item?.canonical_url || /news\.google\.com/i.test(item.canonical_url)) {
        skipped += 1;
        continue;
      }

      try {
        const page = await fetchHtml(item.canonical_url);
        if (!page.ok) {
          failed += 1;
          console.log(`fail id=${item.id} http=${page.status} src=${item.source_name}`);
          continue;
        }
        const og = extractOgImage(page.html, item.canonical_url);
        if (!og) {
          failed += 1;
          console.log(`fail id=${item.id} no-og src=${item.source_name}`);
          continue;
        }

        const { status, json: attached } = await adminPost({
          attachImageUrl: true,
          newsItemId: item.id,
          imageUrl: og,
          title: item.title || null,
        });

        if (attached.ok) {
          assigned += 1;
          roundAssigned += 1;
          console.log(`ok id=${item.id} path=${attached.localPath}`);
        } else {
          failed += 1;
          console.log(`fail id=${item.id} attach=${attached.reason || status}`);
        }
      } catch (err) {
        failed += 1;
        console.log(`fail id=${item.id} err=${err instanceof Error ? err.message : err}`);
      }
    }

    if (roundAssigned === 0) {
      console.log("no assignments this round — stopping");
      break;
    }
  }

  console.log(JSON.stringify({ assigned, failed, skipped }));
  // Non-zero only on hard failure; partial success is still a green deploy step.
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
