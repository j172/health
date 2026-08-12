import { fetchNhiWeeklyHours } from "@/lib/server/facilities/sources/nhiWeeklyHours";
import { applyWeeklyHours } from "@/lib/server/facilities/queries";

export async function runFacilityHoursSync(): Promise<{ matched: number }> {
  const entries = await fetchNhiWeeklyHours();
  return applyWeeklyHours(entries);
}
