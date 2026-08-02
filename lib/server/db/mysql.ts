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
      ADD COLUMN IF NOT EXISTS image_backfill_attempts INT UNSIGNED NOT NULL DEFAULT 0 AFTER views
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

export const tryAcquireIngestionLock = async (lockName = "rss_ingestion_lock", timeoutSeconds = 1): Promise<boolean> =>
  withConnection(async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>("SELECT GET_LOCK(?, ?) AS ok", [lockName, timeoutSeconds]);
    return rows?.[0]?.ok === 1;
  });

export const releaseIngestionLock = async (lockName = "rss_ingestion_lock"): Promise<void> => {
  await withConnection(async (conn) => {
    await conn.query("DO RELEASE_LOCK(?)", [lockName]);
  });
};

export const utcNowSql = nowUtc;