import { handleLiveTrucksRequest } from "@/lib/server/garbageLive/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/garbage-trucks/live[?city=new_taipei]
 *
 * Issue #679 (B-17): live garbage-truck positions for the 垃圾車與清潔隊 page.
 * Positions are read from the city's open-data feed only when someone opens the
 * page and are never stored (decision #13). All the logic — in-flight
 * de-duplication, the 60-120 s in-process cache, per-county degradation and the
 * explicit Cache-Control (s-maxage <= 60) — lives in lib/server/garbageLive/.
 */
export async function GET(request: Request) {
  return handleLiveTrucksRequest(request);
}
