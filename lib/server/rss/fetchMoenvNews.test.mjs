// Unit tests for fetchMoenvNews's MNEWS_P_10 (環境直達車 Podcast) handling —
// issue #134 — run with `npm test`.
//
// Same setup as fetchDetailPage.test.mjs: node:test + node:assert only, a
// module-resolution hook for "@/..." aliases and "server-only", and no real
// network — data.moenv.gov.tw is stubbed via __fixtures__/fakeMoenvHttpClient.mjs
// (redirected in place of the real @/lib/server/net/httpClient) and
// __fixtures__/fakeMoenvEnv.mjs (in place of @/lib/server/config/env, which
// would otherwise throw at import time over unrelated missing MYSQL_* vars).
import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const REPO_ROOT = new URL("../../../", import.meta.url);

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return { url: "data:text/javascript,", shortCircuit: true };
    }
    if (specifier === "@/lib/server/net/httpClient") {
      return nextResolve(
        new URL("./__fixtures__/fakeMoenvHttpClient.mjs", import.meta.url).href,
        context,
      );
    }
    if (specifier === "@/lib/server/config/env") {
      return nextResolve(
        new URL("./__fixtures__/fakeMoenvEnv.mjs", import.meta.url).href,
        context,
      );
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

// Dynamic, because the hooks above have to be registered before the graph loads.
const { fetchMoenvNews } = await import("./fetchMoenvNews.ts");
const { mockState } = await import("./__fixtures__/fakeMoenvHttpClient.mjs");

const resetMocks = () => {
  mockState.responses = {
    mnews: { status: 200, text: "[]" },
    inews: { status: 200, text: "[]" },
    podcast: { status: 200, text: "[]" },
  };
};

// "Today" relative to whatever the test runs, so the fixtures stay in/out of
// the 90-day recency window regardless of when the suite runs.
const daysAgo = (n) => {
  const d = new Date(Date.now() - n * 24 * 60 * 60 * 1000);
  const pad = (v) => String(v).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};

test("mnews_p_10 podcast: a fresh record with an image becomes one item tagged moenv_podcast", async () => {
  resetMocks();
  mockState.responses.podcast = {
    status: 200,
    text: JSON.stringify([
      {
        podcastid: "101",
        podcasttitle: "空氣品質與你我的健康",
        podcastcontent: "<p>本集介紹...</p>",
        podcasturl: "https://enews.moenv.gov.tw/podcast/101",
        publishdate: `${daysAgo(5)} 09:00:00`,
        image: "https://enews.moenv.gov.tw/podcast/101/cover.jpg",
      },
    ]),
  };

  const result = await fetchMoenvNews();
  assert.equal(result.ok, true);
  assert.equal(result.items.length, 1);

  const item = result.items[0];
  assert.equal(item.sourceName, "moenv");
  assert.equal(item.feedCode, "moenv_podcast");
  assert.equal(item.feedName, "環境部－環境直達車 Podcast");
  assert.equal(item.externalId, "podcast_101");
  assert.equal(item.title, "空氣品質與你我的健康");
  assert.equal(item.canonicalUrl, "https://enews.moenv.gov.tw/podcast/101");
  assert.equal(item.sourceUrl, "https://enews.moenv.gov.tw/podcast/101");
  assert.equal(item.detailHtml, "<p>本集介紹...</p>");
  assert.equal(item.detailText, "本集介紹...");
  assert.deepEqual(item.assets, [
    {
      assetType: "image",
      title: null,
      url: "https://enews.moenv.gov.tw/podcast/101/cover.jpg",
      sortOrder: 0,
    },
  ]);
});

test("mnews_p_10 podcast: a bare YYYY-MM-DD publishdate still parses", async () => {
  resetMocks();
  mockState.responses.podcast = {
    status: 200,
    text: JSON.stringify([
      {
        podcastid: "102",
        podcasttitle: "海岸廢棄物治理",
        podcastcontent: "內文",
        podcasturl: "https://enews.moenv.gov.tw/podcast/102",
        publishdate: daysAgo(3), // date-only, no time component
      },
    ]),
  };

  const result = await fetchMoenvNews();
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].externalId, "podcast_102");
  assert.ok(result.items[0].publishedAtUtc instanceof Date);
  assert.equal(result.items[0].assets.length, 0); // no image field -> no asset
});

test("mnews_p_10 podcast: a record older than the 90-day recency window is dropped", async () => {
  resetMocks();
  mockState.responses.podcast = {
    status: 200,
    text: JSON.stringify([
      {
        podcastid: "103",
        podcasttitle: "過期集數",
        podcastcontent: "內文",
        podcasturl: "https://enews.moenv.gov.tw/podcast/103",
        publishdate: `${daysAgo(120)} 09:00:00`,
      },
    ]),
  };

  const result = await fetchMoenvNews();
  assert.equal(result.items.length, 0);
});

test("mnews_p_10 podcast: a record missing podcastid is skipped", async () => {
  resetMocks();
  mockState.responses.podcast = {
    status: 200,
    text: JSON.stringify([
      {
        podcasttitle: "缺編號",
        podcastcontent: "內文",
        publishdate: `${daysAgo(1)} 09:00:00`,
      },
    ]),
  };

  const result = await fetchMoenvNews();
  assert.equal(result.items.length, 0);
});

test("mnews_p_01 news and mnews_p_10 podcast items coexist in one run, each with their own feedCode", async () => {
  resetMocks();
  mockState.responses.mnews = {
    status: 200,
    text: JSON.stringify([
      {
        newsno: "n1",
        newstitle: "環保新聞標題",
        newscontent: "<p>新聞內容</p>",
        newssource: "行政院環境保護署監資處",
        newsdate: `${daysAgo(2)} 08:00:00`,
        relativeurl: "-",
        deletemark: "0",
      },
    ]),
  };
  mockState.responses.podcast = {
    status: 200,
    text: JSON.stringify([
      {
        podcastid: "104",
        podcasttitle: "Podcast 標題",
        podcastcontent: "內文",
        podcasturl: "https://enews.moenv.gov.tw/podcast/104",
        publishdate: `${daysAgo(2)} 08:00:00`,
      },
    ]),
  };

  const result = await fetchMoenvNews();
  assert.equal(result.items.length, 2);

  const byFeedCode = Object.fromEntries(result.items.map((i) => [i.feedCode, i]));
  assert.equal(byFeedCode.moenv_mnews.sourceName, "moenv");
  assert.equal(byFeedCode.moenv_podcast.sourceName, "moenv");
  assert.equal(byFeedCode.moenv_mnews.externalId, "n1");
  assert.equal(byFeedCode.moenv_podcast.externalId, "podcast_104");
});
