import test from "node:test";
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

const { checkSuspiciousUrl, normalizeHost, buildCandidateHosts } = await import(
  "./checkSuspiciousUrl.ts"
);

// ---------------------------------------------------------------------------
// normalizeHost
// ---------------------------------------------------------------------------

test("normalizeHost: accepts a full https URL with path and query", () => {
  assert.equal(normalizeHost("https://example.com/path?x=1"), "example.com");
});

test("normalizeHost: accepts a bare domain with no scheme", () => {
  assert.equal(normalizeHost("example.com"), "example.com");
});

test("normalizeHost: lower-cases a mixed-case host", () => {
  assert.equal(normalizeHost("LOGIN.Scam-Example.COM"), "login.scam-example.com");
});

test("normalizeHost: strips a non-default port", () => {
  assert.equal(normalizeHost("example.com:8443/x"), "example.com");
  assert.equal(normalizeHost("https://example.com:8443/x"), "example.com");
});

test("normalizeHost: strips a trailing dot", () => {
  assert.equal(normalizeHost("example.com."), "example.com");
  assert.equal(normalizeHost("https://example.com./path"), "example.com");
});

test("normalizeHost: handles a path and query string with no scheme", () => {
  assert.equal(normalizeHost("example.com/path/to/page?x=1&y=2"), "example.com");
});

test("normalizeHost: converts a Chinese (IDN) domain to punycode", () => {
  assert.equal(normalizeHost("詐騙.tw"), "xn--912aw42a.tw");
  assert.equal(normalizeHost("https://詐騙.tw/path"), "xn--912aw42a.tw");
});

test("normalizeHost: passes through an already-punycode domain unchanged", () => {
  assert.equal(normalizeHost("xn--912aw42a.tw"), "xn--912aw42a.tw");
});

test("normalizeHost: trims surrounding whitespace", () => {
  assert.equal(normalizeHost("  example.com  "), "example.com");
});

test("normalizeHost: rejects an empty or whitespace-only string", () => {
  assert.equal(normalizeHost(""), null);
  assert.equal(normalizeHost("   "), null);
});

test("normalizeHost: rejects a string with no domain shape at all", () => {
  assert.equal(normalizeHost("not a url at all"), null);
});

test("normalizeHost: rejects a bare number (would otherwise misparse as an IPv4 shorthand)", () => {
  assert.equal(normalizeHost("165"), null);
});

test("normalizeHost: rejects a single-label host with no TLD", () => {
  assert.equal(normalizeHost("localhost"), null);
});

test("normalizeHost: rejects a malformed host with an empty label", () => {
  assert.equal(normalizeHost("http://a..b.com"), null);
});

// ---------------------------------------------------------------------------
// buildCandidateHosts
// ---------------------------------------------------------------------------

test("buildCandidateHosts: a plain registrable domain yields only itself", () => {
  assert.deepEqual(buildCandidateHosts("example.com"), ["example.com"]);
});

test("buildCandidateHosts: climbs from a subdomain up to its registrable domain, then stops before the bare TLD", () => {
  assert.deepEqual(buildCandidateHosts("login.scam-example.com"), [
    "login.scam-example.com",
    "scam-example.com",
  ]);
});

test("buildCandidateHosts: climbs across a compound public suffix (.com.tw) and stops before it", () => {
  assert.deepEqual(buildCandidateHosts("a.b.foo.com.tw"), [
    "a.b.foo.com.tw",
    "b.foo.com.tw",
    "foo.com.tw",
  ]);
});

test("buildCandidateHosts: stops climbing at a shared platform domain — only the tenant subdomain is a candidate", () => {
  assert.deepEqual(buildCandidateHosts("u0pmj3-kv.myshopify.com"), [
    "u0pmj3-kv.myshopify.com",
  ]);
  assert.deepEqual(buildCandidateHosts("funny-daffodil-cd1f66.netlify.app"), [
    "funny-daffodil-cd1f66.netlify.app",
  ]);
});

test("buildCandidateHosts: querying the bare platform domain itself still checks that literal host", () => {
  assert.deepEqual(buildCandidateHosts("myshopify.com"), ["myshopify.com"]);
});

// ---------------------------------------------------------------------------
// checkSuspiciousUrl
// ---------------------------------------------------------------------------

const hit = (overrides = {}) => ({
  domain: "scam-example.com",
  source: "police_176455",
  siteNature: "金融保險",
  reportedYearMonth: "11509",
  ...overrides,
});

test("checkSuspiciousUrl: invalid input never calls findDomains and returns status invalid", async () => {
  const findDomains = async () => {
    throw new Error("findDomains must not be called for invalid input");
  };
  const result = await checkSuspiciousUrl("not a url at all", findDomains);
  assert.deepEqual(result, { status: "invalid", normalizedHost: null, hits: [] });
});

