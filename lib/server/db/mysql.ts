import fs from "node:fs";
import path from "node:path";
import mysql, {
  type Pool,
  type PoolConnection,
  type RowDataPacket,
} from "mysql2/promise";
import { env } from "@/lib/server/config/env";
import { TABLE_DDL } from "@/lib/server/db/schema";

let pool: Pool | null = null;
let schemaReady = false;

/** Formats a Date as MySQL DATETIME (`YYYY-MM-DD HH:MM:SS`, UTC). */
export const toSqlDateTime = (value: Date): string =>
  value.toISOString().slice(0, 19).replace("T", " ");

const nowUtc = (): string => toSqlDateTime(new Date());

const isConnectionUnavailableError = (error: unknown): boolean => {
  if (!error) return false;
  const message = error instanceof Error ? error.message : String(error);
  return /ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EHOSTUNREACH|ECONNRESET|Connection lost|connect ECONNREFUSED/i.test(
    message,
  );
};

export const getMysqlPool = (): Pool => {
  if (pool) return pool;

  pool = mysql.createPool({
    host: env.mysql.host,
    port: env.mysql.port,
    user: env.mysql.user,
    password: env.mysql.password,
    database: env.mysql.database,
    waitForConnections: true,
    connectionLimit: 8,
    queueLimit: 0,
    ssl: env.mysql.ssl ? {} : undefined,
    charset: "utf8mb4",
    timezone: "Z",
    supportBigNumbers: true,
    dateStrings: false,
  });

  return pool;
};

export const getPool = getMysqlPool;

