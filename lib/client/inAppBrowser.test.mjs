// Unit tests for the in-app browser UA detector (issue #365) — run with
// `npm test`.
//
// Same setup as lib/server/rss/freshness.test.mjs: node:test + node:assert
// only, no framework. The resolve hook lets this .mjs test import the
// TypeScript source directly instead of duplicating its logic.
import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

registerHooks({
  resolve(specifier, context, nextResolve) {
    let target = specifier;
    const parentURL = context.parentURL;
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

const { detectInAppBrowser } = await import("./inAppBrowser.ts");

// ---------------------------------------------------------------------------
// Positive cases — one real-world-shaped UA per app named in the spec.
// ---------------------------------------------------------------------------

test("detects LINE from a `Line/` token", () => {
  const ua =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Line/14.5.0";
  assert.deepEqual(detectInAppBrowser(ua), { isInAppBrowser: true, app: "line" });
});

test("detects Facebook (FBAN/FBAV) on Android", () => {
  const ua =
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.0.0 Mobile Safari/537.36 [FBAN/FB4A;FBAV/470.0.0.0.0;]";
  assert.deepEqual(detectInAppBrowser(ua), { isInAppBrowser: true, app: "facebook" });
});

test("detects Instagram from an `Instagram` token", () => {
  const ua =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 320.0.0.28.109 (iPhone15,3; iOS 18_0; en_US; en-US; scale=3.00; 1284x2778; 512000000)";
  assert.deepEqual(detectInAppBrowser(ua), { isInAppBrowser: true, app: "instagram" });
});

test("detects WeChat from a `MicroMessenger` token", () => {
  const ua =
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.0.0 Mobile Safari/537.36 MicroMessenger/8.0.49";
  assert.deepEqual(detectInAppBrowser(ua), { isInAppBrowser: true, app: "wechat" });
});

// ---------------------------------------------------------------------------
// Negative cases
// ---------------------------------------------------------------------------

test("a normal desktop Chrome UA is not flagged", () => {
  const ua =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
  assert.deepEqual(detectInAppBrowser(ua), { isInAppBrowser: false, app: null });
});

test("a normal mobile Safari UA is not flagged", () => {
  const ua =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
  assert.deepEqual(detectInAppBrowser(ua), { isInAppBrowser: false, app: null });
});

test("empty and missing UAs are not flagged", () => {
  assert.deepEqual(detectInAppBrowser(""), { isInAppBrowser: false, app: null });
  assert.deepEqual(detectInAppBrowser(null), { isInAppBrowser: false, app: null });
  assert.deepEqual(detectInAppBrowser(undefined), { isInAppBrowser: false, app: null });
});

test("Instagram is reported as instagram even if it also carries an FBAN/FBAV token", () => {
  // Some Meta-family webview builds carry both tokens; the more specific
  // Instagram label should win since that's the actual host app.
  const ua =
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.0.0 Mobile Safari/537.36 Instagram 320.0.0.28.109 Android [FBAN/FB4A;FBAV/470.0.0.0.0;]";
  assert.deepEqual(detectInAppBrowser(ua), { isInAppBrowser: true, app: "instagram" });
});
