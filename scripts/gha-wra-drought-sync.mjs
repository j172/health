/**
 * Fetches the 水利署枯旱限水通報 open-data feed from the GitHub runner and posts
 * it to the app.
 *
 * The app cannot fetch this itself: opendata.wra.gov.tw answers a server-side
 * request from the production host with an F5 Shape/BIG-IP JavaScript challenge
 * page (HTTP 200, Content-Type: text/html) instead of JSON. The same URL returns
 * 200 with real data from a GitHub Actions runner — measured, not assumed, via
 * .github/workflows/egress-probe.yml.
 *
 * The runner is only a transport. The app re-normalizes and re-filters every
 * record it receives.
 *
 * Usage:
 *   RSS_SYNC_ADMIN_SECRET=<secret> node scripts/gha-wra-drought-sync.mjs
 */

import { createSshLoopback, shellQuote } from "./lib/ssh-loopback.mjs";

const RESOURCE_ID = "51ea7202-18fd-46e3-adae-4d05bc827a28";
const FEED_URL = `https://opendata.wra.gov.tw/api/v2/${RESOURCE_ID}?sort=_importdate%20asc&format=JSON`;

const BASE = (process.env.APP_BASE_URL || "https://health.j172.tw").replace(
  /\/$/,
  "",
);
const SECRET =
  process.env.RSS_SYNC_ADMIN_SECRET || process.env.ADMIN_SECRET || "";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const SSH_HOST = process.env.SSH_HOST || "";
const SSH_PORT = process.env.SSH_PORT || "22";
const SSH_USER = process.env.SSH_USER || "";
const SSH_KEY_FILE = process.env.SSH_KEY_FILE || "";


if (!SECRET) {
  console.error("Missing RSS_SYNC_ADMIN_SECRET.");
  process.exit(1);
}

/** WRA's v2 API has used several envelope shapes; accept any of them. */
const extractRows = (parsed) => {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object") {
    for (const key of ["responseData", "data", "result", "records"]) {
      const candidate = parsed[key];
      if (Array.isArray(candidate)) return candidate;
      if (candidate && typeof candidate === "object" && Array.isArray(candidate.records)) {
        return candidate.records;
      }
    }
  }
  return [];
};

const main = async () => {
  const res = await fetch(FEED_URL, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    redirect: "follow",
    signal: AbortSignal.timeout(30000),
  });

  const contentType = res.headers.get("content-type") || "";
  const body = await res.text();

  if (!res.ok) {
    console.error(`WRA feed HTTP ${res.status}`);
    process.exit(1);
  }
  if (contentType.includes("text/html") || /^\s*<(!doctype|html)/i.test(body)) {
    // The runner is being challenged too — that is a real change worth failing on
    // rather than silently syncing nothing.
    console.error(
      "WRA returned a bot-protection challenge page to the runner as well. " +
        "Runner egress no longer bypasses it; the source needs an allowlist or a mirror.",
    );
    process.exit(1);
  }

  let rows;
  try {
    rows = extractRows(JSON.parse(body));
  } catch {
    console.error(`WRA feed was not valid JSON (${body.length} bytes, "${contentType}")`);
    process.exit(1);
  }

  console.log(`fetched ${rows.length} bulletin rows from WRA`);
  if (rows.length === 0) {
    console.error("WRA feed parsed but contained no rows — treating as a failure.");
    process.exit(1);
  }

  // Reduce to the latest bulletin per reservoir here rather than shipping the
  // whole 2012-onwards log across the wire. The app reduces again on receipt —
  // doing it twice is a no-op — so this is purely about payload size.
  const latest = new Map();
  const sortKey = (r) => String(r["通報日期"] ?? r.reportDate ?? "").replace(/\//g, "-");
  for (const row of rows) {
    const name = String(row["水庫名稱"] ?? row.reservoirName ?? "").trim();
    if (!name || !sortKey(row)) continue;
    const existing = latest.get(name);
    if (!existing || sortKey(row) > sortKey(existing)) latest.set(name, row);
  }
  const records = [...latest.values()];
  console.log(`reduced to ${records.length} active reservoirs`);

  // Posted over SSH to the app's own loopback, not to the public hostname:
  // Cloudflare bot protection answers a GitHub runner with a "Just a moment..."
  // challenge (HTTP 403), which is exactly what the OG backfill workflow hit and
  // why it uses this same transport.
  if (!SSH_HOST || !SSH_KEY_FILE) {
    console.error("Missing SSH_HOST/SSH_KEY_FILE — the public hostname is Cloudflare-challenged for runners.");
    process.exit(1);
  }

  const ssh = createSshLoopback({
    keyFile: SSH_KEY_FILE,
    host: SSH_HOST,
    port: SSH_PORT,
    user: SSH_USER,
  });

  const payload = JSON.stringify({ records });
  const remote = [
    "curl -sS --max-time 120",
    "-X POST http://127.0.0.1:3000/api/admin/wra-sync",
    '-H "content-type: application/json"',
    `-H ${shellQuote(`x-rss-sync-admin-secret: ${SECRET}`)}`,
    "--data-binary @-",
  ].join(" ");

  const result = ssh.call(remote, { input: payload });
  ssh.close();

  if (result.error) {
    console.error("ssh call failed:", result.error.message);
    process.exit(1);
  }

  const out = (result.stdout || "").trim();
  // ssh can prepend a banner, so take the last line that looks like a JSON object.
  const NEWLINE = String.fromCharCode(10);
  const jsonLine =
    out
      .split(NEWLINE)
      .map((line) => line.trim())
      .filter((line) => line.startsWith("{"))
      .pop() || out;
  let json;
  try {
    json = JSON.parse(jsonLine);
  } catch {
    console.error(`admin endpoint returned non-JSON: ${(result.stderr || "").slice(0, 200)} | ${jsonLine.slice(0, 300)}`);
    process.exit(1);
  }

  console.log(JSON.stringify(json));
  if (!json.ok) {
    console.error("wra-sync reported a failure");
    process.exit(1);
  }
  console.log(
    `done: ${json.result?.active ?? 0} active reservoirs, ${json.result?.upserted ?? 0} rows written`,
  );
};

main().catch((error) => {
  console.error("WRA sync failed:", error);
  process.exit(1);
});
