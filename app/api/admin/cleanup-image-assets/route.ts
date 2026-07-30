import { NextResponse } from "next/server";
import { requireAdminSecret } from "@/lib/server/config/adminAuth";
import { deleteChromeImageAssets } from "@/lib/server/news/cleanupChromeAssets";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  const unauthorized = requireAdminSecret(request);
  if (unauthorized) return unauthorized;

  try {
    const deleted = await deleteChromeImageAssets();
    return NextResponse.json({ ok: true, deleted });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown cleanup error",
      },
      { status: 500 },
    );
  }
}
