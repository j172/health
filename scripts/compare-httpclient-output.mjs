#!/usr/bin/env node
// Old vs new lib/server/net/httpClient.ts, request by request (issue #699).
//
// httpClient.ts is shared by every server-side fetch in the app (feeds, scrapers, open-data syncs, the AI client), so a
// change to it must not change what any of them receive. This script loads the version on origin/main (via `git show`,
// into a temp dir) and the working-tree version, sends the SAME requests through both against a local server that
// plays every kind of response the app meets, and compares:
//   - what the server sees  (method, path, and the request headers the client chose to send)
//   - what the caller gets   (status, response headers, the body byte for byte — or the error it is rejected with)
//
//   node scripts/compare-httpclient-output.mjs [--base origin/main]
//
// Exit code 1 on any difference. Differences that are intentional are listed under INTENDED below and are not
// compared: they are the new options (`truncateAtBytes`) and the decoded-size guard for gzip bombs.
import http from "node:http";
import zlib from "node:zlib";
import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { registerRepoHooks } from "../lib/server/garbageRoutes/testSupport/repoHooks.mjs";

const baseRef = process.argv.includes("--base") ? process.argv[process.argv.indexOf("--base") + 1] : "origin/main";

const shown = spawnSync("git", ["show", `${baseRef}:lib/server/net/httpClient.ts`], { encoding: "utf-8", maxBuffer: 16 * 1024 * 1024 });
if (shown.status !== 0) {
  console.error(`cannot read ${baseRef}:lib/server/net/httpClient.ts: ${shown.stderr}`);
  process.exit(2);
}
const dir = mkdtempSync(join(tmpdir(), "httpclient-legacy-"));
writeFileSync(join(dir, "httpClient.ts"), shown.stdout);

registerRepoHooks();
const legacy = await import(pathToFileURL(join(dir, "httpClient.ts")).href);
const current = await import(new URL("../lib/server/net/httpClient.ts", import.meta.url).href);

// ---- a server that plays every kind of response ---------------------------------------------------------------
const TEXT = Array.from({ length: 6000 }, (_, i) => `第${i}行 衛生福利部公告 ${createHash("md5").update(String(i)).digest("hex")}`).join("\n");
const BINARY = randomBytes(5 * 1024 * 1024);
const seenByServer = [];

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  const route = url.pathname;
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const { host, connection, ...visibleHeaders } = req.headers; // host/connection differ by port and by agent state
    seenByServer.push({ route, method: req.method, headers: visibleHeaders, body: Buffer.concat(chunks).toString("utf-8") });
    const send = (status, headers, body) => {
      res.writeHead(status, headers);
      for (let i = 0; i < body.length; i += 16384) res.write(body.subarray(i, i + 16384));
      res.end();
    };
    const text = Buffer.from(TEXT);
    switch (route) {
      case "/plain": return send(200, { "Content-Type": "text/plain; charset=utf-8", "Content-Length": text.length, "X-Custom": "a" }, text);
      case "/chunked": return send(200, { "Content-Type": "text/plain" }, text);
      case "/gzip": { const b = zlib.gzipSync(text); return send(200, { "Content-Encoding": "gzip", "Content-Length": b.length }, b); }
      case "/br": { const b = zlib.brotliCompressSync(text); return send(200, { "Content-Encoding": "br", "Content-Length": b.length }, b); }
      case "/deflate": { const b = zlib.deflateSync(text); return send(200, { "Content-Encoding": "deflate", "Content-Length": b.length }, b); }
      case "/gzip-chunked": { const b = zlib.gzipSync(text); return send(200, { "Content-Encoding": "gzip" }, b); }
      case "/identity": return send(200, { "Content-Encoding": "identity", "Content-Length": text.length }, text);
      case "/corrupt-gzip": { const b = Buffer.from("this is not gzip data at all"); return send(200, { "Content-Encoding": "gzip", "Content-Length": b.length }, b); }
      case "/binary": return send(200, { "Content-Type": "image/jpeg", "Content-Length": BINARY.length }, BINARY);
      case "/binary-chunked": return send(200, { "Content-Type": "image/jpeg" }, BINARY);
      case "/empty": return send(200, { "Content-Length": 0 }, Buffer.alloc(0));
      case "/204": res.writeHead(204); return res.end();
      case "/404": return send(404, { "Content-Type": "text/html" }, Buffer.from("<h1>not found</h1>"));
      case "/500": return send(500, { "Content-Type": "text/plain" }, Buffer.from("boom"));
      case "/json": { const b = Buffer.from(JSON.stringify({ ok: true, 名稱: "資料", n: [1, 2, 3] })); return send(200, { "Content-Type": "application/json", "Content-Length": b.length }, b); }
      case "/echo": { const b = Buffer.from(JSON.stringify({ method: req.method, ct: req.headers["content-type"], body: Buffer.concat(chunks).toString("utf-8") })); return send(200, { "Content-Type": "application/json", "Content-Length": b.length }, b); }
      case "/redirect-1": return send(301, { Location: "/redirect-2" }, Buffer.alloc(0));
      case "/redirect-2": return send(302, { Location: "/plain" }, Buffer.alloc(0));
      case "/redirect-loop": return send(302, { Location: "/redirect-loop" }, Buffer.alloc(0));
      case "/too-large": return send(200, { "Content-Length": 30 * 1024 * 1024 }, Buffer.alloc(16));
      case "/slow": return setTimeout(() => send(200, {}, Buffer.from("late")), 800);
      default: return send(404, {}, Buffer.from("?"));
    }
  });
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;

