import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PixabayImage } from "@/lib/server/pixabay/client";

const DOWNLOAD_TIMEOUT_MS = 15_000;
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const PUBLIC_DIRECTORY = path.join(process.cwd(), "public", "images", "news", "pixabay");

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

export interface DownloadedPixabayImage {
  absolutePath: string;
  localPath: string;
  contentSha256: string;
  width: number;
  height: number;
}

export const removeDownloadedImage = async (absolutePath: string): Promise<void> => {
  await rm(absolutePath, { force: true });
};

export const downloadPixabayImage = async (image: PixabayImage): Promise<DownloadedPixabayImage> => {
  const imageUrl = image.largeImageURL || image.webformatURL;
  const response = await fetch(imageUrl, {
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    headers: { Accept: "image/avif,image/webp,image/png,image/jpeg" },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Pixabay image download failed with HTTP ${response.status}.`);
  }

  const mime = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() || "";
  const extension = MIME_EXTENSIONS.get(mime);
  if (!extension) {
    throw new Error(`Pixabay image has unsupported content type: ${mime || "unknown"}.`);
  }

  const declaredLength = Number(response.headers.get("content-length") || 0);
  if (declaredLength > MAX_IMAGE_BYTES) {
    throw new Error("Pixabay image exceeds the download size limit.");
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES || !hasExpectedSignature(buffer, mime)) {
    throw new Error("Pixabay image content failed validation.");
  }

  await mkdir(PUBLIC_DIRECTORY, { recursive: true });
  const filename = `pixabay-${image.id}.${extension}`;
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
    localPath: `/images/news/pixabay/${filename}`,
    contentSha256: createHash("sha256").update(buffer).digest("hex"),
    width: image.imageWidth || image.webformatWidth,
    height: image.imageHeight || image.webformatHeight,
  };
};