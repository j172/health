/**
 * lib/server/net/resolveGoogleNewsRedirect.mjs
 *
 * Resolves a `news.google.com` RSS "article shell" URL — the `<link>` value
 * Google News RSS feeds hand back instead of the real publisher URL — to the
 * real article URL it ultimately points at.
 *
 * Why this exists: 12 feeds (gnews, gnews_topic, nhi, csr_cw, csr_cw_social,
 * esg_gvm, esg_businesstoday, ubrand_udn, commonhealth, ttvc, ibt,
 * vghtpe_news — see docs/specs/news-image-fallback-gap-fixes.md) only have a
 * Google News site-search RSS to work with, whose <link> is no longer a
 * plain HTTP redirect to the publisher (that changed years ago) — it's now
 * `https://news.google.com/rss/articles/<opaque-id>?oc=5`, which itself only
 * 302s to a same-host "splash" HTML page embedding a signed
 * (`data-n-a-id` / `data-n-a-ts` / `data-n-a-sg`) request Google's own
 * front-end JS uses to ask its `batchexecute` RPC endpoint for the real URL.
 * Confirmed live 2026-09-20 against a real csr_cw article: plain redirect
 * following alone terminates on that splash page (HTTP 200, still
 * news.google.com) and never reaches the publisher.
 *
 * Deliberately plain Node (`node:http`/`node:https`, no `fetch`/undici, no
 * cheerio): this module is imported both by TS server code that runs on the
 * production shared host — where undici's lazy WASM llhttp parser is known
 * to OOM under that host's low `ulimit -v` (see lib/server/net/httpClient.ts
 * and memory ops_health_502_watchdog.md) — and, unmodified, by
 * scripts/gha-og-external-backfill.mjs, a plain `node script.mjs` run under
 * Node 20 in GitHub Actions with no TypeScript/bundler step available to it.
 * One implementation, no parallel copies, safe in both places.
 *
 * Fail-safe by design: any network error, timeout, missing/malformed decode
 * parameters, or unparseable RPC response resolves to `null` rather than
 * throwing — callers keep their pre-existing "give up on google news URLs"
 * behavior on failure, they just get a chance to succeed first.
 */
import http from "node:http";
import https from "node:https";
import zlib from "node:zlib";

const DEFAULT_TIMEOUT_MS = 6_000;
const DEFAULT_MAX_REDIRECTS = 5;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/** Google's internal RPC endpoint that trades a signed article id for the real publisher URL. */
export const GOOGLE_NEWS_DECODE_ENDPOINT =
  "https://news.google.com/_/DotsSplashUi/data/batchexecute";

export const isGoogleNewsUrl = (url) => {
  if (!url || typeof url !== "string") return false;
  try {
    return /(^|\.)news\.google\.com$/i.test(new URL(url).hostname);
  } catch {
    return false;
  }
};

const decodeBody = (buffer, contentEncoding) => {
  try {
    if (contentEncoding === "gzip") return zlib.gunzipSync(buffer);
    if (contentEncoding === "br") return zlib.brotliDecompressSync(buffer);
    if (contentEncoding === "deflate") return zlib.inflateSync(buffer);
  } catch {
    // Fall through and return the raw buffer if decompression fails.
  }
  return buffer;
};

const requestOnce = (url, options = {}) =>
  new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      reject(new Error(`Invalid URL: ${url}`));
      return;
    }

    const transport = parsed.protocol === "http:" ? http : https;
    const req = transport.request(
      parsed,
      {
        method: options.method ?? "GET",
        headers: {
          "Accept-Encoding": "gzip, deflate, br",
          "User-Agent": USER_AGENT,
          ...options.headers,
        },
        timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const raw = Buffer.concat(chunks);
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            text: decodeBody(raw, res.headers["content-encoding"]).toString(
              "utf-8",
            ),
          });
        });
        res.on("error", reject);
      },
    );

    req.on("timeout", () =>
      req.destroy(new Error(`Request timed out: ${url}`)),
    );
    req.on("error", reject);

    if (options.body) req.write(options.body);
    req.end();
  });

