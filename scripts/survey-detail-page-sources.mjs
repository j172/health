#!/usr/bin/env node
/**
 * Resolves a real, current article for every RSS_FEEDS source and reports what
 * fetchDetailPage's text projection actually produces for it.
 *
 * Why this exists (issue #89): the per-host scoping table in
 * lib/server/rss/fetchDetailPage.ts (#71) is hand-maintained, and #71
 * deliberately configured only the two hosts it had measured. Ten sources have
 * been added since, and two — mamaclub.com and heho.com.tw — were observed
 * projecting to 0 and 18 characters with nobody knowing why. The table is the
 * kind of file where a plausible-looking selector that matches nothing is
 * invisible: it degrades silently to the unscoped container and no test, log or
 * page ever says so. That is exactly the failure mode of the five dead
 * `臺北市立聯合醫院X院區` searchNames fixed in #84, which is why this script
 * exists and why nothing goes into that table without appearing here first.
 *
 * Read-only. It issues one feed GET and one or two article GETs per source and
 * writes nothing — no database, no files. Safe to run at any time.
 *
 * Usage:
 *   node scripts/survey-detail-page-sources.mjs
 *   node scripts/survey-detail-page-sources.mjs --feed=heho --feed=mamaclub
 *   node scripts/survey-detail-page-sources.mjs --items=3
 *   node scripts/survey-detail-page-sources.mjs --sample=400
 *
 * Exit code 1 if any fetch-eligible source fetched successfully but projected
 * an (almost) empty body while its feed description had real content — a
 * container-selection defect that a table entry could fix. Unreachable hosts
 * exit 0: a publisher that blocks this network is not something the table can
 * repair, and #89 is explicit that such a host stays unconfigured and reported.
 */

import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";

const REPO_ROOT = new URL("../", import.meta.url);

// The projection, the feed parser and the HTTP client are all TypeScript behind
// "@/" path aliases, and httpClient.ts opens with `import "server-only"`, which
// throws on sight outside a React Server Components build. Same three resolver
// concerns, and the same fix, as lib/server/rss/fetchDetailPage.test.mjs.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return { url: "data:text/javascript,", shortCircuit: true };
    }
    let target = specifier;
    let parentURL = context.parentURL;
    if (specifier.startsWith("@/")) {
      target = `./${specifier.slice(2)}`;
      parentURL = REPO_ROOT.href;
    }
    if (target.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(target)) {
      for (const extension of [".ts", ".tsx"]) {
        const candidate = new URL(target + extension, parentURL);
        if (existsSync(fileURLToPath(candidate))) {
          return nextResolve(target + extension, { ...context, parentURL });
        }
      }
    }
    return nextResolve(target, { ...context, parentURL });
  },
});

const { load } = await import("cheerio");
const { RSS_FEEDS } = await import("../lib/server/config/rss-feeds.ts");
const { parseFeedXml } = await import("../lib/server/rss/parseRss.ts");
const { extractDetailContent, resolveDetailTextScoping } =
  await import("../lib/server/rss/fetchDetailPage.ts");
// The repo's own client, not global fetch(): it carries the TWCA intermediate
// certificate that hpa.gov.tw's chain omits, so surveying with fetch() would
// report five hpa feeds as unreachable for a reason production does not have.
const { httpGetText } = await import("../lib/server/net/httpClient.ts");

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const ONLY_FEEDS = args
  .filter((a) => a.startsWith("--feed="))
  .map((a) => a.slice("--feed=".length));
