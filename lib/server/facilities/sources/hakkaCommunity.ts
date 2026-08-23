import type { FacilityRecord } from "@/lib/server/facilities/queries";
import { httpGetText } from "@/lib/server/net/httpClient";
import { normalizeAddress } from "@/lib/server/facilities/csv";

// 客家委員會「伯公照護站」名冊 — single national JSON file, no
// coordinates (geocoded via the usual facilities-geocode backfill) and no
// stable per-row ID ("No" is just a sequence number within this export, not
// a government-issued code), so sourceId is derived from name+address like
// the other sources with the same gap.
const SOURCE_URL = "https://cloud.hakka.gov.tw/Pub/Opendata/DTST20230600002.json";

interface HakkaCommunityRow {
  city_name: string;
  Unit_name: string;
  Address: string;
}

export async function fetchHakkaCommunity(): Promise<FacilityRecord[]> {
  // Deliberately not the global fetch() — undici's WASM llhttp parser OOMs
  // on this host's low ulimit -v; see lib/server/net/httpClient.ts.
  const { status, text } = await httpGetText(SOURCE_URL);
  if (status < 200 || status >= 300) throw new Error(`Hakka Affairs Council Bo-Gong care station request failed: HTTP ${status}`);

  const rows: HakkaCommunityRow[] = JSON.parse(text.replace(/^﻿/, ""));

  return rows
    .filter((r) => r.Unit_name && r.Address)
    .map((r) => {
      const address = normalizeAddress(r.Address);
      return {
        facilityType: "hakka_community",
        sourceKey: "hakka_dtst20230600002",
        sourceId: `${r.Unit_name}|${address}`.slice(0, 100),
        name: r.Unit_name,
        address,
        phone: null,
        lat: null,
        lng: null,
        serviceItem: null,
        serviceTime: null,
        dataOrg: "客家委員會",
      };
    });
}
