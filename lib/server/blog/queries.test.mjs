import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const REPO_ROOT = new URL("../../../", import.meta.url);

process.env.MYSQL_HOST = "localhost";
process.env.MYSQL_USER = "test";
process.env.MYSQL_PASSWORD = "test";
process.env.MYSQL_DATABASE = "test";
process.env.RSS_SYNC_ADMIN_SECRET = "test";

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

const { extractFeaturedImage } = await import("./queries.ts");

test("extracts featured image within <article> instead of preceding sidebar/nav images", () => {
  const html = `
    <html>
      <header>
        <div class="recent-posts">
          <img class="wp-post-image" src="https://example.com/unrelated-recent-post.jpg" />
          <img class="wp-post-image" src="https://example.com/another-sidebar-post.jpg" />
        </div>
      </header>
      <main>
        <article>
          <h1 class="entry-title">CELEBRATION – LE SSERAFIM</h1>
          <img class="attachment-post-thumbnail wp-post-image" src="https://example.com/celebration-featured.jpg" alt="CELEBRATION" />
          <div class="entry-content">
            <p>Lyrics content...</p>
          </div>
        </article>
      </main>
    </html>
  `;

  const extracted = extractFeaturedImage(html);
  assert.equal(extracted, "https://example.com/celebration-featured.jpg");
});

test("supports lazy-loaded images with data-src or data-orig-file over placeholder data: URL", () => {
  const html = `
    <article>
      <img
        class="wp-post-image"
        src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0..."
        data-src="https://example.com/lazy-loaded-real.jpg"
        alt="Lazy Post"
      />
    </article>
  `;

  const extracted = extractFeaturedImage(html);
  assert.equal(extracted, "https://example.com/lazy-loaded-real.jpg");
});

test("falls back to first content image inside <article> if no wp-post-image class exists", () => {
  const html = `
    <article>
      <img class="avatar avatar-96" src="https://example.com/author.jpg" />
      <p>Intro text</p>
      <img src="https://example.com/first-content-photo.png" alt="Content" />
      <img src="https://example.com/second-photo.png" alt="Content 2" />
    </article>
  `;

  const extracted = extractFeaturedImage(html);
  assert.equal(extracted, "https://example.com/first-content-photo.png");
});

test("falls back to og:image meta tag when no article image exists", () => {
  const html = `
    <html>
      <head>
        <meta property="og:image" content="https://example.com/og-banner.jpg?w=1200&amp;ssl=1" />
      </head>
      <body>
        <p>No images in body</p>
      </body>
    </html>
  `;

  const extracted = extractFeaturedImage(html);
  assert.equal(extracted, "https://example.com/og-banner.jpg?w=1200&ssl=1");
});

test("returns null when no valid image is found", () => {
  const html = `
    <html>
      <head><title>Text Only</title></head>
      <body>
        <article>
          <p>Text only post with no images.</p>
        </article>
      </body>
    </html>
  `;

  const extracted = extractFeaturedImage(html);
  assert.equal(extracted, null);
});

