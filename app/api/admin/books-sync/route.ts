import { NextResponse } from "next/server";
import { requireAdminSecret } from "@/lib/server/config/adminAuth";
import { internalErrorResponse } from "@/lib/server/http/errorResponse";
import { syncBooksFromSources } from "@/lib/server/books/service";

export const runtime = "nodejs";
export const maxDuration = 180;

export async function POST(request: Request): Promise<NextResponse> {
  const unauthorized = requireAdminSecret(request);
  if (unauthorized) return unauthorized;

  try {
    let categoryIds: string[] | undefined;
    try {
      const body = await request.json();
      if (Array.isArray(body?.categories)) {
        categoryIds = body.categories;
      }
    } catch {
      // Body is optional
    }

    const result = await syncBooksFromSources(categoryIds);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return internalErrorResponse(error, "Latest books synchronization failed");
  }
}
