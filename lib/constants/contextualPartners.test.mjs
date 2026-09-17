import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CONTEXTUAL_PARTNERS,
  buildContextualPartnerUrl,
} from "./contextualPartners.ts";

test("CONTEXTUAL_PARTNERS contains all 5 approved civic partners", () => {
  const expectedPartners = ["metawilo", "kuma", "anti-cw", "g0v", "council2026"];
  for (const id of expectedPartners) {
    assert.ok(CONTEXTUAL_PARTNERS[id], `Missing partner: ${id}`);
    assert.ok(CONTEXTUAL_PARTNERS[id].baseUrl.startsWith("https://"));
    assert.ok(CONTEXTUAL_PARTNERS[id].name.length > 0);
    assert.ok(CONTEXTUAL_PARTNERS[id].badge.length > 0);
    assert.ok(CONTEXTUAL_PARTNERS[id].defaultTitle.length > 0);
    assert.ok(CONTEXTUAL_PARTNERS[id].defaultDescription.length > 0);
  }
});

test("buildContextualPartnerUrl attaches standard civic partner UTM parameters", () => {
  const base = "https://metawilo.com/";
  const url = buildContextualPartnerUrl(base);
  const parsed = new URL(url);

  assert.equal(parsed.hostname, "metawilo.com");
  assert.equal(parsed.searchParams.get("utm_source"), "health.j172.tw");
  assert.equal(parsed.searchParams.get("utm_medium"), "contextual_banner");
  assert.equal(parsed.searchParams.get("utm_campaign"), "civic_partner");
});

test("buildContextualPartnerUrl supports custom subpaths and preserves existing query params", () => {
  const base = "https://kuma-academy.org/";
  const url = buildContextualPartnerUrl(base, "courses");
  const parsed = new URL(url);

  assert.equal(parsed.hostname, "kuma-academy.org");
  assert.equal(parsed.pathname, "/courses");
  assert.equal(parsed.searchParams.get("utm_source"), "health.j172.tw");
});

test("buildContextualPartnerUrl respects custom UTM parameter overrides", () => {
  const base = "https://g0v.tw/intl/zh-TW/event/";
  const url = buildContextualPartnerUrl(base, undefined, {
    utm_medium: "custom_medium",
  });
  const parsed = new URL(url);

  assert.equal(parsed.searchParams.get("utm_source"), "health.j172.tw");
  assert.equal(parsed.searchParams.get("utm_medium"), "custom_medium");
  assert.equal(parsed.searchParams.get("utm_campaign"), "civic_partner");
});
