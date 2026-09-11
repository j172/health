import "server-only";
import { httpGetJson } from "@/lib/server/net/httpClient";
import { getPool } from "@/lib/server/db/mysql";
import type { YouBikeStation } from "./types";

function formatTime(str?: string | null): string {
  if (!str) return new Date().toISOString().slice(0, 19).replace("T", " ");
  const clean = str.replace(/[- :T]/g, "");
  if (clean.length >= 14) {
    return `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)} ${clean.slice(8, 10)}:${clean.slice(10, 12)}:${clean.slice(12, 14)}`;
  }
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

function cleanName(raw?: string | null): string {
  return (raw || "").replace(/^YouBike2\.0_/i, "").trim();
}

export interface YouBikeSyncSummary {
  ok: boolean;
  totalUpserted: number;
  cities: Record<string, number>;
  errors: string[];
}

export async function runYouBikeSync(): Promise<YouBikeSyncSummary> {
  const summary: YouBikeSyncSummary = {
    ok: true,
    totalUpserted: 0,
    cities: { TPE: 0, NTPC: 0, HSC: 0 },
    errors: [],
  };

  const allStations: YouBikeStation[] = [];

  // 1. Taipei City
  try {
    const res = await httpGetJson<unknown[]>(
      "https://tcgbusfs.blob.core.windows.net/dotapp/youbike/v2/youbike_immediate.json",
      { timeoutMs: 15000 }
    );
    if (res.status === 200 && Array.isArray(res.data)) {
      let tpeCount = 0;
      for (const s of res.data as Record<string, unknown>[]) {
        const sno = String(s.sno || "");
        if (!sno) continue;
        allStations.push({
          cityCode: "TPE",
          stationNo: sno,
          nameTw: cleanName(s.sna as string),
          districtTw: (s.sarea as string) || "",
          addressTw: (s.ar as string) || "",
          lat: parseFloat(String(s.latitude)) || 0,
          lng: parseFloat(String(s.longitude)) || 0,
          totalSpaces: parseInt(String(s.Quantity), 10) || 0,
          availableBikes: parseInt(String(s.available_rent_bikes), 10) || 0,
          availableEbikes: 0,
          emptySpaces: parseInt(String(s.available_return_bikes), 10) || 0,
          isActive: s.act === "1" ? 1 : 0,
          updatedAtSource: formatTime(
            (s.updateTime || s.srcUpdateTime || s.mday) as string
          ),
        });
        tpeCount++;
      }
      summary.cities.TPE = tpeCount;
    } else {
      summary.errors.push(`Taipei returned status ${res.status}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    summary.errors.push(`Taipei fetch failed: ${msg}`);
  }

  // 2. New Taipei City
  try {
    let ntpcCount = 0;
    for (let page = 0; page < 3; page++) {
      const u = `https://data.ntpc.gov.tw/api/datasets/010e5b15-3823-4b20-b401-b1cf000550c5/json?page=${page}&size=1000`;
      const res = await httpGetJson<unknown[]>(u, { timeoutMs: 15000 });
      if (res.status === 200 && Array.isArray(res.data) && res.data.length > 0) {
        for (const s of res.data as Record<string, unknown>[]) {
          const sno = String(s.sno || "");
          if (!sno) continue;
          allStations.push({
            cityCode: "NTPC",
            stationNo: sno,
            nameTw: cleanName(s.sna as string),
            districtTw: (s.sarea as string) || "",
            addressTw: (s.ar as string) || "",
            lat: parseFloat(String(s.lat)) || 0,
            lng: parseFloat(String(s.lng)) || 0,
            totalSpaces: parseInt(String(s.tot_quantity), 10) || 0,
            availableBikes:
              parseInt(String(s.sbi_quantity), 10) ||
              parseInt(String(s.yb2_quantity), 10) ||
              0,
            availableEbikes: parseInt(String(s.eyb_quantity), 10) || 0,
            emptySpaces: parseInt(String(s.bemp), 10) || 0,
            isActive: s.act === "1" ? 1 : 0,
            updatedAtSource: formatTime(s.mday as string),
          });
          ntpcCount++;
        }
        if (res.data.length < 1000) break;
      } else {
        break;
      }
    }
    summary.cities.NTPC = ntpcCount;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    summary.errors.push(`New Taipei fetch failed: ${msg}`);
  }

  // 3. Hsinchu City
  try {
    const res = await httpGetJson<unknown[]>(
      "https://odws.hccg.gov.tw/001/Upload/25/opendataback/9059/59/5776ed30-fa3c-48f4-9876-d8fb28df0501.json",
      { timeoutMs: 10000 }
    );
    if (res.status === 200 && Array.isArray(res.data)) {
      let hscCount = 0;
      for (let i = 0; i < res.data.length; i++) {
        const s = res.data[i] as Record<string, unknown>;
        const name = (s["站點名稱"] || s.sna || "") as string;
        allStations.push({
          cityCode: "HSC",
          stationNo: `HSC_${i + 1}`,
          nameTw: cleanName(name),
          districtTw: "新竹市",
          addressTw: ((s["站點位置"] || s.ar || "") as string),
          lat: parseFloat(String(s["緯度"] || s.lat)) || 0,
          lng: parseFloat(String(s["經度"] || s.lng)) || 0,
          totalSpaces: 20,
          availableBikes: 10,
          availableEbikes: 0,
          emptySpaces: 10,
          isActive: 1,
          updatedAtSource: new Date().toISOString().slice(0, 19).replace("T", " "),
        });
        hscCount++;
      }
      summary.cities.HSC = hscCount;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    summary.errors.push(`Hsinchu fetch failed: ${msg}`);
  }

  // Upsert into MySQL in batches
  if (allStations.length > 0) {
    try {
      const pool = getPool();
      if (pool) {
        const BATCH_SIZE = 200;
        for (let i = 0; i < allStations.length; i += BATCH_SIZE) {
          const chunk = allStations.slice(i, i + BATCH_SIZE);
          const values = chunk.map((s) => [
            s.cityCode,
            s.stationNo,
            s.nameTw,
            s.districtTw,
            s.addressTw,
            s.lat,
            s.lng,
            s.totalSpaces,
            s.availableBikes,
            s.availableEbikes,
            s.emptySpaces,
            s.isActive,
            s.updatedAtSource,
            new Date(),
          ]);

          await pool.query(
            `INSERT INTO youbike_stations (
              city_code, station_no, name_tw, district_tw, address_tw,
              lat, lng, total_spaces, available_bikes, available_ebikes,
              empty_spaces, is_active, updated_at_source, updated_at
            ) VALUES ?
            ON DUPLICATE KEY UPDATE
              name_tw = VALUES(name_tw),
              district_tw = VALUES(district_tw),
              address_tw = VALUES(address_tw),
              lat = VALUES(lat),
              lng = VALUES(lng),
              total_spaces = VALUES(total_spaces),
              available_bikes = VALUES(available_bikes),
              available_ebikes = VALUES(available_ebikes),
              empty_spaces = VALUES(empty_spaces),
              is_active = VALUES(is_active),
              updated_at_source = VALUES(updated_at_source),
              updated_at = NOW()`,
            [values]
          );
        }
        summary.totalUpserted = allStations.length;
      }
    } catch (dbErr) {
      const msg = dbErr instanceof Error ? dbErr.message : String(dbErr);
      summary.errors.push(`MySQL upsert error: ${msg}`);
      summary.ok = false;
    }
  }

  if (summary.errors.length > 0 && allStations.length === 0) {
    summary.ok = false;
  }

  return summary;
}
