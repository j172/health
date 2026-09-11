import type { RowDataPacket } from "mysql2/promise";
import { withConnection } from "@/lib/server/db/mysql";
import { chunkedUpsert } from "@/lib/server/db/chunkedUpsert";
import type { PetAdoptionItem, PetAdoptionFilterParams } from "./types";

export interface RawPetRecord {
  animal_id: number;
  animal_subid: string | null;
  animal_kind: string;
  animal_variety: string | null;
  animal_sex: string;
  animal_bodytype: string | null;
  animal_colour: string | null;
  animal_age: string | null;
  animal_sterilization: string | null;
  animal_bacterin: string | null;
  animal_foundplace: string | null;
  animal_status: string | null;
  animal_remark: string | null;
  animal_opendate: string | null;
  album_file: string | null;
  shelter_name: string | null;
  shelter_address: string | null;
  shelter_tel: string | null;
  city: string | null;
}

export function extractTaiwanCity(addressOrName?: string | null): string | null {
  if (!addressOrName) return null;
  const m = addressOrName.match(/(臺北市|台北市|新北市|基隆市|桃園市|新竹市|新竹縣|苗栗縣|臺中市|台中市|彰化縣|南投縣|雲林縣|嘉義市|嘉義縣|臺南市|台南市|高雄市|屏東縣|宜蘭縣|花蓮縣|臺東縣|台東縣|澎湖縣|金門縣|連江縣)/);
  return m ? m[1].replace("台", "臺") : null;
}

export async function upsertPetAdoptions(records: RawPetRecord[]): Promise<{ inserted: number; updated: number }> {
  if (records.length === 0) return { inserted: 0, updated: 0 };

  return await chunkedUpsert(
    records,
    `
    INSERT INTO pet_adoptions
      (animal_id, animal_subid, animal_kind, animal_variety, animal_sex, animal_bodytype, animal_colour, animal_age, animal_sterilization, animal_bacterin, animal_foundplace, animal_status, animal_remark, animal_opendate, album_file, shelter_name, shelter_address, shelter_tel, city, synced_at, created_at, updated_at)
    VALUES ?
    ON DUPLICATE KEY UPDATE
      animal_subid = VALUES(animal_subid),
      animal_kind = VALUES(animal_kind),
      animal_variety = VALUES(animal_variety),
      animal_sex = VALUES(animal_sex),
      animal_bodytype = VALUES(animal_bodytype),
      animal_colour = VALUES(animal_colour),
      animal_age = VALUES(animal_age),
      animal_sterilization = VALUES(animal_sterilization),
      animal_bacterin = VALUES(animal_bacterin),
      animal_foundplace = VALUES(animal_foundplace),
      animal_status = VALUES(animal_status),
      animal_remark = VALUES(animal_remark),
      animal_opendate = VALUES(animal_opendate),
      album_file = VALUES(album_file),
      shelter_name = VALUES(shelter_name),
      shelter_address = VALUES(shelter_address),
      shelter_tel = VALUES(shelter_tel),
      city = VALUES(city),
      synced_at = VALUES(synced_at),
      updated_at = VALUES(updated_at)
    `,
    (r, now) => [
      r.animal_id,
      r.animal_subid,
      r.animal_kind,
      r.animal_variety,
      r.animal_sex,
      r.animal_bodytype,
      r.animal_colour,
      r.animal_age,
      r.animal_sterilization,
      r.animal_bacterin,
      r.animal_foundplace,
      r.animal_status,
      r.animal_remark,
      r.animal_opendate,
      r.album_file,
      r.shelter_name,
      r.shelter_address,
      r.shelter_tel,
      r.city || extractTaiwanCity(r.shelter_address) || extractTaiwanCity(r.shelter_name),
      now,
      now,
      now,
    ],
  );
}

export async function searchPetAdoptions({
  kind,
  sex,
  bodytype,
  city,
  keyword,
  page = 1,
  limit = 24,
}: PetAdoptionFilterParams): Promise<{ items: PetAdoptionItem[]; total: number; totalAll: number }> {
  return withConnection(async (conn) => {
    const conditions: string[] = ["1=1"];
    const params: unknown[] = [];

    if (kind && kind !== "all") {
      conditions.push("animal_kind = ?");
      params.push(kind);
    }
    if (sex && sex !== "all") {
      conditions.push("animal_sex = ?");
      params.push(sex);
    }
    if (bodytype && bodytype !== "all") {
      conditions.push("animal_bodytype = ?");
      params.push(bodytype);
    }
    if (city && city !== "all") {
      const normalizedCity = city.replace("台", "臺");
      conditions.push("(city = ? OR shelter_address LIKE ?)");
      params.push(normalizedCity, `%${normalizedCity}%`);
    }
    if (keyword) {
      conditions.push("(animal_variety LIKE ? OR shelter_name LIKE ? OR animal_remark LIKE ? OR animal_foundplace LIKE ?)");
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }

    const whereSql = conditions.join(" AND ");
    const offset = Math.max(0, (page - 1) * limit);

    const [[countRow], [totalAllRow]] = await Promise.all([
      conn.query<RowDataPacket[]>(`SELECT COUNT(*) AS total FROM pet_adoptions WHERE ${whereSql}`, params),
      conn.query<RowDataPacket[]>("SELECT COUNT(*) AS totalAll FROM pet_adoptions"),
    ]);

    const total = Number((countRow[0] as { total?: number })?.total || 0);
    const totalAll = Number((totalAllRow[0] as { totalAll?: number })?.totalAll || 0);

    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT id, animal_id, animal_subid, animal_kind, animal_variety, animal_sex, animal_bodytype, animal_colour,
              animal_age, animal_sterilization, animal_bacterin, animal_foundplace, animal_status, animal_remark,
              animal_opendate, album_file, shelter_name, shelter_address, shelter_tel, city
       FROM pet_adoptions
       WHERE ${whereSql}
       ORDER BY (album_file IS NOT NULL AND album_file != '') DESC, animal_id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );

    return {
      items: rows as unknown as PetAdoptionItem[],
      total,
      totalAll,
    };
  });
}
