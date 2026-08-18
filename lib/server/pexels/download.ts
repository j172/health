import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PexelsImage } from "@/lib/server/pexels/client";
import { httpRequest } from "@/lib/server/net/httpClient";

const DOWNLOAD_TIMEOUT_MS = 15_000;
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const PUBLIC_DIRECTORY = path.join(process.cwd(), "public", "images", "news", "pexels");

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

export interface DownloadedPexelsImage {
  absolutePath: string;
  localPath: string;
  contentSha256: string;
  width: number;
  height: number;
}

export class PexelsRateLimitError extends Error {
  constructor() {
    super("Pexels image download failed with HTTP 429.");
    this.name = "PexelsRateLimitError";
  }
}

export const removeDownloadedImage = async (absolutePath: string): Promise<void> => {
  await rm(absolutePath, { force: true });
};

export const downloadPexelsImage = async (image: PexelsImage): Promise<DownloadedPexelsImage> => {
  const imageUrl = image.src.large2x || image.src.large || image.src.original;
  const response = await httpRequest(imageUrl, {
    timeoutMs: DOWNLOAD_TIMEOUT_MS,
    // No "image/avif" here (unlike Pixabay's copy of this header) — Pexels'
    // CDN actually honors the preference and serves avif, which
    // MIME_EXTENSIONS/hasExpectedSignature below don't recognize, so every
    // candidate was failing "unsupported content type" (confirmed live
    // 2026-08-18). Pixabay never serves avif in practice so it never hit
    // this; Pexels does, so it's excluded here rather than adding avif
    // signature support for a format we don't otherwise need.
    headers: { Accept: "image/webp,image/png,image/jpeg" },
  });

  if (response.status === 429) {
    throw new PexelsRateLimitError();
  }
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Pexels image download failed with HTTP ${response.status}.`);
  }

  const contentType = response.headers["content-type"];
  const mime = (Array.isArray(contentType) ? contentType[0] : contentType)?.split(";", 1)[0].trim().toLowerCase() || "";
  const extension = MIME_EXTENSIONS.get(mime);
  if (!extension) {
    throw new Error(`Pexels image has unsupported content type: ${mime || "unknown"}.`);
  }

  const contentLength = response.headers["content-length"];
  const declaredLength = Number((Array.isArray(contentLength) ? contentLength[0] : contentLength) || 0);
  if (declaredLength > MAX_IMAGE_BYTES) {
    throw new Error("Pexels image exceeds the download size limit.");
  }

  const buffer = response.buffer;
  if (buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES || !hasExpectedSignature(buffer, mime)) {
    throw new Error("Pexels image content failed validation.");
  }

  await mkdir(PUBLIC_DIRECTORY, { recursive: true });
  const filename = `pexels-${image.id}.${extension}`;
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

  return {
    absolutePath,
    localPath: `/images/news/pexels/${filename}`,
    contentSha256: createHash("sha256").update(buffer).digest("hex"),
    width: image.width,
    height: image.height,
  };
};
