import { upsertFacilities, type FacilityRecord } from "@/lib/server/facilities/queries";
import { fetchTfdaPharmacies } from "@/lib/server/facilities/sources/tfdaPharmacies";
import { fetchMolHealthCheckFacilities } from "@/lib/server/facilities/sources/molHealthCheckFacility";
import { fetchMolOccupationalInjuryHospitals } from "@/lib/server/facilities/sources/molOccupationalInjuryHospital";
import { fetchNhiHospitals } from "@/lib/server/facilities/sources/nhiHospitals";
import { fetchNhiPharmacies } from "@/lib/server/facilities/sources/nhiPharmacies";
import { fetchNhiHomeHealthcare } from "@/lib/server/facilities/sources/nhiHomeHealthcare";
import { fetchHakkaCommunity } from "@/lib/server/facilities/sources/hakkaCommunity";

export interface FacilitySyncResult {
  sourceKey: string;
  fetched: number;
  inserted: number;
  updated: number;
  error: string | null;
}

// Registry of facility sources — add one entry per source as they're wired up
// (drugs, health-checks, etc.), each behind its own fetch function.
const SOURCES: { key: string; fetch: () => Promise<FacilityRecord[]> }[] = [
  { key: "tfda_pharmacy", fetch: fetchTfdaPharmacies },
  { key: "mol_labor_checkup", fetch: fetchMolHealthCheckFacilities },
  { key: "mol_occupational_injury", fetch: fetchMolOccupationalInjuryHospitals },
  { key: "nhi_hospital", fetch: fetchNhiHospitals },
  { key: "nhi_pharmacy", fetch: fetchNhiPharmacies },
  { key: "nhi_home_healthcare", fetch: fetchNhiHomeHealthcare },
  { key: "hakka_dtst20230600002", fetch: fetchHakkaCommunity },
];

// mohw_disability_welfare and mohw_elder_welfare are NOT registered here —
// opendata.mohw.gov.tw is a mohw.gov.tw subdomain, the same apex domain as
// ltcpap.mohw.gov.tw (confirmed unreachable from this host and GitHub
// Actions runners); a facilities-sync run attempting them came back with
// zero rows, and running the equivalent fetch from a residential network
// (scripts/import-mohw-disability-welfare.mjs, scripts/import-mohw-elder-
// welfare.mjs) succeeded immediately, confirming the same IP-range block
// rather than a code bug. Run those two scripts by hand instead.

export async function runFacilitySync(): Promise<FacilitySyncResult[]> {
  const results: FacilitySyncResult[] = [];

  for (const source of SOURCES) {
    try {
      const records = await source.fetch();
      const { inserted, updated } = await upsertFacilities(records);
      results.push({ sourceKey: source.key, fetched: records.length, inserted, updated, error: null });
    } catch (error) {
      results.push({
        sourceKey: source.key,
        fetched: 0,
        inserted: 0,
        updated: 0,
        error: error instanceof Error ? error.message : "Unknown sync error",
      });
    }
  }

  return results;
}
