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
import {
  isGoogleNewsUrl,
  resolveGoogleNewsRedirect,
} from "../lib/server/net/resolveGoogleNewsRedirect.mjs";

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
    // Body arrives on stdin. It used to be interpolated into the command string,
    // which caps the payload at ARG_MAX — fine for a URL, impossible for image
    // bytes.
    "--data-binary @-",
  ].join(" ");

  const result = ssh.call(remote, {
    input: payload,
    retries: 4,
    retryDelayMs: 4000,
  });

  if (result.error) throw result.error;
  if (result.status === 255) {
    console.warn("Host SSH / LVE process limit saturated (exit 255) during adminPostSsh.");
    return {
      status: 503,
      json: {
        ok: false,
        reason: "host_lve_saturated_exit_255",
        hostLveSaturated: true,
      },
    };
  }
  const out = (result.stdout || "").trim();
  const lines = out.split(/\r?\n/).filter((l) => l.trim().startsWith("{"));
  const text = lines.length ? lines[lines.length - 1] : out;
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    const isTransientRestart =
      (result.stderr || "").includes("curl: (52) Empty reply") ||
      (result.stderr || "").includes("curl: (56) Recv failure") ||
      (result.stderr || "").includes("curl: (7) Failed to connect");

    if (isTransientRestart) {
      console.warn(
        `Host server is temporarily restarting/rebooting (curl exit ${result.status}). Returning non-fatal 503 to allow graceful deferral.`,
      );
      return {
        status: 503,
        json: {
          ok: false,
          reason: "host_server_restarting_transient_exit_52",
          hostServerRestarting: true,
        },
      };
    }

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
    $('link[rel="image_src"]').attr("href"),
  ];

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const text = $(el).text();
      if (!text || (!text.includes("image") && !text.includes("thumbnailUrl")))
        return;
      const data = JSON.parse(text);
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (!item || typeof item !== "object") continue;
        const img = item.image || item.thumbnailUrl;
        if (typeof img === "string") {
          raws.push(img);
        } else if (Array.isArray(img)) {
          for (const sub of img) {
            if (typeof sub === "string") raws.push(sub);
            else if (
              sub &&
              typeof sub === "object" &&
              typeof sub.url === "string"
            )
              raws.push(sub.url);
          }
        } else if (
          img &&
          typeof img === "object" &&
          typeof img.url === "string"
        ) {
          raws.push(img.url);
        }
      }
    } catch {
      // ignore
    }
  });

  for (const raw of raws) {
    if (!raw?.trim()) continue;
    try {
      const abs = new URL(raw.trim(), baseUrl).toString();
      if (!/^https?:\/\//i.test(abs)) continue;
      if (
        /logo|favicon|icon|sprite|placeholder|\/aa\.(png|gif)|\/x\.png|1x1|pixel|tracking|default_logo/i.test(
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
  const referer = (() => {
    try {
      return new URL(url).origin + "/";
    } catch {
      return undefined;
    }
  })();
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8",
      ...(referer ? { Referer: referer } : {}),
    },
    redirect: "follow",
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) return { ok: false, status: res.status, html: "" };
  const html = await res.text();
  return { ok: true, status: res.status, html };
};

/** Runner-side ceiling; the server enforces its own as well. */
const MAX_RUNNER_IMAGE_BYTES = 8 * 1024 * 1024;

/**
 * Fetches the image from the runner rather than letting the host do it.
 *
 * Several Taiwanese CDNs refuse the shared host's IP — one run logged 33 items
 * as `http-status 403` from pgw.udn.com.tw — while the runner, which already
 * fetched the article HTML from the same site, gets 200. Returns null on any
 * problem so the caller can fall back to asking the host to fetch the URL.
 */
const fetchImageBytes = async (imageUrl, refererUrl) => {
  try {
    const res = await fetch(imageUrl, {
      headers: {
        "User-Agent": UA,
        Accept: "image/webp,image/png,image/jpeg,image/gif,*/*",
        Referer: refererUrl,
      },
      redirect: "follow",
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok)
      return { ok: false, reason: `runner fetch http ${res.status}` };

    const contentType = (res.headers.get("content-type") || "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    const declared = Number(res.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > MAX_RUNNER_IMAGE_BYTES) {
      return { ok: false, reason: `runner fetch too large (${declared}B)` };
    }

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0) return { ok: false, reason: "runner fetch empty" };
    if (buf.length > MAX_RUNNER_IMAGE_BYTES) {
      return { ok: false, reason: `runner fetch too large (${buf.length}B)` };
    }
    return { ok: true, base64: buf.toString("base64"), contentType };
  } catch (err) {
    return {
      ok: false,
      reason: `runner fetch failed: ${err instanceof Error ? err.message : err}`,
    };
  }
};

const main = async () => {
  console.log(`transport=${TRANSPORT}`);
  let assigned = 0;
  let failed = 0;
  let skipped = 0;

  try {
    let consecutiveEmptyRounds = 0;
    for (let round = 1; round <= ROUNDS; round += 1) {
      const { json: listed } = await adminPost({
        listMissing: true,
        limit: LIMIT,
        newerThanHours: Number(process.env.OG_BACKFILL_HOURS || 336),
      });
      if (listed.hostLveSaturated || listed.hostServerRestarting) {
        console.warn(
          `Host server saturated or rebooting (${listed.reason || "transient"}). Exiting batch runner gracefully (exit 0) to defer to next schedule.`,
        );
        return;
      }
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
        if (!item?.canonical_url) {
          skipped += 1;
          continue;
        }

        const markFailed = async (reason) => {
          failed += 1;
          try {
            await adminPost({ markFailed: true, newsItemId: item.id });
          } catch {
            // non-fatal failure reporting
          }
        };

        // Google News RSS <link> values are an "article shell" URL, not the
        // publisher's — no og:image lives on that page (Google's own logo,
        // at best). Try to resolve the real article URL first (bounded
        // hops, short timeout, shared with fetchOpenGraphImage.ts and
        // backfillOgImages.ts — see resolveGoogleNewsRedirect.mjs); if that
        // fails, mark the attempt and move on exactly as the old
        // skip-outright behavior did, just now counted as a real attempt.
        let targetUrl = item.canonical_url;
        if (isGoogleNewsUrl(item.canonical_url)) {
          const resolved = await resolveGoogleNewsRedirect(item.canonical_url);
          if (!resolved) {
            await markFailed("google news url unresolved");
            console.log(
              `fail id=${item.id} google-news-unresolved src=${item.source_name}`,
            );
            continue;
          }
          targetUrl = resolved;
        }

        try {
          const page = await fetchHtml(targetUrl);
          if (!page.ok) {
            await markFailed(`http ${page.status}`);
            console.log(
              `fail id=${item.id} http=${page.status} src=${item.source_name}`,
            );
            continue;
          }
          const og = extractOgImage(page.html, targetUrl);
          if (!og) {
            await markFailed("no-og");
            console.log(`fail id=${item.id} no-og src=${item.source_name}`);
            continue;
          }

          // Prefer runner egress; fall back to asking the host to fetch the
          // URL itself, which still works for CDNs that do not block it.
          const bytes = await fetchImageBytes(og, targetUrl);
          const { json: attached } = bytes.ok
            ? await adminPost({
                attachImageBytes: true,
                newsItemId: item.id,
                contentBase64: bytes.base64,
                contentType: bytes.contentType,
                title: item.title || null,
              })
            : await adminPost({
                attachImageUrl: true,
                newsItemId: item.id,
                imageUrl: og,
                title: item.title || null,
              });

          if (attached.hostLveSaturated || attached.hostServerRestarting) {
            console.warn(
              `Host server saturated or rebooting during attachImage (${attached.reason || "transient"}). Exiting batch runner gracefully (exit 0) to allow server recovery.`,
            );
            return;
          }

          if (attached.ok) {
            assigned += 1;
            roundAssigned += 1;
            console.log(`ok id=${item.id} path=${attached.localPath}`);
          } else {
            await markFailed(attached.reason || "unknown");
            console.log(
              `fail id=${item.id} src=${item.source_name} attach=${attached.reason || "unknown"}`,
            );
          }
        } catch (err) {
          await markFailed(err instanceof Error ? err.message : String(err));
          console.log(
            `fail id=${item.id} err=${err instanceof Error ? err.message : err}`,
          );
        }
      }

      if (roundAssigned === 0) {
        consecutiveEmptyRounds += 1;
        if (consecutiveEmptyRounds >= 3) {
          console.log("3 consecutive rounds without assignments — stopping");
          break;
        }
      } else {
        consecutiveEmptyRounds = 0;
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
