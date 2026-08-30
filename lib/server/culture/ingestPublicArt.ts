import fs from "node:fs";
import path from "node:path";
import { fetchGovData } from "@/lib/server/http/govFetch";
import { withConnection, utcNowSql } from "@/lib/server/db/mysql";
import type { ResultSetHeader } from "mysql2/promise";

const PUBLIC_ART_API_URL =
  "https://publicartap.moc.gov.tw/data/api/artWork/openData";

function toSafeString(v: any): string {
  if (!v) return "";
  if (Array.isArray(v)) return v.map(toSafeString).filter(Boolean).join("、");
  if (typeof v === "string") return v.trim();
  return String(v).trim();
}

export interface IngestPublicArtResult {
  totalFetched: number;
  validArtworks: number;
  insertedOrUpdated: number;
}

export async function runPublicArtSync(
  suppliedRecords?: any[]
): Promise<IngestPublicArtResult> {
  let rawList: any[] = [];

  if (Array.isArray(suppliedRecords) && suppliedRecords.length > 0) {
    rawList = suppliedRecords;
  } else {
    try {
      const res = await fetchGovData(PUBLIC_ART_API_URL);
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json) && json.length > 0) {
          rawList = json;
        }
      }
    } catch (err) {
      console.warn("[Public Art Ingest] Remote fetch failed, falling back to local data/public-art.json:", err);
    }
  }

  if (!rawList || rawList.length === 0) {
    try {
      const localFile = path.join(process.cwd(), "data", "public-art.json");
      if (fs.existsSync(localFile)) {
        const content = fs.readFileSync(localFile, "utf-8");
        const json = JSON.parse(content);
        if (Array.isArray(json)) {
          rawList = json;
        }
      }
    } catch (fsErr) {
      console.error("[Public Art Ingest] Failed to load local data/public-art.json:", fsErr);
    }
  }

  if (!Array.isArray(rawList) || rawList.length === 0) {
    throw new Error("No public art data available from remote or local bundle");
  }

  const validArtworks: Array<{
    artNo: string;
    title: string;
    artist: string | null;
    dimensions: string | null;
    material: string | null;
    city: string | null;
    location: string | null;
    lat: number | null;
    lng: number | null;
    fieldType: string | null;
    description: string | null;
    imageUrl: string | null;
    year: string | null;
    sourceUrl: string | null;
    agency: string | null;
  }> = [];

  const seenArtNos = new Set<string>();

  for (const item of rawList) {
    const title = toSafeString(item["作品名稱"] || item.title);
    if (!title) continue;

    const artNo =
      toSafeString(item["作品編號"] || item.artNo) ||
      toSafeString(item["系統編號"] || item.id) ||
      `ART_${title}_${toSafeString(item["作者"] || item.artist)}`;

    if (seenArtNos.has(artNo)) continue;
    seenArtNos.add(artNo);

    const latRaw = item["緯度"] ?? item.lat;
    const lngRaw = item["經度"] ?? item.lng;
    const lat = latRaw !== null && latRaw !== undefined ? parseFloat(String(latRaw)) : null;
    const lng = lngRaw !== null && lngRaw !== undefined ? parseFloat(String(lngRaw)) : null;

    validArtworks.push({
      artNo,
      title,
      artist: toSafeString(item["作者"] || item.artist) || null,
      dimensions: toSafeString(item["作品尺寸"] || item.dimensions) || null,
      material: toSafeString(item["作品材質"] || item.material) || null,
      city: toSafeString(item["縣市"] || item.city) || null,
      location: toSafeString(item["設置地點"] || item.location) || null,
      lat: lat && !isNaN(lat) ? lat : null,
      lng: lng && !isNaN(lng) ? lng : null,
      fieldType: toSafeString(item["場域"] || item.fieldType) || null,
      description: toSafeString(item["作品說明"] || item.description) || null,
      imageUrl: toSafeString(item["主圖"] || item.imageUrl) || null,
      year: toSafeString(item["創作年代yyyy"] || item.year) || null,
      sourceUrl: toSafeString(item["來源網站"] || item.sourceUrl) || null,
      agency: toSafeString(item["委託單位"] || item.agency) || null,
    });
  }

  const now = utcNowSql();
  let countProcessed = 0;

  const BATCH_SIZE = 100;
  await withConnection(async (conn) => {
    for (let i = 0; i < validArtworks.length; i += BATCH_SIZE) {
      const chunk = validArtworks.slice(i, i + BATCH_SIZE);
      const values = chunk.map((a) => [
        a.artNo,
        a.title,
        a.artist,
        a.dimensions,
        a.material,
        a.city,
        a.location,
        a.lat,
        a.lng,
        a.fieldType,
        a.description,
        a.imageUrl,
        a.year,
        a.sourceUrl,
        a.agency,
        now,
        now,
      ]);

      const [header] = await conn.query<ResultSetHeader>(
        `INSERT INTO public_arts (
           art_no, title, artist, dimensions, material, city, location,
           lat, lng, field_type, description, image_url, year, source_url,
           agency, created_at, updated_at
         ) VALUES ?
         ON DUPLICATE KEY UPDATE
           title = VALUES(title),
           artist = VALUES(artist),
           dimensions = VALUES(dimensions),
           material = VALUES(material),
           city = VALUES(city),
           location = VALUES(location),
           lat = VALUES(lat),
           lng = VALUES(lng),
           field_type = VALUES(field_type),
           description = VALUES(description),
           image_url = VALUES(image_url),
           year = VALUES(year),
           source_url = VALUES(source_url),
           agency = VALUES(agency),
           updated_at = VALUES(updated_at)`,
        [values]
      );
      countProcessed += chunk.length;
    }
  });

  return {
    totalFetched: rawList.length,
    validArtworks: validArtworks.length,
    insertedOrUpdated: countProcessed,
  };
}

