import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

process.env.MYSQL_HOST = process.env.MYSQL_HOST || "127.0.0.1";
process.env.MYSQL_USER = process.env.MYSQL_USER || "root";
process.env.MYSQL_PASSWORD = process.env.MYSQL_PASSWORD || "";
process.env.MYSQL_DATABASE = process.env.MYSQL_DATABASE || "health_db";

const REPO_ROOT = new URL("../../../", import.meta.url);

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return { url: "data:text/javascript,", shortCircuit: true };
    }
    if (specifier === "@/lib/server/config/env" || specifier.endsWith("/env.ts")) {
      return { url: "data:text/javascript,export const env = { mysql: {} };", shortCircuit: true };
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

const { isDuplicateRecentImage } = await import("./duplicateImageDetection.ts");

test("isDuplicateRecentImage: flags an exact URL match against a Set", () => {
  const recent = new Set([
    "https://news.pchome.com.tw/img/article-10bc08be933f8f49fff1a7a1.jpg",
  ]);
  assert.equal(
    isDuplicateRecentImage(
      recent,
      "https://news.pchome.com.tw/img/article-10bc08be933f8f49fff1a7a1.jpg",
    ),
    true,
  );
});

test("isDuplicateRecentImage: flags an exact URL match against a plain array", () => {
  const recent = [
    "https://example.com/placeholder.jpg",
    "https://example.com/other.jpg",
  ];
  assert.equal(isDuplicateRecentImage(recent, "https://example.com/placeholder.jpg"), true);
});

test("isDuplicateRecentImage: does not flag a URL that has not been seen", () => {
  const recent = new Set(["https://example.com/placeholder.jpg"]);
  assert.equal(isDuplicateRecentImage(recent, "https://example.com/real-photo-42.jpg"), false);
});

test("isDuplicateRecentImage: does not flag a near-miss (different query string)", () => {
  const recent = new Set(["https://example.com/photo.jpg?v=1"]);
  assert.equal(isDuplicateRecentImage(recent, "https://example.com/photo.jpg?v=2"), false);
});

test("isDuplicateRecentImage: null/undefined/empty image URL is never a duplicate", () => {
  const recent = new Set(["https://example.com/placeholder.jpg"]);
  assert.equal(isDuplicateRecentImage(recent, null), false);
  assert.equal(isDuplicateRecentImage(recent, undefined), false);
  assert.equal(isDuplicateRecentImage(recent, ""), false);
});

test("isDuplicateRecentImage: empty recent set never flags anything", () => {
  assert.equal(isDuplicateRecentImage(new Set(), "https://example.com/anything.jpg"), false);
  assert.equal(isDuplicateRecentImage([], "https://example.com/anything.jpg"), false);
});

test("isDuplicateRecentImage: simulates the PChome shared-placeholder scenario across a batch", () => {
  // First article in the batch legitimately gets the list page's only <img>
  // (which happens to be the category's shared placeholder) — first use is
  // accepted, only repeats within the batch get flagged.
  const seenThisBatch = new Set();
  const placeholder = "https://news.pchome.com.tw/img/article-10bc08be933f8f49fff1a7a1.jpg";

  const article1IsDup = isDuplicateRecentImage(seenThisBatch, placeholder);
  assert.equal(article1IsDup, false);
  seenThisBatch.add(placeholder);

  const article2IsDup = isDuplicateRecentImage(seenThisBatch, placeholder);
  assert.equal(article2IsDup, true, "a second, unrelated article reusing the exact same URL must be flagged");

  // A third article with its own distinct photo must not be flagged.
  const article3IsDup = isDuplicateRecentImage(seenThisBatch, "https://news.pchome.com.tw/img/article-real-photo-99.jpg");
  assert.equal(article3IsDup, false);
});