test("checkSuspiciousUrl: empty string is invalid, not not-listed", async () => {
  const result = await checkSuspiciousUrl("", async () => {
    throw new Error("must not be called");
  });
  assert.equal(result.status, "invalid");
});

test("checkSuspiciousUrl: a clean domain with no hits is not-listed", async () => {
  const result = await checkSuspiciousUrl("https://www.gov.tw/", async () => []);
  assert.equal(result.status, "not-listed");
  assert.deepEqual(result.hits, []);
  assert.equal(result.normalizedHost, "www.gov.tw");
});

test("checkSuspiciousUrl: a full URL with path/query that matches returns matched with the hit", async () => {
  const theHit = hit();
  const result = await checkSuspiciousUrl(
    "https://scam-example.com/login?redirect=1",
    async (candidates) => {
      assert.ok(candidates.includes("scam-example.com"));
      return [theHit];
    },
  );
  assert.equal(result.status, "matched");
  assert.equal(result.normalizedHost, "scam-example.com");
  assert.deepEqual(result.hits, [theHit]);
});

test("checkSuspiciousUrl: a bare domain with no scheme matches the same way as a full URL", async () => {
  const result = await checkSuspiciousUrl("scam-example.com", async () => [hit()]);
  assert.equal(result.status, "matched");
});

test("checkSuspiciousUrl: mixed-case input matches regardless of case", async () => {
  const result = await checkSuspiciousUrl("SCAM-EXAMPLE.com", async () => [hit()]);
  assert.equal(result.status, "matched");
});

test("checkSuspiciousUrl: a subdomain of a reported registrable domain surfaces the parent's hit", async () => {
  const result = await checkSuspiciousUrl(
    "http://login.scam-example.com/",
    async (candidates) => {
      assert.deepEqual(candidates, ["login.scam-example.com", "scam-example.com"]);
      return [hit({ domain: "scam-example.com" })];
    },
  );
  assert.equal(result.status, "matched");
});

test("checkSuspiciousUrl: an unlisted tenant subdomain on a public platform is not-listed, not falsely matched via the platform root", async () => {
  const result = await checkSuspiciousUrl(
    "https://totally-fine-shop.myshopify.com/",
    async (candidates) => {
      // The platform root must never even be offered as a candidate.
      assert.ok(!candidates.includes("myshopify.com"));
      return [];
    },
  );
  assert.equal(result.status, "not-listed");
});

test("checkSuspiciousUrl: a Chinese (IDN) domain normalizes to punycode and still matches", async () => {
  const result = await checkSuspiciousUrl("https://詐騙.tw/", async (candidates) => {
    assert.deepEqual(candidates, ["xn--912aw42a.tw"]);
    return [hit({ domain: "xn--912aw42a.tw" })];
  });
  assert.equal(result.status, "matched");
  assert.equal(result.normalizedHost, "xn--912aw42a.tw");
});

test("checkSuspiciousUrl: a host with a non-default port still matches", async () => {
  const result = await checkSuspiciousUrl("https://scam-example.com:8443/", async () => [hit()]);
  assert.equal(result.status, "matched");
});

test("checkSuspiciousUrl: a host with a trailing dot still matches", async () => {
  const result = await checkSuspiciousUrl("https://scam-example.com./", async () => [hit()]);
  assert.equal(result.status, "matched");
});

test("checkSuspiciousUrl: multiple sources hitting the same domain all surface in hits", async () => {
  const hits = [
    hit({ source: "police_176455" }),
    hit({ source: "moda_165027" }),
  ];
  const result = await checkSuspiciousUrl("scam-example.com", async () => hits);
  assert.equal(result.status, "matched");
  assert.equal(result.hits.length, 2);
  assert.deepEqual(result.hits.map((h) => h.source).sort(), ["moda_165027", "police_176455"]);
});

test("checkSuspiciousUrl: does not call any logging or write function (console.*) during normal operation", async () => {
  const originalConsole = { ...console };
  const explode = (method) => () => {
    throw new Error(`checkSuspiciousUrl must not call console.${method}`);
  };
  console.log = explode("log");
  console.warn = explode("warn");
  console.error = explode("error");
  console.info = explode("info");
  console.debug = explode("debug");

  try {
    await checkSuspiciousUrl("not a url at all", async () => {
      throw new Error("must not be called");
    });
    await checkSuspiciousUrl("https://scam-example.com/", async () => [hit()]);
    await checkSuspiciousUrl("https://clean-site.gov.tw/", async () => []);
    await checkSuspiciousUrl("", async () => {
      throw new Error("must not be called");
    });
  } finally {
    Object.assign(console, originalConsole);
  }
});
