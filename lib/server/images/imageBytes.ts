import "server-only";

/**
 * Byte-level validation shared by every image download path.
 *
 * These three declarations were byte-identical in four modules
 * (pixabay/download.ts, pexels/download.ts, unsplash/download.ts,
 * images/downloadArticleImage.ts). Four copies of a magic-number table is four
 * places for the accepted formats to drift apart, and a provider silently
 * accepting a format the others reject is the kind of divergence that only shows
 * up as a broken thumbnail in production.
 */

/**
 * Refuse anything larger than this.
 *
 * Note this is a *second* line of defence: httpRequest now enforces its own
 * `maxResponseBytes` while streaming, so an oversized body is cut off at the
 * socket rather than being buffered and then measured here.
 */
export const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

/** Content types we are willing to store, and the extension each gets on disk. */
export const MIME_EXTENSIONS = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
]);

/** Normalizes user or origin supplied content-type string into canonical MIME. */
export const normalizeMimeType = (declaredMime: string): string => {
  const raw = (declaredMime || "").split(";")[0].trim().toLowerCase();
  if (raw === "image/jpg" || raw === "jpg") {
    return "image/jpeg";
  }
  if (raw !== "" && !raw.includes("/")) {
    return `image/${raw}`;
  }
  return raw;
};

/**
 * Sniffs binary magic bytes to detect true image MIME type.
 * Useful when publishers label PNG as image/jpeg or send non-standard MIME headers.
 */
export const detectMimeFromSignature = (buffer: Buffer): string | null => {
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return "image/jpeg";
  }
  if (
    buffer.length >= 8 &&
    buffer
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return "image/png";
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  if (buffer.length >= 6) {
    const header = buffer.subarray(0, 6).toString("ascii");
    if (header === "GIF87a" || header === "GIF89a") {
      return "image/gif";
    }
  }
  return null;
};

/**
 * Confirms the bytes actually start with the magic number for the Content-Type
 * the server claimed — an origin that mislabels an HTML error page as
 * `image/jpeg` should not end up written to `public/`.
 */
export const hasExpectedSignature = (buffer: Buffer, mime: string): boolean => {
  if (mime === "image/jpeg") {
    return (
      buffer.length >= 3 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff
    );
  }
  if (mime === "image/png") {
    return (
      buffer.length >= 8 &&
      buffer
        .subarray(0, 8)
        .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    );
  }
  if (mime === "image/gif") {
    const header = buffer.subarray(0, 6).toString("ascii");
    return buffer.length >= 6 && (header === "GIF87a" || header === "GIF89a");
  }
  if (mime === "image/webp") {
    return (
      buffer.length >= 12 &&
      buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
      buffer.subarray(8, 12).toString("ascii") === "WEBP"
    );
  }
  return false;
};
