import { NextResponse } from "next/server";
import { requireAdminSecret } from "@/lib/server/config/adminAuth";
import { tdxMqttManager } from "@/lib/server/tdx/mqtt/connection";
import { tdxStreamCircuitBreaker } from "@/lib/server/tdx/mqtt/circuitBreaker";

export const runtime = "nodejs";

/**
 * Diagnostic and status inspection endpoint for TDX MQTTS connection and dual-engine failover circuit breaker.
 * Protected by x-rss-sync-admin-secret (or ?key=).
 */
export async function GET(request: Request): Promise<NextResponse> {
  const unauthorized = requireAdminSecret(request);
  if (unauthorized) return unauthorized;

  const diagnostics = tdxMqttManager.getDiagnostics();
  const circuitStatus = tdxStreamCircuitBreaker.getCircuitStatus();

  return NextResponse.json({
    ok: true,
    activeEngine: circuitStatus.activeEngine,
    circuit: {
      state: circuitStatus.state,
      lastStateChange: circuitStatus.lastStateChange,
      failoverCount: circuitStatus.failoverCount,
      transitionHistory: circuitStatus.transitionHistory,
    },
    diagnostics,
  });
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
    } else if (action === "trip") {
      tdxStreamCircuitBreaker.tripToOpen(body.reason || "Admin triggered failover trip to OPEN");
    } else if (action === "probe" || action === "recover") {
      tdxStreamCircuitBreaker.attemptRecovery();
    } else if (action === "reset") {
      tdxStreamCircuitBreaker.reset();
    }

    const diagnostics = tdxMqttManager.getDiagnostics();
    const circuitStatus = tdxStreamCircuitBreaker.getCircuitStatus();

    return NextResponse.json({
      ok: true,
      action: action || "status",
      activeEngine: circuitStatus.activeEngine,
      circuit: {
        state: circuitStatus.state,
        lastStateChange: circuitStatus.lastStateChange,
        failoverCount: circuitStatus.failoverCount,
        transitionHistory: circuitStatus.transitionHistory,
      },
      diagnostics,
    });
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
