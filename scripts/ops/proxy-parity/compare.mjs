#!/usr/bin/env node
// 新舊代理路徑對照（#724）：同一個路徑分別走「PHP 前端控制器」與「LiteSpeed 直接代理的影子前綴」，
// 比對狀態碼、關鍵標頭與（解壓縮後的）內容。直連 origin IP，跳過 Cloudflare。
//
//   node scripts/ops/proxy-parity/compare.mjs --ip 103.21.221.12 --prefix /__direct [--paths a,b,c] [--json]
//
// 影子前綴必須先在 .htaccess 暫時加上 `RewriteRule ^__direct/(.*)$ http://127.0.0.1:3000/$1 [P,L]`
// （見 docs/domains/11-hosting-ops-incidents.md 的「直接代理」一節）；比對完要移除。
import https from "node:https";
import zlib from "node:zlib";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";

export const DEFAULT_PATHS = [
  "/", "/news", "/news/1389409", "/news/1318088", "/news/9999999999", "/news/",
  "/tools", "/tools/", "/tools/emergency-hotlines", "/tools/weather-alerts", "/tools/er-status",
  "/tools/accessible-transit", "/tools/nonexistent-tool", "/en", "/en/tools", "/ja/tools/accessible-transit",
  "/api/aqi", "/api/uv", "/api/water-outages", "/api/emergency-rooms", "/api/news?limit=3",
  "/robots.txt", "/sitemap.xml", "/news-sitemap.xml", "/feed.xml", "/llms.txt", "/privacy", "/nearby",
  "/guides/caring-for-elders", "/_next/static/nonexistent.js", "/this-path-does-not-exist",
];

// 這些標頭每次請求本來就會不同，不比對。
const VOLATILE = new Set(["transfer-encoding", "alt-svc", "date", "age", "x-nextjs-cache", "x-nextjs-stale-time", "cf-ray", "connection", "keep-alive", "content-length", "server", "x-litespeed-cache", "etag"]);

export function normalizeHeaders(headers) {
  const out = {};
  for (const [k, v] of Object.entries(headers)) {
    const key = k.toLowerCase();
    if (VOLATILE.has(key)) continue;
    out[key] = Array.isArray(v) ? v.join(", ") : String(v);
  }
  if (out["set-cookie"]) out["set-cookie"] = "(present)";
  return out;
}

// 內容裡每次都會變的片段（建置時間戳、nonce、RSC chunk 的隨機 id）先抹掉再算雜湊。
export function normalizeBody(text) {
  return text
    .replace(/\bcb=\d+/g, "cb=N")
    .replace(/"buildId":"[^"]+"/g, '"buildId":"B"')
    .replace(/nonce="[^"]*"/g, 'nonce=""')
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z/g, "TS");
}

export function diffResults(a, b) {
  const diffs = [];
  if (a.status !== b.status) diffs.push(`status ${a.status} vs ${b.status}`);
  const ha = a.headers, hb = b.headers;
  for (const k of new Set([...Object.keys(ha), ...Object.keys(hb)])) {
    if (ha[k] !== hb[k]) diffs.push(`header ${k}: ${JSON.stringify(ha[k])} vs ${JSON.stringify(hb[k])}`);
  }
  if (a.bodyHash !== b.bodyHash) diffs.push(`body ${a.bodyLen}B vs ${b.bodyLen}B (hash differs)`);
  return diffs;
}

export function request({ ip, host, path, method = "GET", headers = {} }) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      host: ip, servername: host, port: 443, path, method, rejectUnauthorized: false, timeout: 30000,
      headers: { host, "user-agent": "proxy-parity/1.0", "accept-encoding": "gzip", accept: "text/html,*/*", ...headers },
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        let buf = Buffer.concat(chunks);
        try { if (res.headers["content-encoding"] === "gzip") buf = zlib.gunzipSync(buf); } catch { /* keep raw */ }
        const text = buf.toString("utf8");
        resolve({
          status: res.statusCode,
          headers: normalizeHeaders(res.headers),
          bodyLen: buf.length,
          bodyHash: crypto.createHash("sha256").update(normalizeBody(text)).digest("hex").slice(0, 16),
        });
      });
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.end();
  });
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith("--") ? [...a, [x.slice(2), all[i + 1]?.startsWith("--") || all[i + 1] === undefined ? true : all[i + 1]]] : a), []));
  const ip = args.ip || "103.21.221.12";
  const host = args.host || "health.j172.tw";
  const prefix = args.prefix || "/__direct";
  const paths = typeof args.paths === "string" ? args.paths.split(",") : DEFAULT_PATHS;
  let bad = 0;
  const rows = [];
  for (const p of paths) {
    const sep = p.includes("?") ? "&" : "?";
    for (const method of ["GET", "HEAD"]) {
      if (method === "HEAD" && !/^\/(news\/\d+|tools|api\/aqi)$/.test(p)) continue;
      const via = (base) => request({ ip, host, path: `${base}${p}`, method });
      try {
        const [php, direct] = [await via(""), await via(prefix)];
        const diffs = diffResults(php, direct);
        rows.push({ path: p, method, php: php.status, direct: direct.status, diffs });
        if (diffs.length) bad++;
      } catch (e) {
        rows.push({ path: p, method, error: String(e) });
        bad++;
      }
      void sep;
    }
  }
  if (args.json) console.log(JSON.stringify(rows, null, 2));
  else {
    for (const r of rows) {
      console.log(`${r.error ? "ERR " : r.diffs.length ? "DIFF" : "ok  "} ${r.method.padEnd(4)} ${r.path}  php=${r.php ?? "-"} direct=${r.direct ?? "-"}${r.error ? " " + r.error : ""}`);
      for (const d of r.diffs ?? []) console.log(`       - ${d}`);
    }
    console.log(`\n${rows.length - bad}/${rows.length} identical`);
  }
  process.exit(bad ? 1 : 0);
}

// 只在直接執行時跑 main（被 import 做單元測試時不跑）。
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
