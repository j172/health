import mysql, { type Pool, type PoolConnection, type RowDataPacket } from "mysql2/promise";
import { env } from "@/lib/server/config/env";
import { TABLE_DDL } from "@/lib/server/db/schema";

let pool: Pool | null = null;
let schemaReady = false;

const nowUtc = (): string => new Date().toISOString().slice(0, 19).replace("T", " ");

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