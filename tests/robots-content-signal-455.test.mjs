import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { registerHooks } from "node:module";

// Issue #455 (2.0 §T item 347): robots.txt must declare Content Signals
// (search/ai-input/ai-train, all "yes") for the "*" user-agent group,
// alongside the existing per-bot explicit allows — matching this repo's
// `other` the GPTBot/ClaudeBot/etc. allows. app/robots.ts is a plain .ts
// file with no JSX, so it's imported and exercised directly via the
// registerHooks resolve-hook shim used throughout tests/*.test.mjs.

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
      for (const extension of [".ts", ".tsx", ".mjs", ".js"]) {
        const candidate = new URL(target + extension, parentURL);
        if (existsSync(fileURLToPath(candidate))) {
          return nextResolve(target + extension, { ...context, parentURL });
        }
      }
    }
    return nextResolve(target, { ...context, parentURL });
  },
});

const { default: robots } = await import("../app/robots.ts");

test("robots(): the '*' rule declares Content-Signal with all 3 signals set to yes", () => {
  const result = robots();
  const wildcardRule = result.rules.find((r) => r.userAgent === "*");
  assert.ok(wildcardRule, "expected a userAgent: '*' rule");
  assert.equal(wildcardRule.other?.["Content-Signal"], "search=yes, ai-input=yes, ai-train=yes");
});

test("robots(): the explicit per-bot AI crawler allows (issue #455's prerequisite) are still present", () => {
  const result = robots();
  const agents = result.rules.map((r) => r.userAgent);
  for (const bot of ["GPTBot", "ClaudeBot", "PerplexityBot"]) {
    assert.ok(agents.includes(bot), `expected an explicit allow rule for ${bot}`);
  }
});

test("robots(): the '*' rule still disallows admin/internal paths (Content-Signal addition must not loosen this)", () => {
  const result = robots();
  const wildcardRule = result.rules.find((r) => r.userAgent === "*");
  assert.deepEqual(wildcardRule.disallow, ["/admin/", "/api/admin/", "/api/internal/"]);
});
