import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { FlickrRateLimitError, type FlickrImage } from "@/lib/server/flickr/client";
import { httpRequest } from "@/lib/server/net/httpClient";
import {
  MAX_IMAGE_BYTES,
  MIME_EXTENSIONS,
  hasExpectedSignature,
} from "@/lib/server/images/imageBytes";

export { FlickrRateLimitError };

const DOWNLOAD_TIMEOUT_MS = 15_000;
const PUBLIC_DIRECTORY = path.join(
  process.cwd(),
  "public",
  "images",
  "news",
  "flickr",
);

export interface DownloadedFlickrImage {
  absolutePath: string;
  localPath: string;
  contentSha256: string;
  width: number;
  height: number;
}

export const removeDownloadedImage = async (
  absolutePath: string,
): Promise<void> => {
  await rm(absolutePath, { force: true });
};

export const downloadFlickrImage = async (
  image: FlickrImage,
): Promise<DownloadedFlickrImage> => {
  const imageUrl = image.mediaUrl;
  const response = await httpRequest(imageUrl, {
    timeoutMs: DOWNLOAD_TIMEOUT_MS,
    headers: { Accept: "image/webp,image/png,image/jpeg" },
  });

  if (response.status === 429) {
    throw new FlickrRateLimitError();
  }
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Flickr image download failed with HTTP ${response.status}.`);
  }

  const contentType = response.headers["content-type"];
  const mime =
    (Array.isArray(contentType) ? contentType[0] : contentType)
      ?.split(";", 1)[0]
      .trim()
      .toLowerCase() || "";
  const extension = MIME_EXTENSIONS.get(mime) || "jpg";

  const buffer = response.buffer;
  if (
    buffer.length === 0 ||
    buffer.length > MAX_IMAGE_BYTES ||
    !hasExpectedSignature(buffer, mime)
  ) {
    throw new Error("Flickr image content failed validation.");
  }

  await mkdir(PUBLIC_DIRECTORY, { recursive: true });
  const safeId = image.id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40);
  const filename = `flickr-${safeId}-${randomUUID().slice(0, 8)}.${extension}`;
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
    localPath: `/images/news/flickr/${filename}`,
    contentSha256: createHash("sha256").update(buffer).digest("hex"),
    width: image.width || 1024,
    height: image.height || 680,
  };
};

