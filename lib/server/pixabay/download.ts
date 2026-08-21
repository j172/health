import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PixabayImage } from "@/lib/server/pixabay/client";
import { httpRequest } from "@/lib/server/net/httpClient";
import {
  MAX_IMAGE_BYTES,
  MIME_EXTENSIONS,
  hasExpectedSignature,
} from "@/lib/server/images/imageBytes";

const DOWNLOAD_TIMEOUT_MS = 15_000;
const PUBLIC_DIRECTORY = path.join(
  process.cwd(),
  "public",
  "images",
  "news",
  "pixabay",
);

export interface DownloadedPixabayImage {
  absolutePath: string;
  localPath: string;
  contentSha256: string;
  width: number;
  height: number;
}

export class PixabayRateLimitError extends Error {
  constructor() {
    super("Pixabay image download failed with HTTP 429.");
    this.name = "PixabayRateLimitError";
  }
}

export const removeDownloadedImage = async (
  absolutePath: string,
): Promise<void> => {
  await rm(absolutePath, { force: true });
};

export const downloadPixabayImage = async (
  image: PixabayImage,
): Promise<DownloadedPixabayImage> => {
  const imageUrl = image.largeImageURL || image.webformatURL;
  const response = await httpRequest(imageUrl, {
    timeoutMs: DOWNLOAD_TIMEOUT_MS,
    headers: { Accept: "image/avif,image/webp,image/png,image/jpeg" },
  });

  if (response.status === 429) {
    throw new PixabayRateLimitError();
  }
  if (response.status < 200 || response.status >= 300) {
    throw new Error(
      `Pixabay image download failed with HTTP ${response.status}.`,
    );
  }

  const contentType = response.headers["content-type"];
  const mime =
    (Array.isArray(contentType) ? contentType[0] : contentType)
      ?.split(";", 1)[0]
      .trim()
      .toLowerCase() || "";
  const extension = MIME_EXTENSIONS.get(mime);
  if (!extension) {
    throw new Error(
      `Pixabay image has unsupported content type: ${mime || "unknown"}.`,
    );
  }

  const contentLength = response.headers["content-length"];
  const declaredLength = Number(
    (Array.isArray(contentLength) ? contentLength[0] : contentLength) || 0,
  );
  if (declaredLength > MAX_IMAGE_BYTES) {
    throw new Error("Pixabay image exceeds the download size limit.");
  }

  const buffer = response.buffer;
  if (
    buffer.length === 0 ||
    buffer.length > MAX_IMAGE_BYTES ||
    !hasExpectedSignature(buffer, mime)
  ) {
    throw new Error("Pixabay image content failed validation.");
  }

  await mkdir(PUBLIC_DIRECTORY, { recursive: true });
  const filename = `pixabay-${image.id}.${extension}`;
  const absolutePath = path.join(PUBLIC_DIRECTORY, filename);
  const temporaryPath = path.join(
    PUBLIC_DIRECTORY,
    `.${filename}.${randomUUID()}.tmp`,
  );

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
    localPath: `/images/news/pixabay/${filename}`,
    contentSha256: createHash("sha256").update(buffer).digest("hex"),
    width: image.imageWidth || image.webformatWidth,
    height: image.imageHeight || image.webformatHeight,
  };
};
