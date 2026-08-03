import { NextResponse } from "next/server";

/**
 * Shared `catch` block shape for admin/API routes: `{ ok: false, error }` at
 * HTTP 500, using the thrown error's message when available and otherwise a
 * route-supplied fallback. Centralizes the wrapping only — callers still pick
 * their own fallback message, so per-route error text is unaffected.
 */
export function internalErrorResponse(error: unknown, fallbackMessage: string): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      error: error instanceof Error ? error.message : fallbackMessage,
    },
    { status: 500 },
  );
}
