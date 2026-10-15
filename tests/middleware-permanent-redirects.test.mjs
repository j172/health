import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";

// Live 2026-10-15: EVERY permanent (308) redirect on the site returned 500 —
// not just a handful of old ones, all 80+ entries, including one shipped
// the same day (#590's /tools/earthquakes). Root cause: next.config.js's
// redirects() always adds a non-standard `Refresh` header to any 308
// (node_modules/next/dist/server/base-http/index.js), and something between
// Cloudflare and this host's LiteSpeed-fronted origin can't handle that —
// confirmed NOT this session's own Node 24 switch (#634, ruled out by a
// controlled rollback-and-retest: still 500 on v20.20.2) and NOT any
// Cloudflare WAF/Transform/Page Rule (none found via the API touch
// Location/Refresh or inspect redirect responses at all). Moved every
// permanent redirect to middleware.ts, which uses NextResponse.redirect() —
// confirmed to never add that header by reading
// node_modules/next/dist/server/web/spec-extension/response.js.

const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));
registerHooks({
  resolve(specifier, context, nextResolve) {
    let target = specifier;
    let parentURL = context.parentURL;
    if (specifier.startsWith("@/")) {
      target = `./${specifier.slice(2)}`;
      parentURL = new URL(REPO_ROOT.replace(/\\/g, "/").startsWith("file:") ? REPO_ROOT : `file:///${REPO_ROOT.replace(/\\/g, "/")}`).href;
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

const { PERMANENT_REDIRECT_RULES, REDIRECT_LOCALES } = await import("../lib/redirects/permanentRedirectRules.ts");

const read = (...parts) => fs.readFileSync(`${REPO_ROOT}${parts.join("/")}`, "utf8");

/** Strips `/* */` and `//` comments so a check doesn't false-positive on explanatory prose mentioning the thing it's checking for. */
const stripLineComments = (src) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");

test("next.config.js no longer defines any permanent:true redirect — only the pre-existing non-permanent /emergency entry", () => {
  const code = stripLineComments(read("next.config.js"));
  assert.doesNotMatch(code, /permanent:\s*true/, "a permanent:true entry here would re-emit the Refresh header and 500 again");
  assert.match(code, /source:\s*"\/emergency"/);
  assert.match(code, /permanent:\s*false/);
});

test("middleware.ts uses NextResponse.redirect(), never next.config.js-style redirects() for permanent redirects", () => {
  const content = read("middleware.ts");
  assert.match(content, /NextResponse\.redirect\(/);
  assert.match(content, /\b308\b/);
  assert.match(content, /PERMANENT_REDIRECT_RULES/);
});

test("the rules file carries over every previously-hand-written simple redirect", () => {
  const expected = [
    ["/tools/hakka-community", "/tools/long-term-care?type=hakka-bogong"],
    ["/tools/tax-organizations", "/tools/npo-organizations"],
    ["/tools/child-welfare-nurseries", "/tools/child-welfare-institutions"],
    ["/tools/child-welfare-centers", "/tools/child-welfare-institutions"],
    ["/tools/green-hotels", "/tools/green-certifications?tab=green-hotels"],
    ["/tools/green-products", "/tools/green-certifications?tab=green-products"],
    ["/tools/green-restaurants", "/tools/green-certifications?tab=green-restaurants"],
    ["/tools/water-level-stations", "/tools/water-conditions"],
    ["/tools/reservoir-status", "/tools/water-conditions"],
    ["/tools/family-cultural-activities", "/tools/cultural-events"],
    ["/tools/carbon-footprint-products", "/tools/carbon-footprint"],
    ["/tools/carbon-footprint-coefficients", "/tools/carbon-footprint"],
    ["/tools/ltc-contracted", "/tools/long-term-care"],
    ["/tools/green-shops", "/tools/green-certifications?tab=green-shops"],
    ["/tools/cpc-stations", "/tools/cpc-prices?tab=stations"],
    ["/tools/home-healthcare", "/tools/long-term-care?type=home-healthcare"],
    ["/tools/elder-welfare", "/tools/long-term-care?type=elder-welfare"],
    ["/tools/hakka-bogong", "/tools/long-term-care?type=hakka-bogong"],
    ["/tools/earthquakes", "/tools/global-watch/earthquakes"],
    ["/tools/travel-epidemic-alerts", "/tools/global-watch/epidemics"],
  ];
  for (const [source, destination] of expected) {
    const rule = PERMANENT_REDIRECT_RULES.find((r) => r.source === source && !r.has);
    assert.ok(rule, `missing simple redirect for ${source}`);
    assert.equal(rule.destination, destination);
    assert.equal(rule.permanent, true);
  }
});

test("every locale's earthquakes redirect is carried over", () => {
  for (const locale of REDIRECT_LOCALES) {
    const rule = PERMANENT_REDIRECT_RULES.find((r) => r.source === `/${locale}/tools/earthquakes`);
    assert.ok(rule, `missing ${locale} earthquakes redirect`);
    assert.equal(rule.destination, `/${locale}/tools/global-watch/earthquakes`);
  }
});

test("every ?lang= tool-slug redirect is carried over, scoped by locale via `has`", () => {
  const slugs = [
    "aed", "er-status", "emergency-hotlines", "clinics", "pharmacies", "public-toilets",
    "youbike", "metro-alerts", "accessible-transit", "weather-alerts", "aqi", "uv",
    "disaster-map", "cool-spots", "cultural-events", "heritage-map", "tourism-factories",
  ];
  for (const locale of REDIRECT_LOCALES) {
    for (const slug of slugs) {
      const rule = PERMANENT_REDIRECT_RULES.find(
        (r) => r.source === `/tools/${slug}` && r.has?.value === locale,
      );
      assert.ok(rule, `missing ?lang=${locale} redirect for /tools/${slug}`);
      assert.equal(rule.destination, `/${locale}/tools/${slug}`);
      assert.deepEqual(rule.has, { type: "query", key: "lang", value: locale });
    }
  }
});

test("every ?lang= standalone-page redirect is carried over", () => {
  const pages = [
    ["/", (l) => `/${l}`],
    ["/nearby", (l) => `/${l}/nearby`],
    ["/guides/typhoon-earthquake", (l) => `/${l}/guides/typhoon-earthquake`],
  ];
  for (const locale of REDIRECT_LOCALES) {
    for (const [source, dest] of pages) {
      const rule = PERMANENT_REDIRECT_RULES.find((r) => r.source === source && r.has?.value === locale);
      assert.ok(rule, `missing ?lang=${locale} redirect for ${source}`);
      assert.equal(rule.destination, dest(locale));
    }
  }
});

test("no ?lang= catch-all redirect exists (regression guard from issue #485: that was a same-path self-redirect loop)", () => {
  const catchAll = PERMANENT_REDIRECT_RULES.find((r) => r.source === "/:path*" || r.destination === "/:path*");
  assert.equal(catchAll, undefined);
});

test("middleware's matcher covers every rule's source path prefix", () => {
  const content = read("middleware.ts");
  const matcherMatch = content.match(/matcher:\s*\[([^\]]+)\]/s);
  assert.ok(matcherMatch, "middleware.ts must export a static matcher config");
  const matcher = matcherMatch[1];
  for (const rule of PERMANENT_REDIRECT_RULES) {
    const coveredByRoot = rule.source === "/" && matcher.includes('"/"');
    const coveredByPrefix = [...matcher.matchAll(/"([^"]+)"/g)].some(
      (m) => m[1] !== "/" && (rule.source === m[1].replace(/:path\*$/, "") || rule.source.startsWith(m[1].replace(/:path\*$/, ""))),
    );
    assert.ok(coveredByRoot || coveredByPrefix, `middleware matcher doesn't cover rule source ${rule.source}`);
  }
});

test("simulated request matching reproduces NextResponse.redirect(url, 308) with no Refresh header involved", () => {
  // Pure logic reimplementation of middleware.ts's matching loop — same
  // shape as this repo's established convention for verifying "use client"/
  // Edge-runtime files that can't be imported directly by node --test (see
  // tests/useSharedGeolocation.test.mjs and similar).
  function resolveRedirect(pathname, searchParams) {
    for (const rule of PERMANENT_REDIRECT_RULES) {
      if (rule.source !== pathname) continue;
      if (rule.has && searchParams.get(rule.has.key) !== rule.has.value) continue;
      return { destination: rule.destination, status: 308 };
    }
    return null;
  }

  assert.deepEqual(resolveRedirect("/tools/green-shops", new URLSearchParams()), {
    destination: "/tools/green-certifications?tab=green-shops",
    status: 308,
  });
  assert.deepEqual(resolveRedirect("/tools/aed", new URLSearchParams("lang=en")), {
    destination: "/en/tools/aed",
    status: 308,
  });
  assert.equal(resolveRedirect("/tools/aed", new URLSearchParams("lang=fr")), null, "unsupported locale must not match");
  assert.equal(resolveRedirect("/tools/aed", new URLSearchParams()), null, "no lang param must not match a ?lang= rule");
  assert.equal(resolveRedirect("/tools/not-a-real-redirect", new URLSearchParams()), null);

  const code = stripLineComments(read("middleware.ts"));
  assert.doesNotMatch(code, /Refresh/, "middleware.ts must never manually add back the problematic Refresh header");
});
