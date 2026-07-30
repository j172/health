import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import { env } from "@/lib/server/config/env";
import { withConnection, utcNowSql } from "@/lib/server/db/mysql";
import { countyForAddress, isWithinCountyBounds } from "@/lib/server/facilities/countyBounds";

export const runtime = "nodejs";
export const maxDuration = 60;

// One-off repair for facilities whose geocoded lat/lng lands outside the
// county their own address names — confirmed live (e.g. 臺中市南區建國北路
// 一段110號's 中山醫學大學附設醫院 geocoded to central Taipei). The free
// geocoders (OpenCage/Nominatim) occasionally match a same-named street in
// the wrong city; there's no Google Maps API key configured to replace them
// with, so this just detects the mismatch, clears the bad coordinates, and
// resets geocode_attempts so the existing OpenCage/Nominatim backfill
// retries it (not guaranteed to land correctly next time, but at least the
// map stops showing a confidently-wrong pin in the meantime).
export async function POST(request: Request): Promise<NextResponse> {
  const secret = request.headers.get("x-rss-sync-admin-secret") || "";
  if (secret !== env.rssSyncAdminSecret) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const result = await withConnection(async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT id, address, lat, lng FROM facilities WHERE lat IS NOT NULL AND lng IS NOT NULL AND address IS NOT NULL`,
    );

    let scanned = 0;
    let mismatched = 0;
    let unrecognizedCounty = 0;
    const samples: { id: number; address: string; county: string; lat: number; lng: number }[] = [];

    for (const row of rows as unknown as { id: number; address: string; lat: number; lng: number }[]) {
      scanned++;
      const county = countyForAddress(row.address);
      if (!county) {
        unrecognizedCounty++;
        continue;
      }
      if (isWithinCountyBounds(county, row.lat, row.lng)) continue;

      mismatched++;
      if (samples.length < 20) samples.push({ id: row.id, address: row.address, county, lat: row.lat, lng: row.lng });

      await conn.query("UPDATE facilities SET lat = NULL, lng = NULL, geocode_attempts = 0, updated_at = ? WHERE id = ?", [
        utcNowSql(),
        row.id,
      ]);
    }

    return { scanned, mismatched, unrecognizedCounty, samples };
  });

  return NextResponse.json({ ok: true, result });
}
