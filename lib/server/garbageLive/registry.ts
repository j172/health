import type { LiveTruckCity } from "@/lib/tools/garbageTrucks/live";
import type { LiveAdapterRegistry } from "@/lib/server/garbageLive/types";
import { ntpcLiveAdapter } from "@/lib/server/garbageLive/adapters/ntpc122972";

/**
 * Every city with a live-position adapter (issue #679). #680 adds 臺中市 by
 * writing one adapter file and adding one line here (and the city code in
 * lib/tools/garbageTrucks/live.ts). 臺南市 and 高雄市 are deliberately absent:
 * their datasets are unreachable (see LIVE_UNREACHABLE_COUNTIES).
 */
export const LIVE_TRUCK_ADAPTERS: LiveAdapterRegistry = {
  new_taipei: ntpcLiveAdapter,
};

export function getLiveTruckAdapter(city: LiveTruckCity): LiveAdapterRegistry[LiveTruckCity] {
  return LIVE_TRUCK_ADAPTERS[city];
}
