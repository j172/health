import mysql, { type Pool, type PoolConnection, type RowDataPacket } from "mysql2/promise";
import { env } from "@/lib/server/config/env";
import { TABLE_DDL } from "@/lib/server/db/schema";

let pool: Pool | null = null;
let schemaReady = false;

const nowUtc = (): string => new Date().toISOString().slice(0, 19).replace("T", " ");

const isConnectionUnavailableError = (error: unknown): boolean => {
  if (!error) return false;
  const message = error instanceof Error ? error.message : String(error);
  return /ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EHOSTUNREACH|ECONNRESET|Connection lost|connect ECONNREFUSED/i.test(message);
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
  await p.query(TABLE_DDL.cwaUvIndex);
  await p.query(TABLE_DDL.globalEarthquakes);
  await p.query(TABLE_DDL.tfdaFoodNutrition);
  await p.query(TABLE_DDL.tfdaFoodOperators);
  await p.query(TABLE_DDL.socialPostQueue);
  // CREATE TABLE IF NOT EXISTS above doesn't add columns to an already-existing
  // table, so newly-added columns need an explicit migration here.
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
  schemaReady = true;
};

export const withConnection = async <T>(runner: (conn: PoolConnection) => Promise<T>): Promise<T> => {
  await ensureSchema();
  const conn = await getMysqlPool().getConnection();
  try {
    return await runner(conn);
  } finally {
    conn.release();
  }
};

export const withConnectionFallback = async <T>(fallbackValue: T, runner: (conn: PoolConnection) => Promise<T>): Promise<T> => {
  try {
    return await withConnection(runner);
  } catch (error) {
    if (isConnectionUnavailableError(error)) {
      console.warn(`[mysql] Falling back to empty data because the database is unavailable: ${error instanceof Error ? error.message : String(error)}`);
      return fallbackValue;
    }

    throw error;
  }
};

export const withTransaction = async <T>(runner: (conn: PoolConnection) => Promise<T>): Promise<T> =>
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

export type AdvisoryLockResult<T> = { acquired: true; result: T } | { acquired: false };

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
    const [rows] = await conn.query<RowDataPacket[]>("SELECT GET_LOCK(?, ?) AS ok", [lockName, timeoutSeconds]);
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