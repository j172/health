import { NextResponse } from "next/server";

/**
 * Shared `catch` block shape for admin/API routes: `{ ok: false, error }` at
 * HTTP 500.
 *
 * In production (`NODE_ENV === "production"`), raw database and exception details
 * (which may contain internal table names, SQL queries, or file paths) are masked,
 * returning the route-supplied `fallbackMessage` instead. The full error is logged
 * on the server for diagnostics.
 */
export function internalErrorResponse(error: unknown, fallbackMessage: string): NextResponse {
  if (process.env.NODE_ENV === "production") {
    console.error("[internalErrorResponse]", error);
    return NextResponse.json(
      {
        ok: false,
        error: fallbackMessage || "Internal Server Error",
      },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      ok: false,
      error: error instanceof Error ? error.message : fallbackMessage,
    },
    { status: 500 },
  );
}
