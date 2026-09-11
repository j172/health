#!/usr/bin/env node
/**
 * Fetches Ministry of Agriculture (MOA) Pet Adoption dataset (85903):
 * https://data.moa.gov.tw/Service/OpenData/TransService.aspx?UnitId=QcbUEzN6E6DL&IsTransData=1
 * Normalizes and upserts records to the pet_adoptions table.
 *
 * Usage:
 *   node scripts/ingest-pet-adoptions.mjs
 */
import { upsertPetAdoptions, extractTaiwanCity } from "../lib/server/petAdoption/queries.ts";

const SOURCE_URL = "https://data.moa.gov.tw/Service/OpenData/TransService.aspx?UnitId=QcbUEzN6E6DL&IsTransData=1";

async function main() {
  console.log("=================================================");
  console.log("🐶🐱 [Pet Adoption] 下載農業部動物認領養開放資料 (85903)...");
  console.log(`🎯 來源: ${SOURCE_URL}`);
  console.log("=================================================\n");

  const res = await fetch(SOURCE_URL, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) health.j172.tw" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to download pet adoption dataset`);

  const list = await res.json();
  console.log(`總計取得 ${list.length} 筆動物資料，開始清洗欄位...`);

  const records = [];
  for (const item of list) {
    const animalId = Number(item.animal_id);
    if (!animalId || !Number.isFinite(animalId)) continue;

    const kind = (item.animal_kind || "其他").trim();
    const variety = (item.animal_Variety || "").trim();
    const sex = (item.animal_sex || "N").trim();
    const bodytype = (item.animal_bodytype || "").trim();
    const colour = (item.animal_colour || "").trim();
    const age = (item.animal_age || "").trim();
    const sterilization = (item.animal_sterilization || "").trim();
    const bacterin = (item.animal_bacterin || "").trim();
    const foundplace = (item.animal_foundplace || "").trim();
    const status = (item.animal_status || "OPEN").trim();
    const remark = (item.animal_remark || "").trim();
    const opendate = (item.animal_opendate || "").trim();
    const albumFile = (item.album_file || "").trim();
    const shelterName = (item.shelter_name || item.animal_place || "").trim();
    const shelterAddress = (item.shelter_address || "").trim();
    const shelterTel = (item.shelter_tel || "").trim();
    const city = extractTaiwanCity(shelterAddress) || extractTaiwanCity(shelterName) || extractTaiwanCity(foundplace);

    records.push({
      animal_id: animalId,
      animal_subid: (item.animal_subid || "").trim() || null,
      animal_kind: kind,
      animal_variety: variety || null,
      animal_sex: sex,
      animal_bodytype: bodytype || null,
      animal_colour: colour || null,
      animal_age: age || null,
      animal_sterilization: sterilization || null,
      animal_bacterin: bacterin || null,
      animal_foundplace: foundplace || null,
      animal_status: status || null,
      animal_remark: remark || null,
      animal_opendate: opendate || null,
      album_file: albumFile || null,
      shelter_name: shelterName || null,
      shelter_address: shelterAddress || null,
      shelter_tel: shelterTel || null,
      city: city || null,
    });
  }

  console.log(`清洗完成，共 ${records.length} 筆有效紀錄，開始寫入資料庫...`);
  const result = await upsertPetAdoptions(records);
  console.log("寫入資料庫完成:", result);
}

main().catch((err) => {
  console.error("執行失敗:", err);
  process.exit(1);
});
