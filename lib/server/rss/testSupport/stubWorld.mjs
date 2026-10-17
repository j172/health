// A synthetic "internet" for exercising the RSS ingestion pipeline without touching
// any real publisher (and never health.j172.tw). Test/measurement support only.
//
// A local HTTP server that answers every request the ingestion makes:
//   - RSS feeds           (Accept contains "rss+xml")      -> an RSS 2.0 document with N items
//   - article pages       (path /a/...)                    -> HTML with og:image, ld+json, a big body
//   - images              (path /img/...)                  -> JPEG-signature bytes, some very large
//   - listing pages       (path /list/...)                 -> HTML cards, used by the special-source stand-ins
//   - Cloudflare Workers AI (host api.cloudflare.com, POST)-> a well-formed SEO JSON answer
//
// The client side is pointed here by installNetworkRedirect() (ingestStubs.mjs), which rewrites
// https://<host><path> to http://127.0.0.1:<port>/__h/<host><path>; the server therefore sees the
// original host (gov hosts get smaller pages, like the real ones) and every byte still travels
// through the real lib/server/net/httpClient.ts (chunked sockets, Buffer.concat, gunzip).
//
// Sizes are calibrated on real feeds fetched once on 2026-10-16: an RSS file is 10-155 KB
// (mohw 3.5 KB/item, gnews 1.2 KB/item, WordPress feeds with content:encoded 5-8 KB/item),
// a news article page is 150-900 KB, a card image 100-600 KB with the odd multi-MB photo.
import http from "node:http";
import https from "node:https";
import zlib from "node:zlib";
import { createHash } from "node:crypto";

const KB = 1024;

export const DEFAULT_WORLD = {
  /** Items in every RSS feed. */
  feedItems: 25,
  /**
   * Give every item an <enclosure> image. Without one (Google News, many news sites) the ingestion has no card image
   * and falls back to fetching the article page itself for its og:image — the path that reads whole pages.
   */
  enclosures: true,
  /** Characters of <description> HTML per item. */
  descChars: 1800,
  /** Characters of <content:encoded> per item (0 = none). */
  contentEncodedChars: 0,
  /** Non-gov article page size. */
  articleKB: 500,
  /** *.gov.tw article page size. */
  govArticleKB: 150,
  /** Typical image size. */
  imageKB: 250,
  /** Every Nth image is a big photo of bigImageKB (0 = never). */
  bigImageEvery: 40,
  bigImageKB: 5000,
  /** Special-source listing page size. */
  listingKB: 300,
  /** Serve bodies gzip-encoded (what real origins do for Accept-Encoding: gzip). */
  gzip: true,
  /** Artificial latency for a Workers AI answer. */
  aiLatencyMs: 0,
  /** Fraction of items whose text changes on every fetch of their feed (0..1). */
  churn: 0,
  /** Server-side latency for every non-AI answer (a network round trip). */
  latencyMs: 0,
  /** How long the server keeps an idle keep-alive connection (and so does the client's agent). */
  keepAliveTimeoutMs: 60_000,
  /** { key, cert } PEMs: serve HTTPS. Null: plain HTTP. */
  tls: null,
};

const PARAGRAPH =
  "衛生福利部今日表示，為因應人口老化與慢性病負擔，將持續推動社區整合照護，強化基層診所與醫院的轉診合作，並鼓勵民眾定期接受成人預防保健與癌症篩檢。專家提醒，均衡飲食、規律運動與充足睡眠是維持健康的基本功，若出現持續咳嗽、體重無故下降或胸悶等症狀應儘早就醫。";

const repeatTo = (chars, seed = "") => {
  if (chars <= 0) return "";
  let out = seed;
  while (out.length < chars) out += PARAGRAPH;
  return out.slice(0, chars);
};

const hash8 = (text) => createHash("sha1").update(text).digest("hex").slice(0, 8);

