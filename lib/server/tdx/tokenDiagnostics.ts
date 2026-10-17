/**
 * Pure helpers that turn a failed TDX token response into one short log line.
 *
 * Why this exists: since ~2026-10-15 22:00 UTC the production token request has
 * been failing for every TDX consumer, but `getTdxToken()` only ever returned
 * `null`, so the cron logs could only say "token unavailable" and nobody could
 * tell a revoked credential from an over-quota account (the notification
 * "虛擬點數用量超過100%") from a transport problem. Probing the token endpoint
 * with a dummy client from the host answers HTTP 400 `invalid_client` in 0.27 s,
 * i.e. the endpoint is reachable — the rejection is specific to our credential.
 *
 * Only the OAuth error fields (`error`, `error_description`) and the HTTP
 * status are surfaced — never the request form, so client_id/client_secret can
 * not leak, and never an arbitrary slice of the response body.
 */

/** One failure line per window; the token is retried by every cron tick, so an unthrottled log would be pure noise. */
export const TDX_TOKEN_FAILURE_LOG_INTERVAL_MS = 10 * 60 * 1000;

const MAX_FIELD_LENGTH = 160;

function clip(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const oneLine = value.replace(/\s+/g, " ").trim();
  if (!oneLine) return null;
  return oneLine.length > MAX_FIELD_LENGTH ? `${oneLine.slice(0, MAX_FIELD_LENGTH)}…` : oneLine;
}

/**
 * Describes a token response that did not carry an access token.
 *
 * `bodyText` may be anything (JSON, an HTML error page, empty). Non-JSON bodies
 * are reported by their content type shape only, not echoed.
 */
export function describeTokenFailure(status: number, bodyText: string): string {
  let error: string | null = null;
  let description: string | null = null;
  let shape = "empty body";

  const trimmed = bodyText.trim();
  if (trimmed) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown> | null;
      if (parsed && typeof parsed === "object") {
        error = clip(parsed.error);
        description = clip(parsed.error_description) ?? clip(parsed.message);
        shape = "json body";
      } else {
        shape = "json body (not an object)";
      }
    } catch {
      shape = trimmed.startsWith("<") ? "html body" : "non-json body";
    }
  }

  const parts = [`HTTP ${status}`];
  if (error) parts.push(`error=${error}`);
  if (description) parts.push(`description=${description}`);
  if (!error && !description) parts.push(shape);
  return parts.join(", ");
}

/**
 * Decides whether a failure line should be written now.
 * Returns the new "last logged at" timestamp, or null when the line is suppressed.
 */
export function nextTokenFailureLogAt(
  lastLoggedAtMs: number,
  nowMs: number,
  intervalMs: number = TDX_TOKEN_FAILURE_LOG_INTERVAL_MS,
): number | null {
  if (lastLoggedAtMs > 0 && nowMs - lastLoggedAtMs < intervalMs) return null;
  return nowMs;
}
