import { NextResponse } from "next/server";
import { requireAdminSecret } from "@/lib/server/config/adminAuth";
import { tdxMqttManager } from "@/lib/server/tdx/mqtt/connection";

export const runtime = "nodejs";

/**
 * Diagnostic and status inspection endpoint for TDX MQTTS connection.
 * Protected by x-rss-sync-admin-secret (or ?key=).
 */
export async function GET(request: Request): Promise<NextResponse> {
  const unauthorized = requireAdminSecret(request);
  if (unauthorized) return unauthorized;

  const diagnostics = tdxMqttManager.getDiagnostics();
  return NextResponse.json({ ok: true, diagnostics });
}

export async function POST(request: Request): Promise<NextResponse> {
  const unauthorized = requireAdminSecret(request);
  if (unauthorized) return unauthorized;

  try {
    const body = await request.json().catch(() => ({}));
    const action = body.action;

    if (action === "connect") {
      await tdxMqttManager.connect();
    } else if (action === "disconnect") {
      await tdxMqttManager.disconnect();
    }

    const diagnostics = tdxMqttManager.getDiagnostics();
    return NextResponse.json({ ok: true, action: action || "status", diagnostics });
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
