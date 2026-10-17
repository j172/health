// Wiring that lets a plain `node` process run the real runRssIngestion() end to end against the synthetic
// world in stubWorld.mjs, with only the outside edges replaced:
//   - network     : node:https.request is redirected to the local stub server (every byte still goes through
//                   the real lib/server/net/httpClient.ts and the real downloadArticleImage / cheerio code)
//   - database    : "@/lib/server/db/mysql" -> dbStub.mjs (an in-memory model with a real named lock)
//   - scrapers    : the ~50 per-publisher special-source fetchers -> specialSourceStub.mjs
//   - feed list   : optionally truncated, so a unit test does not walk all 52 feeds
// Used by the child process (ingestChild.mjs) and by in-process tests.
import http from "node:http";
import https from "node:https";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { registerRepoHooks, repoRootUrl } from "../../garbageRoutes/testSupport/repoHooks.mjs";
import { createDbState } from "./dbStub.mjs";

const here = (name) => new URL(name, import.meta.url).href;

const SPECIAL_MODULE = /import\s*\{([^}]*)\}\s*from\s*"(@\/lib\/server\/rss\/fetch[A-Za-z0-9]+)"/g;
const NOT_SPECIAL = new Set(["@/lib/server/rss/fetchFeeds", "@/lib/server/rss/fetchDetailPage"]);

/** Every special-source fetcher runRssIngestion.ts imports: [{ specifier, names }]. */
export const listSpecialSourceImports = () => {
  const text = readFileSync(fileURLToPath(new URL("lib/server/rss/runIngestion.ts", repoRootUrl)), "utf-8");
  const found = [];
  for (const match of text.matchAll(SPECIAL_MODULE)) {
    if (NOT_SPECIAL.has(match[2])) continue;
    const names = match[1].split(",").map((n) => n.trim()).filter(Boolean);
    found.push({ specifier: match[2], names });
  }
  return found;
};

const stubModule = (source) => `data:text/javascript,${encodeURIComponent(source)}`;

/**
 * Sends every https:// request the pipeline makes to the local stub server, preserving the original host in the path.
 *
 * With `useTls` the connection stays a real TLS one against the stub world's HTTPS mode: the request keeps the caller's
 * own agent (so httpClient's CA list still gets built into a SecureContext exactly as in production — that cost is the
 * point), and the SNI name is the original host so the agent keeps one socket pool per publisher, like production.
 */
export const installNetworkRedirect = (port, useTls = false) => {
  const realHttpsRequest = https.request;
  const rewrite = (url, options, callback) => {
    const target = url instanceof URL ? url : new URL(String(url));
    const opts = typeof options === "function" ? {} : (options ?? {});
    const cb = typeof options === "function" ? options : callback;
    const request = {
      host: "127.0.0.1",
      port,
      path: `/__h/${target.host}${target.pathname}${target.search}`,
      method: opts.method ?? "GET",
      headers: opts.headers,
      timeout: opts.timeout,
    };
    if (useTls) {
      // rejectUnauthorized: false rather than teaching the agent's CA list about the stub's certificate: a
      // checkServerIdentity hook (or an edited agent) would change the agent's socket-pool key and disable reuse.
      return realHttpsRequest({ ...request, agent: opts.agent, servername: target.hostname, rejectUnauthorized: false }, cb);
    }
    return http.request(request, cb);
  };
  https.request = rewrite;
  https.get = (url, options, callback) => {
    const req = rewrite(url, options, callback);
    req.end();
    return req;
  };
};

/**
 * @param {object} config
 * @param {number} config.port        stub world port
 * @param {number} [config.feedLimit] only the first N entries of RSS_FEEDS (default: all)
 * @param {object} [config.special]   { items, detailChars } for the special-source stand-ins
 * @returns the shared state object (globalThis.__rssIngestTest)
 */
export const installIngestStubs = (config) => {
  const state = {
    port: config.port,
    special: { items: 15, detailChars: 6000, ...(config.special ?? {}) },
    db: createDbState(),
  };
  globalThis.__rssIngestTest = state;

  // dummy, non-secret values: the real modules read these at import time
  const defaults = {
    MYSQL_HOST: "stub",
    MYSQL_USER: "stub",
    MYSQL_PASSWORD: "stub",
    MYSQL_DATABASE: "stub",
    RSS_SYNC_ADMIN_SECRET: "stub",
    CLOUDFLARE_ACCOUNT_ID: "stub-account",
    CLOUDFLARE_API_TOKEN: "stub-token",
  };
  for (const [key, value] of Object.entries(defaults)) process.env[key] ??= value;

  installNetworkRedirect(config.port, Boolean(config.useTls));

  const stubs = { "@/lib/server/db/mysql": here("dbStub.mjs") };
  const stubFile = here("specialSourceStub.mjs");
  for (const { specifier, names } of listSpecialSourceImports()) {
    stubs[specifier] = stubModule(
      `import { makeFetcher } from ${JSON.stringify(stubFile)};\n` +
        names.map((name) => `export const ${name} = makeFetcher(${JSON.stringify(name)});`).join("\n"),
    );
  }
  if (config.feedLimit) {
    const realFeeds = new URL("lib/server/config/rss-feeds.ts", repoRootUrl).href;
    stubs["@/lib/server/config/rss-feeds"] = stubModule(
      `import { RSS_FEEDS as ALL } from ${JSON.stringify(realFeeds)};\nexport const RSS_FEEDS = ALL.slice(0, ${Number(config.feedLimit)});`,
    );
  }
  registerRepoHooks(stubs);
  return state;
};