const ITEMS_PER_FEED = Number(flag("items", 2));
const SAMPLE_CHARS = Number(flag("sample", 200));
/** Politeness gap between article GETs — this walks ~30 publishers. */
const REQUEST_INTERVAL_MS = Number(flag("interval", 700));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// Chrome detection
//
// A *reporting* aid, not a rule: nothing here removes anything or feeds the
// scoping table. It flags text that looks like a nav label, a share widget, a
// player control or a related-articles rail so a human can go and look. #71
// rejected acting on such a signal automatically — Chinese article prose
// contains links and lacks the sentence punctuation a generic rule would key
// on — and that rejection stands. This only points at pages worth reading.
// ---------------------------------------------------------------------------
const CHROME_MARKERS = [
  [
    "nav",
    /回首頁|回上頁|上一則|下一則|友善列印|字級|字型大小|網站導覽|跳到主要內容區塊|目前位置[:：]/,
  ],
  [
    "share",
    /分享到\s?Facebook|加入好友|分享至|複製連結|轉發|Line\s?分享|取得短網址/i,
  ],
  ["player", /朗讀|上一段|下一段|暫停|播放速度|聆聽本文/],
  [
    "related",
    /相關文章|延伸閱讀|推薦閱讀|熱門文章|你可能也喜歡|您可能會喜歡|更多報導/,
  ],
  ["subscribe", /訂閱電子報|立即訂閱|加入會員|追蹤我們/],
  ["counter", /瀏覽人次|點閱數|點閱次數|更新日期\s?[:：]/],
  [
    "feedback",
    /資訊內容對您是否有幫助|看完本篇主題後|送出評分|您的感覺如何|驗證碼[:：]/,
  ],
  ["comments", /我要回應|我要留言|點此登入來回應|看留言討論|收藏文章/],
  ["legal", /隱私權政策|著作權聲明|版權所有|Cookie\s?政策/i],
];

const detectChrome = (text) =>
  CHROME_MARKERS.filter(([, re]) => re.test(text)).map(([label]) => label);

// ---------------------------------------------------------------------------
// "Is the real body here?"
//
// The feed's own <description> is the only independent description of the
// article this script has, so it is the yardstick: cut it into overlapping
// 8-character shingles and count how many survive into detailText. A high
// share means the projected container really does hold the article; a low one
// means the projection found something else. Short descriptions (< 40 chars,
// e.g. a headline-only government feed) carry too little signal to judge, and
// are reported as such rather than guessed at.
// ---------------------------------------------------------------------------
const SHINGLE = 8;
const coverage = (descriptionText, detailText) => {
  const needle = (descriptionText ?? "").replace(/\s+/g, "");
  const hay = (detailText ?? "").replace(/\s+/g, "");
  if (needle.length < 40) return null;
  let total = 0;
  let found = 0;
  for (let i = 0; i + SHINGLE <= needle.length; i += 4) {
    total += 1;
    if (hay.includes(needle.slice(i, i + SHINGLE))) found += 1;
  }
  return total === 0 ? null : found / total;
};

// ---------------------------------------------------------------------------
// Which container did the current logic pick?
//
// Mirrors extractDetailContent's own cascade exactly, on the same
// already-stripped document, so this reports what the projection did rather
// than what a second guess at the same rule would have done.
// ---------------------------------------------------------------------------
const describeContainer = ($) => {
  if ($("article").first().length > 0) return "article";
  if ($("main").first().length > 0) return "main";
  if ($("#maincontent").first().length > 0) return "#maincontent";
  return "body (fallback)";
};

const hostOf = (url) => {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "(unparseable)";
  }
};

/**
 * Google News RSS items link to news.google.com, not to the publisher, and
 * Google stopped 302-ing those links to the article — the URL now serves a
 * JavaScript splash page. But every item carries `<source url="...">` naming
 * the publisher, which is enough to report the effective host set without
 * following anything.
 */
const googleNewsSourceHosts = (xml) => {
  const hosts = new Map();
  for (const match of xml.matchAll(/<source url="([^"]+)"/g)) {
    const host = hostOf(match[1]);
    hosts.set(host, (hosts.get(host) ?? 0) + 1);
  }
  return [...hosts.entries()].sort((a, b) => b[1] - a[1]);
};

// ---------------------------------------------------------------------------
// Measurement
// ---------------------------------------------------------------------------

