import type { RowDataPacket } from "mysql2/promise";
import { withConnection, utcNowSql } from "@/lib/server/db/mysql";

export interface DrugRecord {
  sourceKey: string;
  licenseNo: string;
  nameZh: string;
  nameEn: string | null;
  shape: string | null;
  dosageForm: string | null;
  color: string | null;
  odor: string | null;
  scoreMark: string | null;
  sizeMm: string | null;
  imprint1: string | null;
  imprint2: string | null;
  imageUrl: string | null;
}

export interface DrugListItem {
  id: number;
  license_no: string;
  name_zh: string;
  name_en: string | null;
  shape: string | null;
  dosage_form: string | null;
  color: string | null;
  odor: string | null;
  score_mark: string | null;
  size_mm: string | null;
  imprint_1: string | null;
  imprint_2: string | null;
  image_url: string | null;
}

/** Upserts a batch of drug records, keyed by license_no. */
export const upsertDrugs = async (records: DrugRecord[]): Promise<{ inserted: number; updated: number }> =>
  withConnection(async (conn) => {
    let inserted = 0;
    let updated = 0;
    const now = utcNowSql();

    for (const r of records) {
      const [result] = await conn.query(
        `
        INSERT INTO drugs
          (source_key, license_no, name_zh, name_en, shape, dosage_form, color, odor, score_mark, size_mm, imprint_1, imprint_2, image_url, synced_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          name_zh = VALUES(name_zh),
          name_en = VALUES(name_en),
          shape = VALUES(shape),
          dosage_form = VALUES(dosage_form),
          color = VALUES(color),
          odor = VALUES(odor),
          score_mark = VALUES(score_mark),
          size_mm = VALUES(size_mm),
          imprint_1 = VALUES(imprint_1),
          imprint_2 = VALUES(imprint_2),
          image_url = VALUES(image_url),
          synced_at = VALUES(synced_at),
          updated_at = VALUES(updated_at)
        `,
        [
          r.sourceKey,
          r.licenseNo,
          r.nameZh,
          r.nameEn,
          r.shape,
          r.dosageForm,
          r.color,
          r.odor,
          r.scoreMark,
          r.sizeMm,
          r.imprint1,
          r.imprint2,
          r.imageUrl,
          now,
          now,
          now,
        ],
      );
      const affected = (result as { affectedRows: number }).affectedRows;
      if (affected === 1) inserted++;
      else updated++;
    }

    return { inserted, updated };
  });

export const searchDrugs = async (keyword: string, limit = 50): Promise<DrugListItem[]> =>
  withConnection(async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT id, license_no, name_zh, name_en, shape, dosage_form, color, odor, score_mark, size_mm, imprint_1, imprint_2, image_url
       FROM drugs
       WHERE name_zh LIKE ? OR name_en LIKE ? OR license_no LIKE ?
       ORDER BY name_zh ASC
       LIMIT ?`,
      [`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, limit],
    );
    return rows as unknown as DrugListItem[];
  });
