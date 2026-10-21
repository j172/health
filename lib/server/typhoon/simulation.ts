import { timingSafeEqual } from "node:crypto";
import type { TyphoonLevel, TyphoonStatus } from "@/lib/typhoon/typhoonStatus";

/**
 * Test-only simulated typhoon warning (issue #744).
 *
 * There is currently no warning for Taiwan, so the live site cannot be used to
 * look at the banner. A request may ask for a simulated 陸上／海上 warning, but
 * ONLY when ALL of these hold:
 *   - the server has TYPHOON_SIM_KEY set (unset or empty → the feature does not
 *     exist, every simulated request is ignored);
 *   - the request carries the same key (timing-safe comparison);
 *   - `sim` is exactly "land" or "sea".
 * Anything else is treated as a normal request, so an ordinary visitor sending
 * `?sim=land` gets the real status. A simulated response is `no-store`, so it can
 * never be served to anybody else from a cache.
 */
export const SIM_KEY_HEADER = "x-typhoon-sim-key";

export const resolveSimulatedLevel = (
  simParam: string | null | undefined,
  providedKey: string | null | undefined,
  configuredKey: string | null | undefined,
): TyphoonLevel | null => {
  if (simParam !== "land" && simParam !== "sea") return null;
  if (!configuredKey || !providedKey) return null;
  const a = Buffer.from(providedKey);
  const b = Buffer.from(configuredKey);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return simParam;
};

export const buildSimulatedStatus = (level: TyphoonLevel, now: Date = new Date()): TyphoonStatus => ({
  active: true,
  level,
  name: level === "land" ? "（模擬）颱風陸上警報" : "（模擬）颱風海上警報",
  names: ["（模擬）輕度颱風 測試 (TEST) 第99號"],
  issuedAt: now.toISOString(),
  simulated: true,
});
