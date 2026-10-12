import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Regression guard for issue #482 ("固定數量的靜態圖片改用 Cloudflare 邊緣圖片轉換"):
// the new lib/format/cfImageUrl.ts helper must only ever produce
// `/cdn-cgi/image/...` URLs for the fixed, small-count static asset
// categories named in the issue (today: the site logo) — never for news
// images, whose count grows daily and would blow through Cloudflare's free
// 5,000-unique-transformations/month budget ("新聞圖片維持現有處理方式，
// 沒有被這次變更影響").

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

const { cfImageUrl, isAllowedForCfImageTransform } = await import(
  "../lib/format/cfImageUrl.ts"
);

test("cfImageUrl builds a /cdn-cgi/image/ URL with onerror=redirect for the allowed logo path", () => {
  const url = cfImageUrl("/images/logo/j172tw-health-logo.png", {
    width: 72,
    format: "auto",
  });
  assert.equal(
    url,
    "/cdn-cgi/image/width=72,format=auto,onerror=redirect/images/logo/j172tw-health-logo.png",
  );
});

test("cfImageUrl defaults format to auto and always appends onerror=redirect", () => {
  const url = cfImageUrl("/images/logo/j172tw-health-logo.png");
  assert.match(url, /^\/cdn-cgi\/image\//);
  assert.match(url, /format=auto/);
  assert.match(url, /onerror=redirect/);
  assert.ok(url.endsWith("/images/logo/j172tw-health-logo.png"));
});

test("isAllowedForCfImageTransform allows the logo path", () => {
  assert.equal(
    isAllowedForCfImageTransform("/images/logo/j172tw-health-logo.png"),
    true,
  );
});

test("isAllowedForCfImageTransform rejects news image paths", () => {
  assert.equal(isAllowedForCfImageTransform("/images/news/article-1.jpg"), false);
  assert.equal(
    isAllowedForCfImageTransform("/images/news/2026/10/13/foo.webp"),
    false,
  );
});

test("isAllowedForCfImageTransform rejects remote URLs (Unsplash/Pexels/arbitrary OG sources)", () => {
  assert.equal(
    isAllowedForCfImageTransform("https://images.unsplash.com/photo-1"),
    false,
  );
  assert.equal(
    isAllowedForCfImageTransform("https://images.pexels.com/photos/1/x.jpg"),
    false,
  );
  assert.equal(isAllowedForCfImageTransform("http://example.com/x.png"), false);
});

test("isAllowedForCfImageTransform rejects unrecognized /images/ subdirectories (not part of this ticket's 3 categories)", () => {
  assert.equal(isAllowedForCfImageTransform("/images/blog/cover.jpg"), false);
  assert.equal(isAllowedForCfImageTransform("/images/og/tools.png"), false);
  assert.equal(isAllowedForCfImageTransform("/images/hero/banner.jpg"), false);
});

test("cfImageUrl throws for a news image path instead of silently passing it through", () => {
  assert.throws(() => cfImageUrl("/images/news/article-1.jpg"), /not an allowed/);
});

test("cfImageUrl throws for a remote URL", () => {
  assert.throws(
    () => cfImageUrl("https://images.unsplash.com/photo-1"),
    /not an allowed/,
  );
});

test("Structural Guard: components/News/ image-rendering components never import cfImageUrl", () => {
  // CardThumb/HeroImage/HeroPost render item.card_image_url — DB-driven news
  // article images from the lib/server/images/ four-tier fetch pipeline —
  // and must stay completely untouched by this ticket.
  const rootDir = process.cwd();
  const newsImageComponents = [
    "components/News/CardThumb.tsx",
    "components/News/HeroImage.tsx",
    "components/News/HeroPost.tsx",
  ];

  for (const relPath of newsImageComponents) {
    const fullPath = path.join(rootDir, relPath);
    const content = readFileSync(fullPath, "utf-8");
    assert.ok(
      !content.includes("cfImageUrl"),
      `${relPath} must not use cfImageUrl — news images are explicitly excluded from issue #482`,
    );
  }
});

test("Structural Guard: lib/server/images/ (the news image fetch pipeline) never imports cfImageUrl", () => {
  const rootDir = process.cwd();
  const pipelineFiles = [
    "lib/server/images/downloadArticleImage.ts",
    "lib/server/images/fetchOpenGraphImage.ts",
    "lib/server/images/imageBytes.ts",
  ];

  for (const relPath of pipelineFiles) {
    const fullPath = path.join(rootDir, relPath);
    if (!existsSync(fullPath)) continue;
    const content = readFileSync(fullPath, "utf-8");
    assert.ok(
      !content.includes("cfImageUrl"),
      `${relPath} must not use cfImageUrl — the news image pipeline is unaffected by issue #482`,
    );
  }
});

test("Structural Guard: SiteNav/SiteFooter logo is wired through cfImageUrl", () => {
  const rootDir = process.cwd();
  for (const relPath of ["components/News/SiteNav.tsx", "components/News/SiteFooter.tsx"]) {
    const content = readFileSync(path.join(rootDir, relPath), "utf-8");
    assert.ok(
      content.includes('from "@/lib/format/cfImageUrl"'),
      `${relPath} must import cfImageUrl`,
    );
    assert.match(
      content,
      /cfImageUrl\(\s*"\/images\/logo\/j172tw-health-logo\.png"/,
      `${relPath} must build the logo <Image> src via cfImageUrl`,
    );
  }
});
