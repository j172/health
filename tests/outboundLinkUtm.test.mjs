import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const REPO_ROOT = new URL("../", import.meta.url);

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

const {
  validateOutboundUrl,
  appendOutboundUtm,
  buildOutboundLink,
  getArticleDestination,
} = await import("../lib/format/outboundLink.ts");

test("validateOutboundUrl validates absolute https URLs and guards against open redirect", () => {
  assert.equal(
    validateOutboundUrl("https://example.com/news/123"),
    "https://example.com/news/123",
  );
  assert.equal(validateOutboundUrl("http://example.com"), null);
  assert.equal(validateOutboundUrl("javascript:alert(1)"), null);
  assert.equal(validateOutboundUrl("/internal/path"), null);
  assert.equal(validateOutboundUrl(""), null);
  assert.equal(validateOutboundUrl(null), null);
});

test("appendOutboundUtm appends standard utm_source=health.j172.tw", () => {
  const result = appendOutboundUtm("https://news.cwa.gov.tw/article/1");
  const parsed = new URL(result);

  assert.equal(parsed.hostname, "news.cwa.gov.tw");
  assert.equal(parsed.searchParams.get("utm_source"), "health.j172.tw");
  assert.equal(parsed.searchParams.get("utm_medium"), "referral");
});

test("appendOutboundUtm supports custom medium, campaign, and content options", () => {
  const result = appendOutboundUtm("https://kuma-academy.org/", {
    medium: "civic_partner",
    campaign: "civic_alliance",
    content: "homepage_banner",
  });
  const parsed = new URL(result);

  assert.equal(parsed.searchParams.get("utm_source"), "health.j172.tw");
  assert.equal(parsed.searchParams.get("utm_medium"), "civic_partner");
  assert.equal(parsed.searchParams.get("utm_campaign"), "civic_alliance");
  assert.equal(parsed.searchParams.get("utm_content"), "homepage_banner");
});

test("appendOutboundUtm preserves existing query parameters on the target URL", () => {
  const result = appendOutboundUtm("https://example.com/search?q=health&page=2", {
    medium: "tool_outbound",
  });
  const parsed = new URL(result);

  assert.equal(parsed.searchParams.get("q"), "health");
  assert.equal(parsed.searchParams.get("page"), "2");
  assert.equal(parsed.searchParams.get("utm_source"), "health.j172.tw");
  assert.equal(parsed.searchParams.get("utm_medium"), "tool_outbound");
});

test("appendOutboundUtm respects existing utm_source and does not overwrite", () => {
  const upstream = "https://example.com/?utm_source=partner_custom&utm_medium=custom_med";
  const result = appendOutboundUtm(upstream, {
    medium: "news_outbound",
  });
  const parsed = new URL(result);

  assert.equal(parsed.searchParams.get("utm_source"), "partner_custom");
  assert.equal(parsed.searchParams.get("utm_medium"), "custom_med");
});

test("buildOutboundLink directly produces outbound URL with UTM without /out wrapper", () => {
  const link = buildOutboundLink("https://example.com/article/99");
  assert.ok(!link.startsWith("/out?url="));

  const parsed = new URL(link);
  assert.equal(parsed.hostname, "example.com");
  assert.equal(parsed.pathname, "/article/99");
  assert.equal(parsed.searchParams.get("utm_source"), "health.j172.tw");
  assert.equal(parsed.searchParams.get("utm_medium"), "news_outbound");
  assert.equal(parsed.searchParams.get("utm_campaign"), "news_source");
});

test("getArticleDestination routes official gov sources to internal article page", () => {
  const govSources = ["cdc", "cwa", "tfda", "mohw", "hpa", "moenv"];
  for (const source of govSources) {
    const dest = getArticleDestination({
      id: 42,
      source_name: source,
      canonical_url: "https://www.cdc.gov.tw/Bulletin/Detail/123",
    });
    assert.equal(dest.isExternal, false);
    assert.equal(dest.href, "/news/42");
    assert.equal(dest.target, undefined);
  }
});

test("getArticleDestination routes non-gov sources directly to external canonical URL with UTM in new tab", () => {
  const nonGovSources = ["shih_hsin", "ltn", "heho", "twreporter", "unknown_source"];
  for (const source of nonGovSources) {
    const dest = getArticleDestination(
      {
        id: 88,
        source_name: source,
        canonical_url: "https://news.example.org/health/article/888",
      },
      "news_card",
    );
    assert.equal(dest.isExternal, true);
    assert.equal(dest.target, "_blank");
    assert.equal(dest.rel, "noopener noreferrer");

    const parsed = new URL(dest.href);
    assert.equal(parsed.origin, "https://news.example.org");
    assert.equal(parsed.pathname, "/health/article/888");
    assert.equal(parsed.searchParams.get("utm_source"), "health.j172.tw");
    assert.equal(parsed.searchParams.get("utm_medium"), "news_card");
    assert.equal(parsed.searchParams.get("utm_campaign"), "news_source");
  }
});

test("getArticleDestination falls back to internal route if canonical_url is missing or invalid for non-gov", () => {
  const fallbackDest = getArticleDestination({
    id: 99,
    source_name: "ltn",
    canonical_url: null,
  });
  assert.equal(fallbackDest.isExternal, false);
  assert.equal(fallbackDest.href, "/news/99");
});
