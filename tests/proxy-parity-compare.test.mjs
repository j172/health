import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// #724：新舊代理路徑對照工具的比對邏輯，以及 .htaccess 直接代理規則的契約。
const { diffResults, normalizeHeaders, normalizeBody, DEFAULT_PATHS } = await import("../scripts/ops/proxy-parity/compare.mjs");

test("normalizeHeaders drops per-request noise and masks cookies", () => {
  const h = normalizeHeaders({ Date: "x", "Transfer-Encoding": "chunked", "Alt-Svc": "h3", ETag: "e", "Set-Cookie": ["a=1", "b=2"], "Cache-Control": "public" });
  assert.deepEqual(h, { "set-cookie": "(present)", "cache-control": "public" });
});

test("normalizeBody makes cache-buster, buildId, nonce and timestamps comparable", () => {
  const a = normalizeBody('<a href="/x?cb=123">"buildId":"abc" nonce="zz" 2026-10-21T10:00:00Z');
  const b = normalizeBody('<a href="/x?cb=999">"buildId":"def" nonce="yy" 2026-10-22T11:11:11.123Z');
  assert.equal(a, b);
});

test("diffResults reports status, header and body differences, and nothing when identical", () => {
  const base = { status: 200, headers: { "content-type": "text/html" }, bodyHash: "h", bodyLen: 10 };
  assert.deepEqual(diffResults(base, { ...base }), []);
  const d = diffResults(base, { status: 502, headers: { "content-type": "text/plain", vary: "x" }, bodyHash: "g", bodyLen: 3 });
  assert.equal(d.length, 4);
  assert.match(d.join("\n"), /status 200 vs 502/);
  assert.match(d.join("\n"), /header content-type/);
  assert.match(d.join("\n"), /header vary/);
  assert.match(d.join("\n"), /body 10B vs 3B/);
});

test("default path list covers pages, API, redirects, 404s and locale routes", () => {
  for (const p of ["/", "/news/1389409", "/news/", "/tools/", "/api/aqi", "/robots.txt", "/en", "/this-path-does-not-exist"]) {
    assert.ok(DEFAULT_PATHS.includes(p), `${p} must be in the default parity list`);
  }
});

test("the versioned .htaccess keeps the old rules and puts the direct-proxy rule before the catch-all", () => {
  const ht = fs.readFileSync(new URL("../ops/htaccess/health.j172.tw.htaccess", import.meta.url), "utf8").replace(/\r/g, "");
  const lines = ht.split("\n").filter((l) => !l.startsWith("#") && l.trim() !== "");
  const iFav = lines.findIndex((l) => l.startsWith("RewriteRule ^favicon") && l.endsWith(" - [L]"));
  const iNews = lines.indexOf("RewriteRule ^news/$ /news [R=301,L]");
  const iProxy = lines.findIndex((l) => l.startsWith("RewriteRule ^news/([0-9]+)$ http://127.0.0.1:3000/news/$1 [P"));
  const iCatch = lines.indexOf("RewriteRule ^.*$ index.php [L,QSA]");
  assert.ok(iFav >= 0 && iNews > iFav && iProxy > iNews && iCatch > iProxy, "rule order: favicon, news/ redirect, direct proxy, catch-all");
  // nothing may proxy to anything but the local Next server
  for (const l of lines.filter((x) => /\[P[,\]]/.test(x))) assert.match(l, /http:\/\/127\.0\.0\.1:3000\//);
  // the temporary shadow prefix must never be committed
  assert.ok(!ht.includes("__direct"));
});
