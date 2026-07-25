import "server-only";
import { createHash } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { httpRequest } from "@/lib/server/net/httpClient";

const DOWNLOAD_TIMEOUT_MS = 15_000;
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const PUBLIC_DIRECTORY = path.join(process.cwd(), "public", "images", "news", "articles");

const MIME_EXTENSIONS = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
]);

const hasExpectedSignature = (buffer: Buffer, mime: string): boolean => {
  if (mime === "image/jpeg") return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mime === "image/png") return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mime === "image/webp") return buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  if (mime === "image/gif") return buffer.length >= 6 && (buffer.subarray(0, 6).toString("ascii") === "GIF87a" || buffer.subarray(0, 6).toString("ascii") === "GIF89a");
  return false;
};

/**
 * Downloads an article's own embedded image and stores it locally under
 * public/images/news/articles/, returning a same-origin path instead of the
 * source site's URL. Mirrors lib/server/pixabay/download.ts's validation
 * approach: news pages shouldn't hotlink images from cdc.gov.tw/mohw.gov.tw/
 * etc, since those can rate-limit, go offline, or change paths independently
 * of our own content. Returns null (rather than throwing) on any failure so
 * a single bad image doesn't block ingestion of the rest of the article.
 */
export const downloadArticleImage = async (sourceUrl: string): Promise<string | null> => {
  try {
    const response = await httpRequest(sourceUrl, {
      timeoutMs: DOWNLOAD_TIMEOUT_MS,
      headers: { Accept: "image/avif,image/webp,image/png,image/jpeg,image/gif,*/*" },
    });

    if (response.status < 200 || response.status >= 300) return null;

    const contentType = response.headers["content-type"];
    const mime = (Array.isArray(contentType) ? contentType[0] : contentType)?.split(";", 1)[0]?.trim().toLowerCase() || "";
    const extension = MIME_EXTENSIONS.get(mime);
    if (!extension) return null;

    const buffer = response.buffer;
    if (buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES || !hasExpectedSignature(buffer, mime)) return null;

    const contentHash = createHash("sha256").update(buffer).digest("hex").slice(0, 24);
    const filename = `article-${contentHash}.${extension}`;
    const absolutePath = path.join(PUBLIC_DIRECTORY, filename);

    await mkdir(PUBLIC_DIRECTORY, { recursive: true });
    const temporaryPath = path.join(PUBLIC_DIRECTORY, `.${filename}.${process.pid}.tmp`);
    await writeFile(temporaryPath, buffer);
    try {
      await rename(temporaryPath, absolutePath);
    } catch {
      await rm(temporaryPath, { force: true });
      // A concurrent request may have already written the same content-hashed file; that's fine.
    }

    return `/images/news/articles/${filename}`;
  } catch {
    return null;
  }
};