/** Fetches one article page with the exact request fetchDetailPage would make. */
const fetchArticle = async (url) =>
  httpGetText(url, {
    headers: {
      "User-Agent": "health.j172.tw-rss-ingestor/1.0",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    timeoutMs: 15_000,
  });

const measureItem = async (item) => {
  const url = item.canonicalUrl;
  const configured = resolveDetailTextScoping(url);

  let response;
  try {
    response = await fetchArticle(url);
  } catch (error) {
    return {
      url,
      host: hostOf(url),
      title: item.title,
      status: "UNREACHABLE",
      httpStatus: null,
      note: error instanceof Error ? error.message : String(error),
      configured,
    };
  }

  if (response.status < 200 || response.status >= 300) {
    // Cloudflare labels its interstitial explicitly, and the difference matters:
    // a challenge means the page exists and a browser can see it, but no
    // server-side fetcher ever will, so no selector can rescue it.
    const challenged =
      response.headers["cf-mitigated"] === "challenge" ||
      /Just a moment\.\.\./.test(response.text.slice(0, 2000));
    return {
      url,
      host: hostOf(url),
      title: item.title,
      status: "UNREACHABLE",
      httpStatus: response.status,
      note: challenged
        ? `HTTP ${response.status} — Cloudflare ${response.headers["cf-mitigated"] ?? "challenge"} interstitial`
        : `HTTP ${response.status}`,
      configured,
    };
  }

  // Two projections of the same document: what the table does today, and what
  // it would do with no entry at all. Identical for an unlisted host; the
  // before/after evidence #71 asks for when a host IS listed.
  const projected = extractDetailContent(load(response.text), url);
  const unscoped = extractDetailContent(
    load(response.text),
    "https://example.invalid/unlisted",
  );
  const container = describeContainer(load(stripForContainer(response.text)));

  const detailText = projected.detailText ?? "";
  return {
    url,
    host: hostOf(url),
    title: item.title,
    status: "OK",
    httpStatus: response.status,
    configured,
    container,
    length: detailText.length,
    unscopedLength: (unscoped.detailText ?? "").length,
    htmlLength: (projected.detailHtml ?? "").length,
    // The invariant #71 established and #89 has to keep proving: an `only` or
    // `without` entry may change detailText and NOTHING else. Both are computed
    // from the same two projections above, so a rule that leaked out of the
    // text clone would show up here as a false on the very run that added it.
    htmlIdentical: projected.detailHtml === unscoped.detailHtml,
    assetsIdentical:
      JSON.stringify(assetInputs(projected)) ===
      JSON.stringify(assetInputs(unscoped)),
    sample: detailText.slice(0, SAMPLE_CHARS),
    descriptionLength: (item.descriptionText ?? "").length,
    bodyCoverage: coverage(item.descriptionText, detailText),
    chrome: detectChrome(detailText),
  };
};

/** The two inputs the asset scan in fetchDetailPage walks, as plain arrays. */
const assetInputs = ({ scopedContainer, detailContainer }) => {
  const container = scopedContainer ?? detailContainer;
  return {
    images: container
      .find("img[src]")
      .toArray()
      .map((el) => el.attribs.src),
    links: container
      .find("a[href]")
      .toArray()
      .map((el) => el.attribs.href),
  };
};

/**
 * extractDetailContent mutates the document it is given, so the container
 * question has to be asked on a separate copy that has had the same three
 * removals applied — otherwise a <header>-wrapped <article> would be reported
 * as selected when the projection had already dropped it.
 */
const stripForContainer = (html) => {
  const $ = load(html);
  $("script,style,noscript,iframe").remove();
  $("header,nav,footer").remove();
  $("title,base,head,meta").remove();
  return $.html();
};

const surveyFeed = async (feed) => {
  const result = {
    code: feed.code,
    name: feed.name,
    feedUrl: feed.url,
    skipDetailFetch: Boolean(feed.skipDetailFetch),
    items: [],
    googleHosts: null,
    error: null,
  };

  let xml;
  try {
    const response = await httpGetText(feed.url, {
      headers: {
        "User-Agent": "health.j172.tw-rss-ingestor/1.0",
        Accept:
          "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
      },
      timeoutMs: 15_000,
    });
    if (response.status < 200 || response.status >= 300) {
      result.error = `feed HTTP ${response.status}`;
      return result;
    }
    xml = response.text;
  } catch (error) {
    result.error = `feed fetch failed — ${error instanceof Error ? error.message : String(error)}`;
    return result;
  }

  const items = parseFeedXml(feed, xml);
  if (items.length === 0) {
    result.error = "feed parsed to zero items";
    return result;
  }

  if (hostOf(items[0].canonicalUrl) === "news.google.com") {
    result.googleHosts = googleNewsSourceHosts(xml);
    return result;
  }

  for (const item of items.slice(0, ITEMS_PER_FEED)) {
    result.items.push(await measureItem(item));
    await sleep(REQUEST_INTERVAL_MS);
  }
  return result;
};

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
const pad = (value, width) => {
  const text = String(value);
  // CJK renders double-width in a terminal; count it as two columns so the
  // table's rules line up instead of drifting a column per Chinese character.
  const visible = [...text].reduce(
    (sum, ch) => sum + (/[　-鿿＀-￯]/.test(ch) ? 2 : 1),
    0,
  );
  return text + " ".repeat(Math.max(1, width - visible));
};

const percent = (ratio) =>
  ratio === null || ratio === undefined
    ? "  n/a"
    : `${Math.round(ratio * 100)}%`.padStart(5);

const scopingLabel = (scoping) => {
  if (!scoping) return "-";
  if (scoping.mode === "skip") return "skip";
  return scoping.mode;
};

const feeds = ONLY_FEEDS.length
  ? RSS_FEEDS.filter((f) => ONLY_FEEDS.includes(f.code))
  : RSS_FEEDS;

console.log(
  `Surveying ${feeds.length} of ${RSS_FEEDS.length} feeds, ${ITEMS_PER_FEED} item(s) each.\n`,
);

const results = [];
for (const feed of feeds) {
  process.stderr.write(`  … ${feed.code}\n`);
  results.push(await surveyFeed(feed));
}

console.log("=".repeat(118));
console.log(
  pad("FEED", 22) +
    pad("HOST", 24) +
    pad("CONTAINER", 17) +
    pad("LEN", 7) +
    pad("BODY", 7) +
    pad("SCOPING", 26) +
    "CHROME",
);
console.log("=".repeat(118));

let defects = 0;
const unreachable = [];
const googleProxied = [];
const notFetched = [];
const noOpScoping = [];
const lowCoverage = [];

for (const result of results) {
  if (result.error) {
    console.log(
      pad(result.code, 22) + pad("(feed)", 24) + `FEED ERROR — ${result.error}`,
    );
    unreachable.push(`${result.code}: ${result.error}`);
    continue;
  }
  if (result.googleHosts) {
    const top = result.googleHosts
      .slice(0, 3)
      .map(([h, n]) => `${h}×${n}`)
      .join(", ");
    console.log(
      pad(result.code, 22) +
        pad("news.google.com", 24) +
        "GOOGLE-PROXIED — publishers: " +
        top,
    );
    googleProxied.push({ code: result.code, hosts: result.googleHosts });
    continue;
  }
  for (const item of result.items) {
    if (item.status === "UNREACHABLE") {
      console.log(
        pad(result.code, 22) +
          pad(item.host, 24) +
          `UNREACHABLE — ${item.note}`,
      );
      unreachable.push(`${result.code} (${item.host}): ${item.note}`);
      continue;
    }
    const emptyBody = item.length < 40 && item.descriptionLength >= 120;
    if (
      emptyBody &&
      !result.skipDetailFetch &&
      item.configured?.mode !== "skip"
    )
      defects += 1;
    if (result.skipDetailFetch)
      notFetched.push(`${result.code} (${item.host})`);

    // For a scoped host: how many characters the entry removed, and whether it
    // stayed out of detailHtml and the asset scan. A `-0` on an `only`/`without`
    // host is the failure this whole script exists to make visible — it means
    // the selector matched nothing and the projection silently degraded to the
    // unscoped container. `!!` means the rule leaked past the text clone.
    const scoped =
      item.configured && item.configured.mode !== "skip"
        ? `-${item.unscopedLength - item.length}` +
          (item.htmlIdentical && item.assetsIdentical ? "" : " !!")
        : "";
    console.log(
      pad(result.code + (result.skipDetailFetch ? " *" : ""), 22) +
        pad(item.host, 24) +
        pad(item.container, 17) +
        pad(item.length, 7) +
        pad(percent(item.bodyCoverage), 7) +
        pad(scopingLabel(item.configured) + (scoped && ` ${scoped}`), 26) +
        (item.chrome.join(",") || "-") +
        (emptyBody ? "   <<< EMPTY BODY" : ""),
    );
    if (scoped.endsWith("!!")) defects += 1;
    if (scoped.startsWith("-0")) {
      noOpScoping.push(`${result.code} (${item.host}) — ${item.url}`);
    }
    // The projection succeeded but found something other than the article. Not
    // an error on its own — a `skip` host is meant to look like this — but on
    // any other host it means either the wrong container or, as with
    // cdc_letters, the wrong URL.
    if (
      item.configured?.mode !== "skip" &&
      item.bodyCoverage !== null &&
      item.bodyCoverage < 0.4
    ) {
      lowCoverage.push(
        `${result.code} (${item.host}) — ${percent(item.bodyCoverage).trim()} of the feed description survives into ${item.length} chars: ${item.url}`,
      );
    }
  }
}

console.log("=".repeat(118));
console.log(
  "* = feed sets skipDetailFetch, so fetchDetailPage never runs for it; the row is informational only.",
);
console.log(
  "BODY = share of the feed description's 8-char shingles present in detailText (n/a = description too short to judge).",
);
console.log(
  "SCOPING -N = characters the host's table entry removed from detailText. -0 on an only/without host means the",
);
console.log(
  "selector matched NOTHING and the projection degraded to the unscoped container. `!!` means the entry also",
);
console.log("changed detailHtml or the asset scan, which it must never do.");

console.log("\n" + "-".repeat(112));
console.log("PER-SOURCE DETAIL");
console.log("-".repeat(112));
for (const result of results) {
  for (const item of result.items) {
    if (item.status !== "OK") continue;
    console.log(`\n[${result.code}] ${item.host} — ${result.name}`);
    console.log(`  url        ${item.url}`);
    console.log(`  title      ${item.title}`);
    console.log(
      `  container  ${item.container}   detailHtml ${item.htmlLength} chars`,
    );
    console.log(
      `  detailText ${item.length} chars (unscoped ${item.unscopedLength}), description ${item.descriptionLength} chars`,
    );
    console.log(`  first ${SAMPLE_CHARS}  ${item.sample}`);
    if (item.chrome.length)
      console.log(`  chrome     ${item.chrome.join(", ")}`);
  }
}

if (googleProxied.length) {
  console.log("\n" + "-".repeat(112));
  console.log(
    "GOOGLE-NEWS-PROXIED FEEDS — effective publisher hosts, from each item's <source url>",
  );
  console.log(
    "These never reach fetchDetailPage: canonicalUrl stays on news.google.com and the feed sets",
  );
  console.log(
    "skipDetailFetch. A scoping entry for any host below would be dead code today.",
  );
  console.log("-".repeat(112));
  for (const entry of googleProxied) {
    console.log(
      `  ${pad(entry.code, 24)}${entry.hosts.map(([h, n]) => `${h}×${n}`).join(", ")}`,
    );
  }
}

if (unreachable.length) {
  console.log("\n" + "-".repeat(112));
  console.log(
    "UNREACHABLE FROM THIS NETWORK — left on the default, unconfigured",
  );
  console.log("-".repeat(112));
  for (const line of unreachable) console.log(`  ${line}`);
}

if (noOpScoping.length) {
  console.log("\n" + "-".repeat(112));
  console.log(
    "NO-OP SCOPING — the host has a table entry whose selector matched nothing on this page",
  );
  console.log(
    "Read each one before assuming a redesign: a `without` legitimately removes nothing from a page",
  );
  console.log(
    "that never had that chrome, and a scoped host reached by the wrong URL will look like this too.",
  );
  console.log("-".repeat(112));
  for (const line of noOpScoping) console.log(`  ${line}`);
}

if (lowCoverage.length) {
  console.log("\n" + "-".repeat(112));
  console.log(
    "LOW BODY COVERAGE — the fetch worked but most of the feed's own description is missing from the text",
  );
  console.log(
    "i.e. the projection is looking at something other than this article.",
  );
  console.log("-".repeat(112));
  for (const line of lowCoverage) console.log(`  ${line}`);
}

console.log(
  `\n${defects} fetch-eligible source(s) fetched successfully but projected an empty body.`,
);
process.exit(defects > 0 ? 1 : 0);