export const ensureSchema = async (): Promise<void> => {
  if (schemaReady) return;
  const p = getMysqlPool();
  await p.query(TABLE_DDL.newsItems);
  await p.query(TABLE_DDL.newsAssets);
  await p.query(TABLE_DDL.newsCardImages);
  await p.query(TABLE_DDL.pixabayApiCache);
  await p.query(TABLE_DDL.providerApiCache);
  await p.query(TABLE_DDL.imageProviderCooldown);
  await p.query(TABLE_DDL.geocodeProviderBudget);
  await p.query(TABLE_DDL.geocodeBackfillFlags);
  await p.query(TABLE_DDL.geocodeSourceRotation);
  await p.query(TABLE_DDL.ingestRuns);
  await p.query(TABLE_DDL.ingestErrors);
  await p.query(TABLE_DDL.facilities);
  await p.query(TABLE_DDL.drugs);
  await p.query(TABLE_DDL.tfdaDrugIngredients);
  await p.query(TABLE_DDL.aqiReadings);
  await p.query(TABLE_DDL.pm25Readings);
  await p.query(TABLE_DDL.aqiForecasts);
  await p.query(TABLE_DDL.cwaForecasts);
  await p.query(TABLE_DDL.cwaEarthquakes);
  await p.query(TABLE_DDL.cwaTsunamis);
  await p.query(TABLE_DDL.cwaAlerts);
  await p.query(TABLE_DDL.cwaTownshipHazards);
  await p.query(TABLE_DDL.cwaStationWeather);
  await p.query(TABLE_DDL.cwaRainfall);
  await p.query(TABLE_DDL.cwaDailyRainfall);
  await p.query(TABLE_DDL.cwaUvIndex);
  await p.query(TABLE_DDL.globalEarthquakes);
  await p.query(TABLE_DDL.tfdaFoodNutrition);
  await p.query(TABLE_DDL.tfdaFoodOperators);
  await p.query(TABLE_DDL.tfdaHealthSupplements);
  await p.query(TABLE_DDL.socialPostQueue);
  await p.query(TABLE_DDL.culturalEvents);
  await p.query(TABLE_DDL.culturalEventShows);
  await p.query(TABLE_DDL.publicArts);
  await p.query(TABLE_DDL.cdcTravelAlerts);
  await p.query(TABLE_DDL.cdcEpidemicNews);
  await p.query(TABLE_DDL.waterOutages);
  await p.query(TABLE_DDL.greenProducts);
  await p.query(TABLE_DDL.carbonFootprintProducts);
  await p.query(TABLE_DDL.aqxHourlyWide);
  await p.query(TABLE_DDL.aqxHourlyNarrow);
  await p.query(TABLE_DDL.carbonFootprintCoefficients);
  await p.query(TABLE_DDL.wraWaterLevelReadings);
  await p.query(TABLE_DDL.wraReservoirStatus);
  await p.query(TABLE_DDL.wraReservoirs);
  await p.query(TABLE_DDL.wraWaterLevelStations);
  await p.query(TABLE_DDL.petAdoptions);
  await p.query(TABLE_DDL.latestBooks);
  await p.query(TABLE_DDL.metroAlerts);
  await p.query(TABLE_DDL.youbikeStations);
  await p.query(TABLE_DDL.pestAlerts);
  // CREATE TABLE IF NOT EXISTS above doesn't add columns to an already-existing
  // table, so newly-added columns need an explicit migration here.
  await p.query(`
    ALTER TABLE cultural_events
      ADD COLUMN IF NOT EXISTS title_en VARCHAR(500) NULL AFTER title,
      ADD COLUMN IF NOT EXISTS description_en LONGTEXT NULL AFTER description,
      ADD COLUMN IF NOT EXISTS extra_json JSON NULL AFTER web_sales
  `);
  await p.query(`
    ALTER TABLE news_items
      ADD COLUMN IF NOT EXISTS meta_title VARCHAR(255) NULL AFTER display_type,
      ADD COLUMN IF NOT EXISTS meta_description VARCHAR(500) NULL AFTER meta_title,
      ADD COLUMN IF NOT EXISTS keywords VARCHAR(500) NULL AFTER meta_description,
      ADD COLUMN IF NOT EXISTS geo_summary TEXT NULL AFTER keywords
  `);
  await p.query(`
    ALTER TABLE news_items
      ADD COLUMN IF NOT EXISTS views INT UNSIGNED NOT NULL DEFAULT 0 AFTER geo_summary
  `);
  await p.query(`
    ALTER TABLE news_items
      ADD INDEX IF NOT EXISTS idx_news_views (views)
  `);
  // Tracks how many times assignMissingNewsCardImages has exhausted every
  // candidate term for this article without finding a usable image — without
  // this, the missing-images query always re-fetches the same top-N-by-recency
  // articles, so a handful of consistently-unmatchable ones permanently block
  // every article behind them in the backfill queue (confirmed live 2026-08-02:
  // one stuck article alone absorbed 70+ consecutive batch rounds).
  await p.query(`
    ALTER TABLE news_items
      ADD COLUMN IF NOT EXISTS image_backfill_attempts INT UNSIGNED NOT NULL DEFAULT 0 AFTER views,
      ADD COLUMN IF NOT EXISTS lat DECIMAL(10,7) NULL AFTER image_backfill_attempts,
      ADD COLUMN IF NOT EXISTS lng DECIMAL(10,7) NULL AFTER lat,
      ADD COLUMN IF NOT EXISTS location_name VARCHAR(255) NULL AFTER lng,
      ADD COLUMN IF NOT EXISTS facility_id BIGINT NULL AFTER location_name,
      ADD COLUMN IF NOT EXISTS geocode_attempts INT UNSIGNED NOT NULL DEFAULT 0 AFTER facility_id
  `);
  await p.query(`
    ALTER TABLE news_items
      ADD INDEX IF NOT EXISTS idx_news_geo (lat, lng),
      ADD INDEX IF NOT EXISTS idx_news_facility (facility_id)
  `);
  // news_card_images was originally Pixabay-only (pixabay_id BIGINT NOT NULL
  // UNIQUE, see TABLE_DDL.newsCardImages above, deliberately left as-is).
  // Generalizing to the Pixabay/Pexels/Unsplash provider chain (see
  // docs/specs/news-card-image-multi-provider-fallback.md section 4) adds a
  // provider + provider_image_id pair without dropping/renaming pixabay_id,
  // so existing production rows are untouched.
  await p.query(`
    ALTER TABLE news_card_images
      ADD COLUMN IF NOT EXISTS provider VARCHAR(20) NOT NULL DEFAULT 'pixabay' AFTER news_item_id,
      ADD COLUMN IF NOT EXISTS provider_image_id VARCHAR(64) NULL AFTER provider
  `);
  // One-time backfill: every existing row is a Pixabay row (this table
  // predates the other providers), so its pixabay_id doubles as its
  // provider_image_id. Safe to re-run — only ever touches NULL rows.
  await p.query(`
    UPDATE news_card_images SET provider_image_id = pixabay_id WHERE provider_image_id IS NULL
  `);
  await p.query(`
    ALTER TABLE news_card_images
      ADD UNIQUE KEY IF NOT EXISTS uq_card_image_provider_image (provider, provider_image_id)
  `);
  // pixabay_id was NOT NULL UNIQUE back when this table only ever held
  // Pixabay rows. Pexels/Unsplash rows have no pixabay_id at all, so the
  // column has to accept NULL (uq_card_image_pixabay's UNIQUE KEY still
  // works fine with multiple NULLs — MySQL doesn't treat those as
  // duplicates). Safe to re-run: a no-op once already nullable.
  await p.query(`
    ALTER TABLE news_card_images
      MODIFY COLUMN pixabay_id BIGINT NULL
  `);
  // Normalize legacy static map paths from /uploads/maps/ to /images/news/maps/
  // so all card images share the same /images/:path* immutable caching policy.
  await p.query(`
    UPDATE news_card_images
      SET local_path = REPLACE(local_path, '/uploads/maps/', '/images/news/maps/')
      WHERE local_path LIKE '/uploads/maps/%'
  `);
  await p.query(`
    ALTER TABLE facilities
      ADD COLUMN IF NOT EXISTS geocode_attempts INT NOT NULL DEFAULT 0 AFTER lng
  `);
  // uq_facility_source is (source_key, source_id), so it can't serve lookups
  // keyed by source_id alone (e.g. matching NHI's shared institution codes
  // across the nhi_hospital/nhi_pharmacy sources in applyWeeklyHours()) —
  // without this, that JOIN falls back to a full table scan.
  await p.query(`
    ALTER TABLE facilities
      ADD INDEX IF NOT EXISTS idx_facility_source_id (source_id)
  `);
  await p.query(`
    ALTER TABLE aqi_readings
      ADD COLUMN IF NOT EXISTS lat DECIMAL(10,7) NULL AFTER county,
      ADD COLUMN IF NOT EXISTS lng DECIMAL(10,7) NULL AFTER lat
  `);
  await p.query(`
    ALTER TABLE aqi_readings
      ADD INDEX IF NOT EXISTS idx_aqi_reading_geo (lat, lng)
  `);
  // Unlike the DDL above, this can't use `ADD INDEX IF NOT EXISTS` — MySQL
  // has no "if not exists" form for FULLTEXT indexes, so a second run (or a
  // host whose MySQL build lacks the ngram parser plugin) throws here every
  // time rather than being a no-op. Swallowing it is safe either way:
  // searchNewsItems() (lib/server/news/queries.ts) always has a LIKE-based
  // fallback for when this index is missing or MATCH AGAINST itself fails.
  try {
    await p.query(`
      ALTER TABLE news_items
        ADD FULLTEXT INDEX ft_news_search (title, description_html, keywords) WITH PARSER ngram
    `);
  } catch {
    // Index already exists or non-supported storage engine
  }
  // Clean up legacy non-health news sources (culture_tw, public_art) and
  // retired source names whose historical rows should be removed entirely.
  await p.query(`
    DELETE FROM news_items
    WHERE source_name IN ('culture_tw', 'public_art', 'mababy', 'ntuh', 'ntuh_ifc')
  `);

  // Fix hakka_community facilities that were incorrectly geocoded to Taipei due to unverified geocoder fuzzy matches
  await p.query(`
    UPDATE facilities 
    SET lat = 24.22735, lng = 120.83594, updated_at = NOW()
    WHERE facility_type = 'hakka_community' AND name = '臺中市東勢區詒福社區發展協會' AND (lat > 25.0 OR lat IS NULL)
  `);
  await p.query(`
    UPDATE facilities 
    SET lat = 23.98580, lng = 121.57275, updated_at = NOW()
    WHERE facility_type = 'hakka_community' AND name = '花蓮縣花蓮市碧雲莊社區發展協會' AND (lat > 25.0 OR lat IS NULL)
  `);
  await p.query(`
    UPDATE facilities 
    SET lat = 24.23747, lng = 120.83410, updated_at = NOW()
    WHERE facility_type = 'hakka_community' AND name = '社團法人臺中市東勢農民老人會' AND (lat > 25.0 OR lat IS NULL)
  `);
  await p.query(`
    UPDATE facilities 
    SET lat = 22.98504, lng = 120.18977, updated_at = NOW()
    WHERE facility_type = 'hakka_community' AND name = '臺南市南區文南社區發展協會' AND (lat > 25.0 OR lat IS NULL)
  `);
  await p.query(`
    UPDATE facilities
    SET lat = NULL, lng = NULL, geocode_attempts = 0, updated_at = NOW()
    WHERE facility_type = 'hakka_community'
      AND address NOT LIKE '%台北%' AND address NOT LIKE '%臺北%' AND address NOT LIKE '%新北%'
      AND lat BETWEEN 24.95 AND 25.25 AND lng BETWEEN 121.45 AND 121.65
      AND name NOT IN ('臺中市東勢區詒福社區發展協會', '花蓮縣花蓮市碧雲莊社區發展協會', '社團法人臺中市東勢農民老人會', '臺南市南區文南社區發展協會')
  `);

  // Auto-seed / sync sheltered workshops (62 organizations with merchandise/products) into facilities
  try {
    const filePath = path.join(process.cwd(), "data", "sheltered-workshops.json");
    if (fs.existsSync(filePath)) {
      const workshops = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      if (Array.isArray(workshops) && workshops.length > 0) {
        for (const item of workshops) {
          const sourceId = `sheltered_${item.id}`;
          const [existing] = await p.query<RowDataPacket[]>(
            "SELECT id, extra_json FROM facilities WHERE source_id = ? OR name = ? LIMIT 1",
            [sourceId, item.name]
          );

          let extra: any = {};
          if (existing[0]?.extra_json) {
            try {
              extra = typeof existing[0].extra_json === "string" ? JSON.parse(existing[0].extra_json) : existing[0].extra_json;
            } catch {}
          }
          extra.hasProducts = true;
          if (item.storeUrl) extra.storeUrl = item.storeUrl;
          if (item.productNote) extra.productNote = item.productNote;

          if (existing[0]) {
            await p.query(
              "UPDATE facilities SET extra_json = ?, phone = COALESCE(phone, ?), address = COALESCE(address, ?), lat = COALESCE(lat, ?), lng = COALESCE(lng, ?), updated_at = NOW() WHERE id = ?",
              [JSON.stringify(extra), item.phone || null, item.address || null, item.lat || null, item.lng || null, existing[0].id]
            );
          } else {
            await p.query(
              `INSERT INTO facilities (facility_type, source_key, source_id, name, address, phone, lat, lng, extra_json, created_at, updated_at)
               VALUES ('npo', 'sheltered_workshop', ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
              [sourceId, item.name, item.address || null, item.phone || null, item.lat || null, item.lng || null, JSON.stringify(extra)]
            );
          }
        }
      }
    }
  } catch (err) {
    console.error("Failed to auto-seed sheltered workshops:", err);
  }

  // Auto-seed pet_adoptions table from bundled data/pet-adoptions-seed.json if empty
  try {
    const [petCountRows] = await p.query<RowDataPacket[]>(
      "SELECT COUNT(*) AS cnt FROM pet_adoptions"
    );
    if ((petCountRows[0]?.cnt ?? 0) === 0) {
      const filePath = path.join(process.cwd(), "data", "pet-adoptions-seed.json");
      if (fs.existsSync(filePath)) {
        const seedRows = JSON.parse(fs.readFileSync(filePath, "utf-8"));
        if (Array.isArray(seedRows) && seedRows.length > 0) {
          for (const r of seedRows) {
            await p.query(
              `INSERT IGNORE INTO pet_adoptions (
                animal_id, animal_subid, animal_kind, animal_variety, animal_sex,
                animal_bodytype, animal_colour, animal_age, animal_sterilization,
                animal_bacterin, animal_foundplace, animal_status, animal_remark,
                animal_opendate, album_file, shelter_name, shelter_address, shelter_tel,
                city, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
              [
                r.animal_id, r.animal_subid || null, r.animal_kind || "其他", r.animal_variety || null,
                r.animal_sex || "N", r.animal_bodytype || null, r.animal_colour || null, r.animal_age || null,
                r.animal_sterilization || null, r.animal_bacterin || null, r.animal_foundplace || null,
                r.animal_status || "OPEN", r.animal_remark || null, r.animal_opendate || null,
                r.album_file || null, r.shelter_name || null, r.shelter_address || null, r.shelter_tel || null,
                r.city || null,
              ]
            );
          }
        }
      }
    }
  } catch (err) {
    console.error("Failed to auto-seed pet adoptions:", err);
  }


  // Auto-seed public_arts table from bundled data/public-art.json if empty
  try {
    const [paCountRows] = await p.query<RowDataPacket[]>(
      "SELECT COUNT(*) AS cnt FROM public_arts"
    );
    if ((paCountRows[0]?.cnt ?? 0) === 0) {
      const filePath = path.join(process.cwd(), "data", "public-art.json");
      if (fs.existsSync(filePath)) {
        const rawJson = JSON.parse(fs.readFileSync(filePath, "utf-8"));
        if (Array.isArray(rawJson) && rawJson.length > 0) {
          const now = toSqlDateTime(new Date());
          const BATCH_SIZE = 250;
          for (let i = 0; i < rawJson.length; i += BATCH_SIZE) {
            const chunk = rawJson.slice(i, i + BATCH_SIZE);
            const values = chunk.map((a: any) => [
              a.artNo || a.id,
              a.title,
              a.artist || null,
              a.dimensions || null,
              a.material || null,
              a.city || null,
              a.location || null,
              a.lat ?? null,
              a.lng ?? null,
              a.fieldType || null,
              a.description || null,
              a.imageUrl || null,
              a.year || null,
              a.sourceUrl || null,
              a.agency || null,
              now,
              now,
            ]);
            await p.query(
              `INSERT IGNORE INTO public_arts (
                 art_no, title, artist, dimensions, material, city, location,
                 lat, lng, field_type, description, image_url, year, source_url,
                 agency, created_at, updated_at
               ) VALUES ?`,
              [values]
            );
          }
          console.log(`[ensureSchema] Successfully seeded ${rawJson.length} public art items into MySQL`);
        }
      }
    }
  } catch (seedErr) {
    console.warn("[ensureSchema] public_arts seed warning:", seedErr);
  }

  // Auto-seed latest_books table from bundled data/latest-books-seed.json if empty
  try {
    const [lbCountRows] = await p.query<RowDataPacket[]>(
      "SELECT COUNT(*) AS cnt FROM latest_books"
    );
    if ((lbCountRows[0]?.cnt ?? 0) === 0) {
      const filePath = path.join(process.cwd(), "data", "latest-books-seed.json");
      if (fs.existsSync(filePath)) {
        const rawJson = JSON.parse(fs.readFileSync(filePath, "utf-8"));
        const books = rawJson?.books;
        if (Array.isArray(books) && books.length > 0) {
          const now = toSqlDateTime(new Date());
          const values = books.map((b: any) => [
            b.platform,
            b.categoryId,
            b.categoryName,
            b.ranking ?? null,
            b.title,
            b.subtitle ?? null,
            b.author ?? null,
            b.translator ?? null,
            b.publisher ?? null,
            b.publishDate ?? null,
            b.coverUrl ?? null,
            b.productUrl,
            b.isbn ?? null,
            b.listPrice ?? null,
            b.salePrice ?? null,
            b.discount ?? null,
            b.description ?? null,
            b.payloadHash || "",
            now,
            now,
            now,
          ]);
          await p.query(
            `INSERT IGNORE INTO latest_books (
               platform, category_id, category_name, ranking, title, subtitle,
               author, translator, publisher, publish_date, cover_url, product_url,
               isbn, list_price, sale_price, discount, description, payload_hash,
               synced_at, created_at, updated_at
             ) VALUES ?`,
            [values]
          );
          console.log(`[ensureSchema] Successfully seeded ${books.length} latest books into MySQL`);
        }
      }
    }
  } catch (seedErr) {
    console.warn("[ensureSchema] latest_books seed warning:", seedErr);
  }

  // Auto-seed metro_alerts from bundled data/metro-alerts-seed.json if empty
  try {
    const [metroCount] = await p.query<RowDataPacket[]>("SELECT COUNT(*) AS cnt FROM metro_alerts");
    if ((metroCount[0]?.cnt ?? 0) === 0) {
      const metroPath = path.join(process.cwd(), "data", "metro-alerts-seed.json");
      if (fs.existsSync(metroPath)) {
        const alerts = JSON.parse(fs.readFileSync(metroPath, "utf-8"));
        if (Array.isArray(alerts) && alerts.length > 0) {
          for (const a of alerts) {
            await p.query(
              `INSERT IGNORE INTO metro_alerts (
                external_id, line_name, station_name, alert_title, alert_content,
                alert_type, alert_time, status, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
              [a.externalId, a.lineName, a.stationName, a.alertTitle, a.alertContent, a.alertType, a.alertTime, a.status]
            );
          }
          console.log(`[ensureSchema] Successfully seeded ${alerts.length} metro alerts into MySQL`);
        }
      }
    }
  } catch (err) {
    console.warn("[ensureSchema] metro_alerts seed warning:", err);
  }

  // Auto-seed youbike_stations from bundled data/youbike-stations-seed.json if empty
  try {
    const [youbikeCount] = await p.query<RowDataPacket[]>("SELECT COUNT(*) AS cnt FROM youbike_stations");
    if ((youbikeCount[0]?.cnt ?? 0) === 0) {
      const youbikePath = path.join(process.cwd(), "data", "youbike-stations-seed.json");
      if (fs.existsSync(youbikePath)) {
        const stations = JSON.parse(fs.readFileSync(youbikePath, "utf-8"));
        if (Array.isArray(stations) && stations.length > 0) {
          const now = toSqlDateTime(new Date());
          const BATCH_SIZE = 250;
          for (let i = 0; i < stations.length; i += BATCH_SIZE) {
            const chunk = stations.slice(i, i + BATCH_SIZE);
            const values = chunk.map((s: any) => [
              s.cityCode,
              s.stationNo,
              s.nameTw,
              s.districtTw,
              s.addressTw,
              s.lat,
              s.lng,
              s.totalSpaces,
              s.availableBikes,
              s.availableEbikes || 0,
              s.emptySpaces,
              s.isActive,
              s.updatedAtSource,
              now,
              now,
            ]);
            await p.query(
              `INSERT IGNORE INTO youbike_stations (
                city_code, station_no, name_tw, district_tw, address_tw,
                lat, lng, total_spaces, available_bikes, available_ebikes,
                empty_spaces, is_active, updated_at_source, created_at, updated_at
              ) VALUES ?`,
              [values]
            );
          }
          console.log(`[ensureSchema] Successfully seeded ${stations.length} youbike stations into MySQL`);
        }
      }
    }
  } catch (err) {
    console.warn("[ensureSchema] youbike_stations seed warning:", err);
  }

  // Auto-seed pest_alerts from bundled data/pest-alerts-seed.json if empty
  try {
    const [pestCount] = await p.query<RowDataPacket[]>("SELECT COUNT(*) AS cnt FROM pest_alerts");
    if ((pestCount[0]?.cnt ?? 0) === 0) {
      const pestPath = path.join(process.cwd(), "data", "pest-alerts-seed.json");
      if (fs.existsSync(pestPath)) {
        const alerts = JSON.parse(fs.readFileSync(pestPath, "utf-8"));
        if (Array.isArray(alerts) && alerts.length > 0) {
          for (const a of alerts) {
            await p.query(
              `INSERT IGNORE INTO pest_alerts (
                subject_name, monitor_type, alert_time, target_crops,
                alert_data_json, status, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
              [a.subjectName, a.monitorType, a.alertTime, a.targetCrops, a.alertDataJson, a.status]
            );
          }
          console.log(`[ensureSchema] Successfully seeded ${alerts.length} pest alerts into MySQL`);
        }
      }
    }
  } catch (err) {
    console.warn("[ensureSchema] pest_alerts seed warning:", err);
  }

  schemaReady = true;
};

export const withConnection = async <T>(
  runner: (conn: PoolConnection) => Promise<T>,
): Promise<T> => {
  await ensureSchema();
  const conn = await getMysqlPool().getConnection();
  try {
    return await runner(conn);
  } finally {
    conn.release();
  }
};

export const withConnectionFallback = async <T>(
  fallbackValue: T,
  runner: (conn: PoolConnection) => Promise<T>,
): Promise<T> => {
  try {
    return await withConnection(runner);
  } catch (error) {
    if (isConnectionUnavailableError(error)) {
      console.warn(
        `[mysql] Falling back to empty data because the database is unavailable: ${error instanceof Error ? error.message : String(error)}`,
      );
      return fallbackValue;
    }

    throw error;
  }
};

export const withTransaction = async <T>(
  runner: (conn: PoolConnection) => Promise<T>,
): Promise<T> =>
  withConnection(async (conn) => {
    await conn.beginTransaction();
    try {
      const result = await runner(conn);
      await conn.commit();
      return result;
    } catch (error) {
      await conn.rollback();
      throw error;
    }
  });

export type AdvisoryLockResult<T> =
  { acquired: true; result: T } | { acquired: false };

/**
 * Runs a callback with a MySQL advisory lock (GET_LOCK).
 * Guarantees that lock acquisition, execution, and lock release (RELEASE_LOCK)
 * occur on the exact same pooled connection before it is returned to the pool.
 */
export const withAdvisoryLock = async <T>(
  lockName: string,
  timeoutSeconds: number,
  runner: (conn: PoolConnection) => Promise<T>,
): Promise<AdvisoryLockResult<T>> => {
  const pool = getMysqlPool();
  const conn = await pool.getConnection();
  let gotLock = false;
  try {
    const [rows] = await conn.query<RowDataPacket[]>(
      "SELECT GET_LOCK(?, ?) AS ok",
      [lockName, timeoutSeconds],
    );
    gotLock = rows?.[0]?.ok === 1;
    if (!gotLock) {
      return { acquired: false };
    }
    const result = await runner(conn);
    return { acquired: true, result };
  } finally {
    if (gotLock) {
      try {
        await conn.query("DO RELEASE_LOCK(?)", [lockName]);
      } catch (err) {
        console.error(`Failed to release advisory lock ${lockName}:`, err);
      }
    }
    conn.release();
  }
};

export const utcNowSql = nowUtc;
