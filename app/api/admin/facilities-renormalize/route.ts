import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import { env } from "@/lib/server/config/env";
import { withConnection, utcNowSql } from "@/lib/server/db/mysql";
import { normalizeAddress } from "@/lib/server/facilities/csv";

export const runtime = "nodejs";
export const maxDuration = 60;

// One-off repair for rows stored before normalizeAddress() learned to split
// on "及" ("and") — re-applies the current normalizeAddress() to already-
// stored addresses (no re-fetch from source needed) and resets
// geocode_attempts so the improved address gets retried.
export async function POST(request: Request): Promise<NextResponse> {
  const secret = request.headers.get("x-rss-sync-admin-secret") || "";
  if (secret !== env.rssSyncAdminSecret) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const result = await withConnection(async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT id, address FROM facilities
       WHERE lat IS NULL AND address IS NOT NULL AND address LIKE '%及%'`,
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
