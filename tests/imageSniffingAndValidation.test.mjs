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
    if (target.startsWith("@/")) {
      target = target.slice(2);
      const url = new URL(target, REPO_ROOT);
      for (const ext of [".ts", ".tsx", ".js", ".mjs", "/index.ts", "/index.js"]) {
        const candidate = new URL(target + ext, REPO_ROOT);
        if (existsSync(fileURLToPath(candidate))) {
          return nextResolve(candidate.href, context);
        }
      }
      return nextResolve(url.href, context);
    }
    return nextResolve(specifier, context);
  },
});

const {
  normalizeMimeType,
  detectMimeFromSignature,
  hasExpectedSignature,
  MIME_EXTENSIONS,
} = await import("@/lib/server/images/imageBytes");

test("normalizeMimeType normalizes image/jpg and bare subtypes", () => {
  assert.equal(normalizeMimeType("image/jpg"), "image/jpeg");
  assert.equal(normalizeMimeType("jpg"), "image/jpeg");
  assert.equal(normalizeMimeType("image/jpeg"), "image/jpeg");
  assert.equal(normalizeMimeType("image/png; charset=utf-8"), "image/png");
  assert.equal(normalizeMimeType("png"), "image/png");
  assert.equal(normalizeMimeType("image/webp"), "image/webp");
  assert.equal(normalizeMimeType("image/gif"), "image/gif");
  assert.equal(normalizeMimeType("gif"), "image/gif");
});

test("detectMimeFromSignature sniffs magic bytes accurately", () => {
  // JPEG
  const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
  assert.equal(detectMimeFromSignature(jpegBytes), "image/jpeg");

  // PNG
  const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
  assert.equal(detectMimeFromSignature(pngBytes), "image/png");

  // WebP
  const webpBytes = Buffer.concat([
    Buffer.from("RIFF", "ascii"),
    Buffer.from([0x20, 0x00, 0x00, 0x00]),
    Buffer.from("WEBP", "ascii"),
  ]);
  assert.equal(detectMimeFromSignature(webpBytes), "image/webp");

  // GIF
  const gif89Bytes = Buffer.from("GIF89a\x01\x00\x01\x00", "ascii");
  assert.equal(detectMimeFromSignature(gif89Bytes), "image/gif");

  const gif87Bytes = Buffer.from("GIF87a\x01\x00\x01\x00", "ascii");
  assert.equal(detectMimeFromSignature(gif87Bytes), "image/gif");

  // HTML / invalid
  const htmlBytes = Buffer.from("<!DOCTYPE html><html><body>Error 403</body></html>", "utf-8");
  assert.equal(detectMimeFromSignature(htmlBytes), null);
});

test("hasExpectedSignature verifies expected format", () => {
  const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);

  assert.equal(hasExpectedSignature(pngBytes, "image/png"), true);
  assert.equal(hasExpectedSignature(pngBytes, "image/jpeg"), false);
  assert.equal(hasExpectedSignature(jpegBytes, "image/jpeg"), true);
  assert.equal(hasExpectedSignature(jpegBytes, "image/png"), false);
});

test("MIME_EXTENSIONS supports jpeg, png, webp, and gif", () => {
  assert.equal(MIME_EXTENSIONS.get("image/jpeg"), "jpg");
  assert.equal(MIME_EXTENSIONS.get("image/png"), "png");
  assert.equal(MIME_EXTENSIONS.get("image/webp"), "webp");
  assert.equal(MIME_EXTENSIONS.get("image/gif"), "gif");
});

const { storeArticleImageBuffer } = await import(
  "@/lib/server/images/downloadArticleImage"
);
const fs = await import("node:fs/promises");
const path = await import("node:path");

test("storeArticleImageBuffer recovers PNG when origin declared image/jpeg", async () => {
  // 8-byte PNG header + 16 bytes payload
  const pngBuffer = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  ]);

  const result = await storeArticleImageBuffer(pngBuffer, "image/jpeg");
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.match(result.localPath, /\.png$/);
    const fullPath = path.join(process.cwd(), "public", result.localPath);
    await fs.rm(fullPath, { force: true }).catch(() => {});
  }
});

test("storeArticleImageBuffer recovers JPEG when origin declared image/jpg", async () => {
  // JPEG SOI + APP0 header
  const jpegBuffer = Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
  ]);

  const result = await storeArticleImageBuffer(jpegBuffer, "image/jpg");
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.match(result.localPath, /\.jpg$/);
    const fullPath = path.join(process.cwd(), "public", result.localPath);
    await fs.rm(fullPath, { force: true }).catch(() => {});
  }
});