/** Same bounded-redirect shape as httpClient.ts's httpRequest, self-contained so this module has no cross-import onto a "server-only"-guarded file. */
const requestFollowingRedirects = async (url, options = {}) => {
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  let currentUrl = url;
  let redirectsLeft = maxRedirects;

  for (;;) {
    const response = await requestOnce(currentUrl, options);
    const isRedirect = [301, 302, 303, 307, 308].includes(response.status);

    if (isRedirect && response.headers.location && redirectsLeft > 0) {
      currentUrl = new URL(response.headers.location, currentUrl).toString();
      redirectsLeft -= 1;
      continue;
    }

    return response;
  }
};

/**
 * Pulls the signed `garturlreq` parameters Google's own front-end embeds on
 * the splash page (inside a `c-wiz` node's `data-n-a-*` attributes) — the
 * inputs `buildDecodeRequestBody` needs. Plain regex, not cheerio: the
 * attributes are simple `name="value"` pairs and this keeps the module
 * dependency-free.
 */
export const extractDecodeParams = (html) => {
  if (!html) return null;
  const idMatch = html.match(/data-n-a-id="([^"]+)"/);
  const sgMatch = html.match(/data-n-a-sg="([^"]+)"/);
  const tsMatch = html.match(/data-n-a-ts="(\d+)"/);
  if (!idMatch || !sgMatch || !tsMatch) return null;
  return {
    articleId: idMatch[1],
    signature: sgMatch[1],
    timestamp: Number(tsMatch[1]),
  };
};

/**
 * Builds the `f.req=` form body for Google's `batchexecute` RPC
 * (`Fbv4je` / `garturlreq`) — the same request Google News' own front-end
 * issues to resolve a splash page to its real article URL.
 */
export const buildDecodeRequestBody = ({ articleId, timestamp, signature }) => {
  const inner = JSON.stringify([
    "garturlreq",
    [
      ["X", "X", ["X", "X"], null, null, 1, 1, "US:en", null, 1, null, null, null, null, null, 0, 1],
      "X",
      "X",
      1,
      [1, 1, 1],
      1,
      1,
      null,
      0,
      0,
      null,
      0,
    ],
    articleId,
    timestamp,
    signature,
  ]);
  const freq = JSON.stringify([[["Fbv4je", inner, null, "generic"]]]);
  return `f.req=${encodeURIComponent(freq)}`;
};

/**
 * Parses the `batchexecute` response — a `)]}'`-prefixed JSON body wrapping
 * a further JSON-encoded string — down to the resolved URL, or null if the
 * shape doesn't match what's expected (Google changed the format, the
 * request was rejected, etc).
 */
export const parseDecodeResponse = (text) => {
  if (!text) return null;
  try {
    const jsonText = text.replace(/^\)\]\}'\s*/, "").trim();
    const parsed = JSON.parse(jsonText);
    const first = Array.isArray(parsed) ? parsed[0] : null;
    if (!Array.isArray(first) || typeof first[2] !== "string") return null;
    const inner = JSON.parse(first[2]);
    if (!Array.isArray(inner) || typeof inner[1] !== "string") return null;
    return inner[1];
  } catch {
    return null;
  }
};

/**
 * @param {string} url a `news.google.com` URL (typically
 *   `https://news.google.com/rss/articles/<id>?oc=5` from a Google News RSS
 *   `<link>`). Non-google-news URLs resolve to `null` immediately.
 * @param {{ timeoutMs?: number, maxRedirects?: number }} [options]
 * @returns {Promise<string|null>} the real publisher URL, or `null` if it
 *   could not be resolved (never throws).
 */
export const resolveGoogleNewsRedirect = async (url, options = {}) => {
  if (!isGoogleNewsUrl(url)) return null;

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;

  try {
    const page = await requestFollowingRedirects(url, {
      timeoutMs,
      maxRedirects,
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    if (page.status < 200 || page.status >= 300) return null;

    const params = extractDecodeParams(page.text);
    if (!params) return null;

    const decodeRes = await requestOnce(GOOGLE_NEWS_DECODE_ENDPOINT, {
      method: "POST",
      timeoutMs,
      headers: {
        "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
      },
      body: buildDecodeRequestBody(params),
    });
    if (decodeRes.status < 200 || decodeRes.status >= 300) return null;

    const resolved = parseDecodeResponse(decodeRes.text);
    if (!resolved || !/^https?:\/\//i.test(resolved) || isGoogleNewsUrl(resolved)) {
      return null;
    }
    return resolved;
  } catch {
    return null;
  }
};
