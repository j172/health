import type { LiveTruckCity } from "@/lib/tools/garbageTrucks/live";
import type { LiveAdapterRegistry } from "@/lib/server/garbageLive/types";
import { ntpcLiveAdapter } from "@/lib/server/garbageLive/adapters/ntpc122972";
import { taichungLiveAdapter } from "@/lib/server/garbageLive/adapters/taichung83558";

/**
 * Every city with a live-position adapter: 新北市 (#679) and 臺中市 (#680).
 * 臺南市 and 高雄市 are deliberately absent: their datasets are unreachable
 * from every network we can run from (see LIVE_UNREACHABLE_COUNTIES).
 */
export const LIVE_TRUCK_ADAPTERS: LiveAdapterRegistry = {
  new_taipei: ntpcLiveAdapter,
  taichung: taichungLiveAdapter,
};

export function getLiveTruckAdapter(city: LiveTruckCity): LiveAdapterRegistry[LiveTruckCity] {
  return LIVE_TRUCK_ADAPTERS[city];
}
