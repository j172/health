import type { FacilityRecord } from "@/lib/server/facilities/queries";
import { normalizeAddress, toHalfwidthDigits } from "@/lib/server/facilities/csv";
import { env } from "@/lib/server/config/env";

const API_URL = "https://data.moenv.gov.tw/api/v2/gp_p_43";

interface GreenHotelRow {
  serialnumber?: string;
  name?: string;
  address?: string;
  phone?: string;
  latitude?: string;
  longitude?: string;
  note?: string;
  county?: string;
  town?: string;
}

export async function fetchMoenvGreenHotels(): Promise<FacilityRecord[]> {
  const apiKey = env.moenvGpApiKey || env.moenvNewsApiKey;
  if (!apiKey) {
    console.warn("MOENV_GP_API_KEY is not configured; skipping green hotels sync.");
    return [];
  }

  const all: GreenHotelRow[] = [];
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    const url = `${API_URL}?api_key=${encodeURIComponent(apiKey)}&limit=${pageSize}&offset=${offset}&format=JSON`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`gp_p_43 fetch failed: HTTP ${res.status} (offset=${offset})`);
    const json = await res.json();
    const rows = Array.isArray(json) ? json : [];
    all.push(...rows);
    if (rows.length < pageSize) break;
    offset += pageSize;
  }

  const seenKeys = new Set<string>();
  const records: FacilityRecord[] = [];

  for (const r of all) {
    const name = (r.name || "").trim();
    const address = (r.address || "").trim();
    if (!name && !address) continue;

    const sourceId = (r.serialnumber || "").trim() || `${name}_${address}`;
    if (seenKeys.has(sourceId)) continue;
    seenKeys.add(sourceId);

    const phone = (r.phone || "").trim();
    const lat = r.latitude ? parseFloat(r.latitude) : null;
    const lng = r.longitude ? parseFloat(r.longitude) : null;
    const note = (r.note || "").trim() || null;

    records.push({
      facilityType: "green_hotel",
      sourceKey: "moenv_green_hotel",
      sourceId,
      name,
      address: address ? normalizeAddress(address) : null,
      phone: phone ? toHalfwidthDigits(phone) : null,
      lat: Number.isFinite(lat) ? lat : null,
      lng: Number.isFinite(lng) ? lng : null,
      serviceItem: note,
      serviceTime: null,
      dataOrg: "環境部",
    });
  }

  return records;
}

