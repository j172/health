#!/usr/bin/env node
/**
 * External OG card-image backfill for GitHub Actions.
 *
 * Why: production shared-host IP is blocked by some publishers (ltn.com.tw
 * returns 403 for article HTML). GHA runners have clean egress — fetch HTML +
 * extract og:image here, then ask the app to re-host the CDN image URL.
 *
 * Transport (NEWS_IMAGES_TRANSPORT):
 *   ssh (default in deploy) — remote curl to 127.0.0.1:3000 on the app host.
 *     HawkHost disables TCP forwarding (AllowTcpForwarding no), so -L tunnels
 *     fail with "administratively prohibited" — confirmed live 2026-08-03.
 *   http — POST to NEWS_IMAGES_BASE_URL (local tunnel / loopback).
 *
 * Env:
 *   RSS_SYNC_ADMIN_SECRET
 *   NEWS_IMAGES_TRANSPORT=ssh|http
 *   NEWS_IMAGES_BASE_URL (http mode, default http://127.0.0.1:18080)
 *   SSH_HOST SSH_PORT SSH_USER SSH_KEY_FILE (ssh mode)
 *   OG_BACKFILL_LIMIT (default 20)
 *   OG_BACKFILL_ROUNDS (default 12)
 */
import { load } from "cheerio";
import { createSshLoopback, shellQuote } from "./lib/ssh-loopback.mjs";

const TRANSPORT = (process.env.NEWS_IMAGES_TRANSPORT || "http").toLowerCase();
const BASE = (
  process.env.NEWS_IMAGES_BASE_URL || "http://127.0.0.1:18080"
).replace(/\/$/, "");
const SECRET = process.env.RSS_SYNC_ADMIN_SECRET || "";
const LIMIT = Math.min(
  50,
  Math.max(1, Number(process.env.OG_BACKFILL_LIMIT || 20)),
);
const ROUNDS = Math.min(
  50,
  Math.max(1, Number(process.env.OG_BACKFILL_ROUNDS || 12)),
);
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const SSH_HOST = process.env.SSH_HOST || "";
const SSH_PORT = process.env.SSH_PORT || "22";
const SSH_USER = process.env.SSH_USER || "";
const SSH_KEY_FILE = process.env.SSH_KEY_FILE || "";

if (!SECRET) {
  console.error("Missing RSS_SYNC_ADMIN_SECRET");
  process.exit(1);
}
if (TRANSPORT === "ssh") {
  if (!SSH_HOST || !SSH_USER || !SSH_KEY_FILE) {
    console.error("ssh transport requires SSH_HOST, SSH_USER, SSH_KEY_FILE");
    process.exit(1);
  }
}

const ssh =
  TRANSPORT === "ssh"
    ? createSshLoopback({
        keyFile: SSH_KEY_FILE,
        host: SSH_HOST,
        port: SSH_PORT,
        user: SSH_USER,
      })
    : null;

const adminPostHttp = async (body) => {
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

const adminPostSsh = (body) => {
  const payload = JSON.stringify(body);
  // Run curl on the app host against loopback — no TCP forward needed.
  const remote = [
    "curl -sS --max-time 120",
    "-X POST http://127.0.0.1:3000/api/admin/news-images",
    '-H "content-type: application/json"',
    `-H ${shellQuote(`x-rss-sync-admin-secret: ${SECRET}`)}`,
    `-d ${shellQuote(payload)}`,
  ].join(" ");

  const result = ssh.call(remote);

  if (result.error) throw result.error;
  const out = (result.stdout || "").trim();
  const lines = out.split(/\r?\n/).filter((l) => l.trim().startsWith("{"));
  const text = lines.length ? lines[lines.length - 1] : out;
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(
      `ssh curl non-json exit=${result.status}: ${(result.stderr || "").slice(0, 200)} | ${text.slice(0, 200)}`,
    );
  }
  return { status: result.status === 0 ? 200 : 500, json };
};

const adminPost = async (body) => {
  if (TRANSPORT === "ssh") return adminPostSsh(body);
  return adminPostHttp(body);
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
      if (
        /logo|favicon|icon|sprite|placeholder|\/aa\.(png|gif)|\/x\.png|1x1|pixel|tracking/i.test(
          abs,
        )
      )
        continue;
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
  console.log(`transport=${TRANSPORT}`);
  let assigned = 0;
  let failed = 0;
  let skipped = 0;

  try {
    for (let round = 1; round <= ROUNDS; round += 1) {
      const { json: listed } = await adminPost({
        listMissing: true,
        limit: LIMIT,
      });
      if (!listed.ok) {
        console.error("list failed", listed);
        process.exitCode = 1;
        return;
      }
      const items = listed.items || [];
      console.log(`round ${round}: listed ${items.length}`);
      if (items.length === 0) break;

      let roundAssigned = 0;
      for (const item of items) {
        if (
          !item?.canonical_url ||
          /news\.google\.com/i.test(item.canonical_url)
        ) {
          skipped += 1;
          continue;
        }

        try {
          const page = await fetchHtml(item.canonical_url);
          if (!page.ok) {
            failed += 1;
            console.log(
              `fail id=${item.id} http=${page.status} src=${item.source_name}`,
            );
            continue;
          }
          const og = extractOgImage(page.html, item.canonical_url);
          if (!og) {
            failed += 1;
            console.log(`fail id=${item.id} no-og src=${item.source_name}`);
            continue;
          }

          const { json: attached } = await adminPost({
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
            console.log(
              `fail id=${item.id} attach=${attached.reason || "unknown"}`,
            );
          }
        } catch (err) {
          failed += 1;
          console.log(
            `fail id=${item.id} err=${err instanceof Error ? err.message : err}`,
          );
        }
      }

      if (roundAssigned === 0) {
        console.log("no assignments this round — stopping");
        break;
      }
    }

    console.log(JSON.stringify({ assigned, failed, skipped }));
  } finally {
    ssh?.close();
  }
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
