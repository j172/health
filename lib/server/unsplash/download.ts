import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { UnsplashRateLimitError, type UnsplashImage } from "@/lib/server/unsplash/client";

// Re-exported for existing importers (lib/server/news/imageProviders.ts) —
// the class now lives in client.ts since both the search call there and the
// download call below need to throw/catch the same type. See client.ts's
// doc comment for why (Unsplash signals its demo-tier rate limit via 403 on
// search, 429 on download).
export { UnsplashRateLimitError };
import { env } from "@/lib/server/config/env";
import { httpRequest } from "@/lib/server/net/httpClient";

const DOWNLOAD_TIMEOUT_MS = 15_000;
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const PUBLIC_DIRECTORY = path.join(process.cwd(), "public", "images", "news", "unsplash");

const MIME_EXTENSIONS = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

const hasExpectedSignature = (buffer: Buffer, mime: string): boolean => {
  if (mime === "image/jpeg") return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mime === "image/png") return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mime === "image/webp") return buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  return false;
};

export interface DownloadedUnsplashImage {
  absolutePath: string;
  localPath: string;
  contentSha256: string;
  width: number;
  height: number;
}

export const removeDownloadedImage = async (absolutePath: string): Promise<void> => {
  await rm(absolutePath, { force: true });
};

/**
 * Unsplash's API Guidelines require a GET ping to the photo's
 * `download_location` whenever a photo is actually used (not just fetched
 * via `urls.*`) — this is their documented "trigger download" step, used
 * for their own usage analytics, distinct from the image bytes themselves.
 * Best-effort: a failure here shouldn't undo an otherwise-successful image
 * assignment, so errors are swallowed (logged, not thrown).
 */
const triggerUnsplashDownload = async (downloadLocation: string): Promise<void> => {
  try {
    if (!env.unsplash.accessKey) return;
    await httpRequest(downloadLocation, {
      timeoutMs: DOWNLOAD_TIMEOUT_MS,
      headers: { Authorization: `Client-ID ${env.unsplash.accessKey}`, "Accept-Version": "v1" },
    });
  } catch (error) {
    console.warn(`[unsplash] Failed to ping download_location (non-fatal): ${error instanceof Error ? error.message : String(error)}`);
  }
};

export const downloadUnsplashImage = async (image: UnsplashImage): Promise<DownloadedUnsplashImage> => {
  // `regular` (Unsplash-side resized to ~1080px wide) preferred over `full`
  // (original resolution, frequently 20-50MB+ for modern photography) —
  // this only ever needs to fill a fixed-size 16:10 card thumbnail
  // (CardThumb.tsx/NewsCard.tsx), so `full` just wastes bandwidth/disk and,
  // confirmed live 2026-08-20, regularly blew the 12MB MAX_IMAGE_BYTES cap
  // below, rejecting every single candidate for a term even when perfectly
  // usable images were available. Matches the same "prefer a bounded large
  // variant, not the absolute original" pattern already used by the sibling
  // providers (lib/server/pixabay/download.ts's largeImageURL,
  // lib/server/pexels/download.ts's large2x) — Unsplash was the outlier.
  const imageUrl = image.urls.regular || image.urls.full;
  const response = await httpRequest(imageUrl, {
    timeoutMs: DOWNLOAD_TIMEOUT_MS,
    // See the matching comment in lib/server/pexels/download.ts — avif
    // dropped from this Accept header because it isn't in
    // MIME_EXTENSIONS/hasExpectedSignature below and Unsplash's CDN, like
    // Pexels', will actually serve it if offered.
    headers: { Accept: "image/webp,image/png,image/jpeg" },
  });

  if (response.status === 429) {
    throw new UnsplashRateLimitError();
  }
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Unsplash image download failed with HTTP ${response.status}.`);
  }

  const contentType = response.headers["content-type"];
  const mime = (Array.isArray(contentType) ? contentType[0] : contentType)?.split(";", 1)[0].trim().toLowerCase() || "";
  const extension = MIME_EXTENSIONS.get(mime);
  if (!extension) {
    throw new Error(`Unsplash image has unsupported content type: ${mime || "unknown"}.`);
  }

  const contentLength = response.headers["content-length"];
  const declaredLength = Number((Array.isArray(contentLength) ? contentLength[0] : contentLength) || 0);
  if (declaredLength > MAX_IMAGE_BYTES) {
    throw new Error("Unsplash image exceeds the download size limit.");
  }

  const buffer = response.buffer;
  if (buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES || !hasExpectedSignature(buffer, mime)) {
    throw new Error("Unsplash image content failed validation.");
  }

  await mkdir(PUBLIC_DIRECTORY, { recursive: true });
  const filename = `unsplash-${image.id}.${extension}`;
  const absolutePath = path.join(PUBLIC_DIRECTORY, filename);
  const temporaryPath = path.join(PUBLIC_DIRECTORY, `.${filename}.${randomUUID()}.tmp`);

  await writeFile(temporaryPath, buffer, { flag: "wx" });
  try {
    await rm(absolutePath, { force: true });
    await rename(temporaryPath, absolutePath);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }

  await triggerUnsplashDownload(image.links.download_location);

  return {
    absolutePath,
    localPath: `/images/news/unsplash/${filename}`,
    contentSha256: createHash("sha256").update(buffer).digest("hex"),
    width: image.width,
    height: image.height,
  };
};
