import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateOutboundUrl,
  appendOutboundUtm,
  buildOutboundLink,
} from "../lib/format/outboundLink.ts";

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

test("buildOutboundLink encodes tagged destination URL with news_outbound defaults", () => {
  const link = buildOutboundLink("https://example.com/article/99");
  assert.ok(link.startsWith("/out?url="));

  const encodedUrl = link.replace("/out?url=", "");
  const decodedUrl = decodeURIComponent(encodedUrl);
  const parsed = new URL(decodedUrl);

  assert.equal(parsed.hostname, "example.com");
  assert.equal(parsed.pathname, "/article/99");
  assert.equal(parsed.searchParams.get("utm_source"), "health.j172.tw");
  assert.equal(parsed.searchParams.get("utm_medium"), "news_outbound");
  assert.equal(parsed.searchParams.get("utm_campaign"), "news_source");
});
