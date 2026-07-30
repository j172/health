import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import { requireAdminSecret } from "@/lib/server/config/adminAuth";
import { withConnection, utcNowSql } from "@/lib/server/db/mysql";
import { normalizeAddress } from "@/lib/server/facilities/csv";

export const runtime = "nodejs";
export const maxDuration = 60;

// One-off repair for rows stored with a stale/buggy address — re-applies
// the current normalizeAddress() to already-stored addresses (no re-fetch
// from source needed) and resets geocode_attempts so the improved address
// gets retried. Originally scoped to rows normalizeAddress() learned to
// split on "及" ("and"); now also covers disability_welfare/elder_welfare,
// where the ingest scripts prepended 縣市/鄉鎮市區 onto a 地址 field that
// already had it, producing "新北市土城區新北市土城區中正路18號6樓"-style
// duplication (normalizeAddress's dedupeAddressPrefix step fixes this).
export async function POST(request: Request): Promise<NextResponse> {
  const unauthorized = requireAdminSecret(request);
  if (unauthorized) return unauthorized;

  const result = await withConnection(async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT id, address FROM facilities
       WHERE lat IS NULL AND address IS NOT NULL
         AND (address LIKE '%及%' OR facility_type IN ('disability_welfare', 'elder_welfare'))`,
    );
    let changed = 0;
    for (const row of rows as unknown as { id: number; address: string }[]) {
      const renormalized = normalizeAddress(row.address);
      if (renormalized !== row.address) {
        await conn.query("UPDATE facilities SET address = ?, geocode_attempts = 0, updated_at = ? WHERE id = ?", [
          renormalized,
          utcNowSql(),
          row.id,
        ]);
        changed++;
      }
    }
    return { scanned: rows.length, changed };
  });

  return NextResponse.json({ ok: true, result });
}