// ---- run every case through both clients ------------------------------------------------------------------------
const VOLATILE_RESPONSE_HEADERS = new Set(["date", "connection", "keep-alive"]);
const digest = (buffer) => createHash("sha256").update(buffer).digest("hex").slice(0, 16);

const outcomeOf = async (client, kind, path, options) => {
  seenByServer.length = 0;
  try {
    let value;
    if (kind === "request") {
      const r = await client.httpRequest(`${base}${path}`, options);
      value = {
        status: r.status,
        headers: Object.fromEntries(Object.entries(r.headers).filter(([k]) => !VOLATILE_RESPONSE_HEADERS.has(k))),
        bytes: r.buffer.length,
        sha: digest(r.buffer),
      };
    } else if (kind === "text") {
      const r = await client.httpGetText(`${base}${path}`, options);
      value = { status: r.status, chars: r.text.length, sha: digest(Buffer.from(r.text)) };
    } else if (kind === "json") {
      const r = await client.httpGetJson(`${base}${path}`, options);
      value = { status: r.status, data: r.data };
    } else {
      const r = await client.httpPostForm(`${base}${path}`, { a: "1", b: "二" }, options);
      value = { status: r.status, data: r.data };
    }
    return { value, server: structuredClone(seenByServer) };
  } catch (error) {
    return { error: `${error?.name}: ${String(error?.message).replaceAll(base, "<base>")}`, server: structuredClone(seenByServer) };
  }
};

const CASES = [
  ["request", "/plain"], ["request", "/chunked"], ["request", "/gzip"], ["request", "/br"], ["request", "/deflate"],
  ["request", "/gzip-chunked"], ["request", "/identity"], ["request", "/corrupt-gzip"], ["request", "/binary"],
  ["request", "/binary-chunked"], ["request", "/empty"], ["request", "/204"], ["request", "/404"], ["request", "/500"],
  ["request", "/redirect-1"], ["request", "/redirect-loop"], ["request", "/plain", { method: "HEAD" }],
  ["request", "/plain", { headers: { "Accept-Encoding": "identity", "X-Test": "1", "User-Agent": "custom/1.0" } }],
  ["request", "/gzip", { maxResponseBytes: 10_000_000 }],
  ["request", "/too-large"], ["request", "/binary", { maxResponseBytes: 1024 * 1024 }],
  ["request", "/slow", { timeoutMs: 200 }], ["request", "/slow", { timeoutMs: 3000 }],
  ["text", "/plain"], ["text", "/gzip"], ["text", "/br"], ["text", "/404"],
  ["json", "/json"], ["json", "/plain"], ["post", "/echo"],
  ["request", "/echo", { method: "POST", body: "payload=1", headers: { "content-type": "text/plain", "content-length": "9" } }],
];

let mismatches = 0;
for (const [kind, path, options = {}] of CASES) {
  const before = await outcomeOf(legacy, kind, path, options);
  const after = await outcomeOf(current, kind, path, options);
  const same = JSON.stringify(before) === JSON.stringify(after);
  const label = `${kind.padEnd(7)} ${path}${Object.keys(options).length ? ` ${JSON.stringify(options)}` : ""}`;
  const summary = before.error ? `rejects ${before.error.slice(0, 60)}` : `${before.value.status} ${before.value.bytes ?? before.value.chars ?? ""}${before.value.sha ? ` sha ${before.value.sha}` : ""}`;
  console.log(`${same ? "same  " : "DIFFER"}  ${label.padEnd(86)} ${summary}`);
  if (!same) {
    mismatches += 1;
    console.log("   old:", JSON.stringify(before));
    console.log("   new:", JSON.stringify(after));
  }
}

console.log(`\n${CASES.length - mismatches}/${CASES.length} cases identical (request headers seen by the server, response status + headers, body bytes or error)`);

server.closeAllConnections?.();
await new Promise((resolve) => server.close(resolve));
rmSync(dir, { recursive: true, force: true });
process.exit(mismatches === 0 ? 0 : 1);
