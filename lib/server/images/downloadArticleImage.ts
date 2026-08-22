import "server-only";
import { createHash } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { httpRequest } from "@/lib/server/net/httpClient";
import {
  MAX_IMAGE_BYTES,
  hasExpectedSignature,
} from "@/lib/server/images/imageBytes";

const DOWNLOAD_TIMEOUT_MS = 15_000;
const PUBLIC_DIRECTORY = path.join(
  process.cwd(),
  "public",
  "images",
  "news",
  "articles",
);

const MIME_EXTENSIONS = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
]);

/**
 * Downloads an article's own embedded image and stores it locally under
 * public/images/news/articles/, returning a same-origin path instead of the
 * source site's URL. Mirrors lib/server/pixabay/download.ts's validation
 * approach: news pages shouldn't hotlink images from cdc.gov.tw/mohw.gov.tw/
 * etc, since those can rate-limit, go offline, or change paths independently
 * of our own content. Returns null (rather than throwing) on any failure so
 * a single bad image doesn't block ingestion of the rest of the article.
 */
/**
 * Why a download did not produce a stored file.
 *
 * Every one of these used to be a bare `null`, including the catch-all, so a
 * 100%-failing backfill reported the single string "download failed validation"
 * for four unrelated causes and the logs could not distinguish an unsupported
 * content type from the disk being full.
 */
export type ArticleImageFailure =
  | { kind: "http-status"; status: number }
  | { kind: "unsupported-mime"; mime: string }
  | { kind: "empty-body" }
  | { kind: "too-large"; bytes: number }
  | { kind: "signature-mismatch"; mime: string; firstBytes: string }
  | { kind: "write-failed"; code: string; message: string }
  | { kind: "request-failed"; code: string; message: string };

export type ArticleImageResult =
  { ok: true; localPath: string } | { ok: false; failure: ArticleImageFailure };

/** One-line form for logs and API responses. */
export const describeArticleImageFailure = (
  failure: ArticleImageFailure,
): string => {
  switch (failure.kind) {
    case "http-status":
      return `http-status ${failure.status}`;
    case "unsupported-mime":
      return `unsupported-mime "${failure.mime}"`;
    case "empty-body":
      return "empty-body";
    case "too-large":
      return `too-large ${failure.bytes}B (max ${MAX_IMAGE_BYTES})`;
    case "signature-mismatch":
      return `signature-mismatch mime="${failure.mime}" firstBytes=${failure.firstBytes}`;
    case "write-failed":
      return `write-failed ${failure.code}: ${failure.message}`;
    case "request-failed":
      return `request-failed ${failure.code}: ${failure.message}`;
  }
};

const errorCode = (error: unknown): string => {
  if (error && typeof error === "object" && "code" in error)
    return String((error as { code: unknown }).code);
  return error instanceof Error ? error.name : "unknown";
};

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * Downloads an article's own embedded image and stores it locally under
 * public/images/news/articles/, returning a same-origin path instead of the
 * source site's URL. Mirrors lib/server/pixabay/download.ts's validation
 * approach: news pages shouldn't hotlink images from cdc.gov.tw/mohw.gov.tw/
 * etc, since those can rate-limit, go offline, or change paths independently
 * of our own content.
 *
 * Never throws — a single bad image must not block ingestion of the rest of the
 * article — but it now reports *which* check rejected the image.
 */
export const downloadArticleImageDetailed = async (
  sourceUrl: string,
): Promise<ArticleImageResult> => {
  let response;
  try {
    response = await httpRequest(sourceUrl, {
      timeoutMs: DOWNLOAD_TIMEOUT_MS,
      headers: {
        // Deliberately does NOT advertise avif: MIME_EXTENSIONS cannot store it,
        // so asking for it only invites a response we then reject. Omitting it
        // makes content-negotiating CDNs fall back to webp/jpeg, which we keep.
        Accept: "image/webp,image/png,image/jpeg,image/gif,*/*",
      },
    });
  } catch (error) {
    return {
      ok: false,
      failure: {
        kind: "request-failed",
        code: errorCode(error),
        message: errorMessage(error),
      },
    };
  }

  if (response.status < 200 || response.status >= 300) {
    return {
      ok: false,
      failure: { kind: "http-status", status: response.status },
    };
  }

  const contentType = response.headers["content-type"];
  const rawMime =
    (Array.isArray(contentType) ? contentType[0] : contentType)
      ?.split(";", 1)[0]
      ?.trim()
      .toLowerCase() || "";

  return storeArticleImageBuffer(response.buffer, rawMime);
};

/**
 * Validates raw image bytes and stores them under public/images/news/articles/.
 *
 * Split out from the download path so bytes fetched somewhere *else* can reuse
 * exactly the same checks. That matters because this host's IP is refused by
 * several Taiwanese CDNs (33 backfill items in one run were `http-status 403`
 * from pgw.udn.com.tw), while the GitHub runner that already scrapes the article
 * HTML can fetch the same image fine — see attachCardImageFromBytes.
 */
export const storeArticleImageBuffer = async (
  buffer: Buffer,
  declaredMime: string,
): Promise<ArticleImageResult> => {
  // Some origins send a bare subtype ("png") instead of a full media type
  // ("image/png"). Observed live: five backfill items were rejected as
  // unsupported-mime "png" while serving perfectly valid PNGs.
  const normalized = declaredMime.trim().toLowerCase();
  const mime =
    normalized !== "" && !normalized.includes("/")
      ? `image/${normalized}`
      : normalized;
  const extension = MIME_EXTENSIONS.get(mime);
  if (!extension) {
    return { ok: false, failure: { kind: "unsupported-mime", mime } };
  }

  if (buffer.length === 0) {
    return { ok: false, failure: { kind: "empty-body" } };
  }
  if (buffer.length > MAX_IMAGE_BYTES) {
    return { ok: false, failure: { kind: "too-large", bytes: buffer.length } };
  }
  if (!hasExpectedSignature(buffer, mime)) {
    return {
      ok: false,
      failure: {
        kind: "signature-mismatch",
        mime,
        firstBytes: buffer.subarray(0, 8).toString("hex"),
      },
    };
  }

  const contentHash = createHash("sha256")
    .update(buffer)
    .digest("hex")
    .slice(0, 24);
  const filename = `article-${contentHash}.${extension}`;
  const absolutePath = path.join(PUBLIC_DIRECTORY, filename);
  const temporaryPath = path.join(
    PUBLIC_DIRECTORY,
    `.${filename}.${process.pid}.tmp`,
  );

  try {
    await mkdir(PUBLIC_DIRECTORY, { recursive: true });
    await writeFile(temporaryPath, buffer);
  } catch (error) {
    // Disk quota, permissions, read-only mount. Previously indistinguishable
    // from a malformed image, which is how a filesystem problem could masquerade
    // as "every publisher started serving bad images at once".
    await rm(temporaryPath, { force: true }).catch(() => {});
    return {
      ok: false,
      failure: {
        kind: "write-failed",
        code: errorCode(error),
        message: errorMessage(error),
      },
    };
  }

  try {
    await rename(temporaryPath, absolutePath);
  } catch {
    await rm(temporaryPath, { force: true }).catch(() => {});
    // A concurrent request may have already written the same content-hashed file; that's fine.
  }

  return { ok: true, localPath: `/images/news/articles/${filename}` };
};

/** Back-compatible wrapper for callers that only need the path. */
export const downloadArticleImage = async (
  sourceUrl: string,
): Promise<string | null> => {
  const result = await downloadArticleImageDetailed(sourceUrl);
  return result.ok ? result.localPath : null;
};
