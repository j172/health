import { withConnection } from "@/lib/server/db/mysql";

export interface HotlineRecord {
  number: string;
  name: string;
  agency: string;
  category: string;
  billing: string;
  service_hours: string;
  geographic_scope: string;
  alternative_number?: string | null;
  description?: string | null;
  is_active?: number | boolean;
}

/**
 * Upserts Taiwan government hotlines into the government_hotlines table.
 */
export async function upsertGovernmentHotlines(
  records: HotlineRecord[],
): Promise<{ inserted: number; updated: number }> {
  return withConnection(async (conn) => {
    let inserted = 0;
    let updated = 0;

    for (const record of records) {
      const number = String(record.number || "").trim();
      if (!number) continue;

      const [res] = await conn.query(
        `INSERT INTO government_hotlines (
          number, name, agency, category, billing, service_hours, geographic_scope, alternative_number, description, is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          name = VALUES(name),
          agency = VALUES(agency),
          category = VALUES(category),
          billing = VALUES(billing),
          service_hours = VALUES(service_hours),
          geographic_scope = VALUES(geographic_scope),
          alternative_number = VALUES(alternative_number),
          description = VALUES(description),
          is_active = VALUES(is_active)`,
        [
          number,
          String(record.name || "").trim(),
          String(record.agency || "").trim(),
          String(record.category || "").trim(),
          String(record.billing || "").trim(),
          String(record.service_hours || "").trim(),
          String(record.geographic_scope || "").trim(),
          record.alternative_number ? String(record.alternative_number).trim() : null,
          record.description ? String(record.description).trim() : null,
          record.is_active === false || record.is_active === 0 ? 0 : 1,
        ],
      );

      const affected = (res as { affectedRows: number }).affectedRows;
      if (affected === 1) inserted++;
      else if (affected === 2) updated++;
    }

    return { inserted, updated };
  });
}