/** Deterministic, cheap, incompressible bytes (a real JPEG does not gzip either). */
const noiseBuffers = new Map();
const noise = (variant, length) => {
  const key = `${variant}:${length}`;
  let buf = noiseBuffers.get(key);
  if (!buf) {
    buf = Buffer.allocUnsafe(length);
    let x = (variant * 2654435761) >>> 0 || 1;
    for (let i = 0; i < length; i += 1) {
      x ^= x << 13;
      x >>>= 0;
      x ^= x >>> 17;
      x ^= x << 5;
      x >>>= 0;
      buf[i] = x & 0xff;
    }
    // JPEG SOI + JFIF marker so downloadArticleImage's signature check passes.
    buf[0] = 0xff;
    buf[1] = 0xd8;
    buf[2] = 0xff;
    noiseBuffers.set(key, buf);
    if (noiseBuffers.size > 40) noiseBuffers.delete(noiseBuffers.keys().next().value);
  }
  return buf;
};

const escapeXml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

/**
 * An article page = a small per-request head (title, og:image, JSON-LD, three photos) + a big body that is the same
 * for every article of a given size, built and compressed once. The head and the body are separate gzip members,
 * which is a valid gzip stream (and how Node decodes it), so a 1.5 MB page costs the server a few microseconds.
 */
const bodyCache = new Map();
const articleBody = (kb) => {
  let cached = bodyCache.get(kb);
  if (!cached) {
    const foot = `</article></main><footer>${"<a href=\"/f\">頁尾連結</a>".repeat(40)}</footer></body></html>`;
    // Roughly half real markup (many small nodes -> a big DOM), a quarter inline script, a quarter prose.
    const cell = `<div class="c"><p>${PARAGRAPH.slice(0, 60)}</p><a href="/r/1">相關報導</a></div>`;
    const script = `<script>window.__STATE__=${JSON.stringify({ blob: repeatTo(2000) })};</script>`;
    const budget = Math.max(0, kb * KB - 3000);
    let body = "";
    while (body.length < budget * 0.5) body += cell;
    while (body.length < budget * 0.75) body += script;
    while (body.length < budget) body += `<p>${PARAGRAPH}</p>`;
    const raw = Buffer.from(body + foot, "utf-8");
    cached = { raw, gzip: zlib.gzipSync(raw, { level: 1 }) };
    bodyCache.set(kb, cached);
  }
  return cached;
};

const articlePage = ({ host, path, kb, imageUrl }) => {
  const head =
    `<!doctype html><html lang="zh-TW"><head><meta charset="utf-8"><title>${escapeXml(path)} - ${host}</title>` +
    `<meta property="og:image" content="${imageUrl}"><meta property="og:image:alt" content="示意圖">` +
    `<script type="application/ld+json">${JSON.stringify({ "@type": "NewsArticle", image: [imageUrl], headline: path })}</script>` +
    `<style>${".a{color:#333}".repeat(200)}</style></head><body><header><nav>${"<a href=\"/x\">選單</a>".repeat(60)}</nav></header><main><article>` +
    // A real article carries a few photos, not thousands (gov pages re-host every in-body <img>).
    [0, 1, 2].map((n) => `<img src="/img/${hash8(path)}-body${n}.jpg" alt="圖${n}">`).join("");
  const headBuf = Buffer.from(head, "utf-8");
  const body = articleBody(kb);
  return {
    raw: Buffer.concat([headBuf, body.raw]),
    gzip: () => Buffer.concat([zlib.gzipSync(headBuf, { level: 1 }), body.gzip]),
  };
};

const listingHtml = ({ name, host, kb, items }) => {
  const target = kb * KB;
  let cards = "";
  for (let i = 0; i < items; i += 1) {
    cards +=
      `<div class="card"><a href="/a/${name}-${i}" title="${name} ${i}"><img data-src="/img/${name}-${i}.jpg"></a>` +
      `<span class="note">${new Date(Date.now() - i * 3600e3).toISOString().slice(0, 10)}</span><p>${PARAGRAPH.slice(0, 120)}</p></div>`;
  }
  let filler = "";
  while (cards.length + filler.length < target) filler += `<div class="x"><span>${PARAGRAPH.slice(0, 80)}</span></div>`;
  return `<!doctype html><html><head><title>${host}</title></head><body>${cards}${filler}</body></html>`;
};

