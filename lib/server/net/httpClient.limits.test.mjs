// What the shared HTTP client does with big or hostile responses, and how its agents hold connections (issue #699).
// A local plain-HTTP server stands in for the publishers; the TLS half is asserted structurally because a TLS
// handshake needs a certificate, and shipping a private key in the repo for one test is not worth it.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import zlib from "node:zlib";
import { createHash } from "node:crypto";
import { registerRepoHooks } from "../garbageRoutes/testSupport/repoHooks.mjs";

registerRepoHooks();
const client = await import("./httpClient.ts");

const seen = { acceptEncoding: [] };
let server;
let base;

const bigText = (bytes) => "0123456789abcdef".repeat(Math.ceil(bytes / 16)).slice(0, bytes);

/** Deterministic text that does not compress away (a real page does not shrink 300:1 either). */
const noiseText = (chars) => {
  let out = "";
  for (let i = 0; out.length < chars; i += 1) out += createHash("sha256").update(String(i)).digest("hex");
  return out.slice(0, chars);
};
const NOISE = noiseText(600_000);

before(async () => {
  server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    seen.acceptEncoding.push(req.headers["accept-encoding"]);
    const write = (status, headers, body) => {
      res.writeHead(status, headers);
      // 16 KB writes, like a socket delivers it
      for (let i = 0; i < body.length; i += 16384) res.write(body.subarray(i, i + 16384));
      res.end();
    };
    if (url.pathname === "/big") {
      const body = Buffer.from(bigText(1_000_000));
      write(200, { "Content-Type": "text/html", "Content-Length": body.length }, body);
    } else if (url.pathname === "/small") {
      const body = Buffer.from("<html>tiny</html>");
      write(200, { "Content-Type": "text/html", "Content-Length": body.length }, body);
    } else if (url.pathname === "/chunked") {
      // no Content-Length: Transfer-Encoding: chunked
      write(200, { "Content-Type": "text/plain" }, Buffer.from(bigText(300_000)));
    } else if (url.pathname === "/gzip-always") {
      // an origin that compresses whatever the client asked for
      const body = zlib.gzipSync(Buffer.from(NOISE));
      write(200, { "Content-Type": "text/html", "Content-Encoding": "gzip", "Content-Length": body.length }, body);
    } else if (url.pathname === "/bomb") {
      // ~20 KB on the wire, 40 MB when inflated
      const body = zlib.gzipSync(Buffer.alloc(40 * 1024 * 1024, 0x30));
      write(200, { "Content-Type": "text/plain", "Content-Encoding": "gzip", "Content-Length": body.length }, body);
    } else if (url.pathname === "/declared-too-large") {
      res.writeHead(200, { "Content-Length": 50_000_000 });
      res.write("x");
      setTimeout(() => res.destroy(), 20);
    } else {
      write(404, {}, Buffer.from("nope"));
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server.closeAllConnections?.();
  await new Promise((resolve) => server.close(resolve));
});

test("an ordinary request is unchanged: status, text, no truncation flag", async () => {
  const r = await client.httpGetText(`${base}/small`);
  assert.equal(r.status, 200);
  assert.equal(r.text, "<html>tiny</html>");
  assert.equal(r.truncated, undefined);
});

test("a body with Content-Length and one without (chunked) both come back byte-for-byte", async () => {
  const declared = await client.httpRequest(`${base}/big`);
  assert.equal(declared.buffer.length, 1_000_000);
  assert.equal(declared.buffer.toString("utf-8"), bigText(1_000_000));

  const chunked = await client.httpRequest(`${base}/chunked`);
  assert.equal(chunked.buffer.length, 300_000);
  assert.equal(chunked.buffer.toString("utf-8"), bigText(300_000));
});

test("truncateAtBytes returns exactly the start of the document, flags it, and asks for an uncompressed body", async () => {
  seen.acceptEncoding.length = 0;
  const r = await client.httpGetText(`${base}/big`, { truncateAtBytes: 100_000 });
  assert.equal(r.status, 200);
  assert.equal(r.truncated, true);
  assert.equal(r.text.length, 100_000);
  assert.equal(r.text, bigText(1_000_000).slice(0, 100_000));
  assert.deepEqual(seen.acceptEncoding, ["identity"], "a cut-off gzip stream cannot be parsed, so it must not be requested");
});

test("truncateAtBytes on a document shorter than the cap is not truncated", async () => {
  const r = await client.httpGetText(`${base}/small`, { truncateAtBytes: 100_000 });
  assert.equal(r.text, "<html>tiny</html>");
  assert.equal(r.truncated, undefined);
});

test("truncateAtBytes against an origin that gzips anyway still yields the start of the document", async () => {
  const r = await client.httpGetText(`${base}/gzip-always`, { truncateAtBytes: 64 * 1024 });
  assert.equal(r.truncated, true);
  assert.ok(r.text.length > 10_000, `decoded ${r.text.length} chars`);
  assert.equal(r.text, NOISE.slice(0, r.text.length), "decoded text that is a prefix of the document, not gzip bytes");
});

test("a gzip bomb is refused as ResponseTooLargeError instead of being inflated into memory", async () => {
  await assert.rejects(
    client.httpGetText(`${base}/bomb`, { maxResponseBytes: 1024 * 1024 }),
    (error) => error instanceof client.ResponseTooLargeError,
  );
});

test("ordinary compressed responses still decode (the bomb guard is loose enough for real open-data dumps)", async () => {
  const r = await client.httpGetText(`${base}/gzip-always`);
  assert.equal(r.text, NOISE);
});

test("a Content-Length over the wire limit is rejected before any of it is buffered", async () => {
  await assert.rejects(
    client.httpGetText(`${base}/declared-too-large`, { maxResponseBytes: 1_000_000 }),
    (error) => error instanceof client.ResponseTooLargeError,
  );
});

test("the TLS agent shares ONE SecureContext and expires idle sockets", () => {
  const { httpsAgent, httpAgent, secureContext } = client.httpAgentsForTests;
  // `ca` on an Agent is forwarded to tls.connect, which builds a fresh ~0.8 MB native SecureContext per connection;
  // a prebuilt secureContext is reused. (Measured for #699: 150 connections cost +118 MB RSS with `ca`, +4 MB shared.)
  assert.ok(httpsAgent.options.secureContext, "the agent must be given a prebuilt SecureContext");
  assert.equal(httpsAgent.options.secureContext, secureContext);
  assert.equal(httpsAgent.options.ca, undefined, "passing `ca` again would bring the per-connection contexts back");
  assert.equal(httpsAgent.options.keepAlive, true);
  assert.equal(httpAgent.options.keepAlive, true);
  for (const agent of [httpsAgent, httpAgent]) {
    assert.ok(agent.options.timeout > 0 && agent.options.timeout <= 15_000, "idle keep-alive sockets must expire");
  }
});
