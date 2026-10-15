import { LIVE_TRUCK_CITIES, isLiveTruckCity, type LiveTruckCity } from "@/lib/tools/garbageTrucks/live";
import type { LiveDeps } from "@/lib/server/garbageLive/types";
import { getLiveTrucksForCities } from "@/lib/server/garbageLive/getLiveTrucks";

/**
 * Request handler behind GET /api/garbage-trucks/live (issue #679 / B-17).
 * Kept out of the route file so a test can run it with a counting fake in place
 * of the real fetcher; the route file only forwards to it.
 *
 * Cache-Control is explicit (spec §4.4: a /api/* response without one gets the
 * upstream's unlabelled 30-minute default). Live positions use s-maxage only —
 * the edge may reuse a response for 30 s, browsers get no max-age of their own —
 * and a response in which any county is down is edge-cached for just 10 s so a
 * recovering feed shows up quickly. Both are well under the 60 s ceiling.
 *
 * Privacy: the handler reads one query parameter, `city`. It never reads or
 * logs coordinates, IPs or cookies, and the response never echoes the request.
 * Any other query parameter (e.g. a cache-buster) is ignored, not rejected.
 */
const CACHE_CONTROL_OK = "public, s-maxage=30";
const CACHE_CONTROL_DEGRADED = "public, s-maxage=10";
const CACHE_CONTROL_NONE = "no-store";

export async function handleLiveTrucksRequest(request: Request, deps: LiveDeps = {}): Promise<Response> {
  const cityParam = new URL(request.url).searchParams.get("city");

  let cities: readonly LiveTruckCity[] = LIVE_TRUCK_CITIES;
  if (cityParam !== null && cityParam !== "") {
    if (!isLiveTruckCity(cityParam)) {
      return Response.json(
        { ok: false, error: "Unknown city", cities: [] },
        { status: 400, headers: { "Cache-Control": CACHE_CONTROL_NONE } },
      );
    }
    cities = [cityParam];
  }

  try {
    const result = await getLiveTrucksForCities(cities, deps);
    const allOk = result.cities.every((city) => city.status === "ok");
    return Response.json(
      { ok: true, ...result },
      { headers: { "Cache-Control": allOk ? CACHE_CONTROL_OK : CACHE_CONTROL_DEGRADED } },
    );
  } catch (error) {
    // getLiveTrucksForCities degrades per county and should never throw; this is a programming error.
    console.error("GET /api/garbage-trucks/live failed:", error instanceof Error ? error.message : "unknown error");
    return Response.json(
      { ok: false, error: "Failed to load live garbage truck positions", cities: [] },
      { status: 500, headers: { "Cache-Control": CACHE_CONTROL_NONE } },
    );
  }
}