/**
 * Starts the world. Returns `{ port, close, stats, options }`; `stats` counts what was asked.
 * `options` is live: tests may mutate it between runs (e.g. set `churn`).
 */
export const startStubWorld = async (overrides = {}) => {
  const options = { ...DEFAULT_WORLD, ...overrides };
  const stats = { requests: 0, connections: 0, feeds: 0, articles: 0, images: 0, listings: 0, ai: 0, bytesOut: 0, bigImages: 0 };
  const feedFetchCount = new Map();
  const startedAt = Date.now();
  let imageCounter = 0;

  const acceptsGzip = (req) => options.gzip && /\bgzip\b/.test(String(req.headers["accept-encoding"] ?? ""));

  /** `payload` is a string/Buffer, or `{ raw, gzip() }` for a body that is expensive to compress per request. */
  const send = (res, req, status, contentType, payload, extraHeaders = {}) => {
    const headers = { "Content-Type": contentType, ...extraHeaders };
    let body;
    if (payload && typeof payload === "object" && !Buffer.isBuffer(payload)) {
      if (acceptsGzip(req)) {
        body = payload.gzip();
        headers["Content-Encoding"] = "gzip";
      } else {
        body = payload.raw;
      }
    } else {
      body = Buffer.isBuffer(payload) ? payload : Buffer.from(payload, "utf-8");
      if (acceptsGzip(req) && !contentType.startsWith("image/")) {
        body = zlib.gzipSync(body, { level: 1 });
        headers["Content-Encoding"] = "gzip";
      }
    }
    headers["Content-Length"] = body.length;
    stats.bytesOut += body.length;
    res.writeHead(status, headers);
    // Stream in 16 KB writes like a socket would deliver it, so the client's chunk bookkeeping is real.
    let offset = 0;
    let closed = false;
    // A client that has read enough drops the connection (truncated reads do); stop writing and let `body` go.
    res.on("close", () => {
      closed = true;
    });
    const pump = () => {
      if (closed) return;
      while (offset < body.length) {
        const end = Math.min(offset + 16 * KB, body.length);
        const ok = res.write(body.subarray(offset, end));
        offset = end;
        if (!ok) {
          res.once("drain", pump);
          return;
        }
      }
      res.end();
    };
    pump();
  };

  const feedXml = (host, rest, seed) => {
    const count = (feedFetchCount.get(seed) ?? 0) + 1;
    feedFetchCount.set(seed, count);
    stats.feeds += 1;
    const googleLike = host === "news.google.com";
    let items = "";
    for (let i = 0; i < options.feedItems; i += 1) {
      const linkHost = googleLike ? `pub-${seed}.example` : host;
      const link = `https://${linkHost}/a/${seed}-${i}`;
      const churned = options.churn > 0 && i % Math.max(1, Math.round(1 / options.churn)) === 0;
      const desc = repeatTo(options.descChars, `項目 ${seed}-${i}${churned ? ` 更新${count}` : ""} `);
      const encoded = options.contentEncodedChars > 0 ? `<content:encoded><![CDATA[<p>${repeatTo(options.contentEncodedChars, `全文 ${seed}-${i} `)}</p><img src="https://${linkHost}/img/${seed}-${i}-body.jpg">]]></content:encoded>` : "";
      // Anchored to when the world started, not to "now": a feed that is fetched twice must hand out the same
      // pubDate, or every item's payload hash changes and a "warm" run would re-enrich everything.
      const pub = new Date(startedAt - (i * 90 + 5) * 60e3).toUTCString();
      items +=
        `<item><title><![CDATA[健康新聞 ${seed} 第 ${i} 則]]></title><link>${link}</link><guid isPermaLink="false">${seed}-${i}</guid>` +
        `<pubDate>${pub}</pubDate><category>健康</category><description><![CDATA[<p>${desc}</p>]]></description>` +
        `${encoded}${options.enclosures ? `<enclosure url="https://${linkHost}/img/${seed}-${i}.jpg" type="image/jpeg" length="1"/>` : ""}</item>`;
    }
    return (
      `<?xml version="1.0" encoding="utf-8"?><rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel>` +
      `<title>stub ${host}${rest}</title><link>https://${host}/</link><description>stub</description>${items}</channel></rss>`
    );
  };

  const handler = (req, res) => {
    stats.requests += 1;
    const url = new URL(req.url ?? "/", "http://stub.invalid");
    const match = url.pathname.match(/^\/__h\/([^/]+)(\/.*)?$/);
    const host = match?.[1] ?? "unknown";
    const rest = `${match?.[2] ?? "/"}${url.search}`;
    const path = match?.[2] ?? "/";

    const respond = () => {
      if (host === "api.cloudflare.com") {
        stats.ai += 1;
        const answer = JSON.stringify({
          metaDescription: "衛福部推動社區整合照護，提醒民眾定期篩檢並維持規律運動與均衡飲食，及早發現疾病以降低醫療負擔。",
          keywords: "健康,篩檢,社區照護",
          geoSummary: "衛福部於近日表示將持續推動社區整合照護並鼓勵民眾定期接受預防保健服務。",
        });
        req.resume();
        const reply = () => send(res, req, 200, "application/json", JSON.stringify({ success: true, result: { response: answer } }));
        if (options.aiLatencyMs > 0) setTimeout(reply, options.aiLatencyMs);
        else reply();
        return;
      }
      req.resume();
      if (path.startsWith("/img/")) {
        stats.images += 1;
        imageCounter += 1;
        const big = options.bigImageEvery > 0 && imageCounter % options.bigImageEvery === 0;
        if (big) stats.bigImages += 1;
        const kb = big ? options.bigImageKB : options.imageKB;
        send(res, req, 200, "image/jpeg", noise(imageCounter % 16, kb * KB));
        return;
      }
      if (path.startsWith("/a/") || path.startsWith("/rss/articles/")) {
        stats.articles += 1;
        const seed = hash8(path);
        const kb = /\.(gov|edu)\.tw$/.test(host) ? options.govArticleKB : options.articleKB;
        send(res, req, 200, "text/html; charset=utf-8", articlePage({ host, path, kb, imageUrl: `https://${host}/img/og-${seed}.jpg` }));
        return;
      }
      if (path.startsWith("/list/")) {
        stats.listings += 1;
        const name = path.slice("/list/".length).split("/")[0];
        send(res, req, 200, "text/html; charset=utf-8", listingHtml({ name, host, kb: options.listingKB, items: Number(url.searchParams.get("n") ?? 15) }));
        return;
      }
      if (/rss\+xml/.test(String(req.headers.accept ?? ""))) {
        send(res, req, 200, "application/rss+xml; charset=utf-8", feedXml(host, rest, hash8(`${host}${rest}`)));
        return;
      }
      send(res, req, 404, "text/plain", "not found");
    };

    if (options.latencyMs > 0 && host !== "api.cloudflare.com") setTimeout(respond, options.latencyMs);
    else respond();
  };

  // `tls: { key, cert }` serves HTTPS, so a measurement can include what a real TLS handshake costs on the client
  // (a SecureContext per connection was the biggest memory hog found for issue #699). Plain HTTP otherwise.
  const server = options.tls ? https.createServer({ key: options.tls.key, cert: options.tls.cert }, handler) : http.createServer(handler);
  // Real origins (nginx 75 s, Cloudflare ~60-120 s) keep an idle connection open for a minute or more, and the
  // client's keep-alive agent keeps its half of it — with its TLS state — for exactly as long.
  server.keepAliveTimeout = options.keepAliveTimeoutMs;
  server.on(options.tls ? "secureConnection" : "connection", () => {
    stats.connections += 1;
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return {
    port,
    options,
    stats,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
};
