// Stand-in for "@/lib/server/db/mysql" while the RSS ingestion runs against the stub world.
// Loaded as a real file (not a data: URL) so it can be written as plain code; the module hooks in
// ingestStubs.mjs map the specifier to this file. State lives on globalThis.__rssIngestTest.db so a
// test (or the child entry) can read what the pipeline wrote and steer what it reads back.
//
// It models just enough of the database for the ingestion to behave as it does against MySQL:
//   - ingest_runs / ingest_errors   -> recorded, so a test can assert on run status and quiet skips
//   - news_items identity + hash    -> what was persisted is "unchanged" the next time (warm runs)
//   - GET_LOCK / RELEASE_LOCK / IS_USED_LOCK -> a real named lock, owned by a connection, so two
//     concurrent runRssIngestion() calls contend exactly as they would on the shared server
// Every statement answers through the event loop (setImmediate): a real round trip never completes
// inside the caller's own microtask turn, and a stub that did would hide event-loop starvation.
export const toSqlDateTime = (value) => value.toISOString().slice(0, 19).replace("T", " ");
export const utcNowSql = () => toSqlDateTime(new Date());

const state = () => globalThis.__rssIngestTest.db;
const tick = () => new Promise((resolve) => setImmediate(resolve));

export const createDbState = () => ({
  nextRunId: 1,
  nextConnectionId: 100,
  runs: new Map(),
  errors: [],
  /** key -> payload_hash, under both identities news_items has (external id, canonical url). */
  hashes: new Map(),
  persisted: 0,
  locks: new Map(),
  queries: 0,
  /** Set to make GET_LOCK wait this long (ms) before answering "not acquired"; tests use 0. */
  lockWaitMs: 0,
  /** Statement counts by kind, for assertions. */
  counts: {},
});

const count = (kind) => {
  const s = state();
  s.counts[kind] = (s.counts[kind] ?? 0) + 1;
};

const OK = [{ affectedRows: 1, insertId: 0 }, undefined];

const run = async (sql, values, conn) => {
  const s = state();
  s.queries += 1;
  await tick();
  const text = sql.replace(/\s+/g, " ").trim();

  if (/GET_LOCK\(/i.test(text)) {
    const [name] = values;
    const owner = s.locks.get(name);
    if (owner === undefined || owner === conn.id) {
      s.locks.set(name, conn.id);
      count("get_lock_ok");
      return [[{ ok: 1 }], undefined];
    }
    if (s.lockWaitMs > 0) await new Promise((resolve) => setTimeout(resolve, s.lockWaitMs));
    count("get_lock_busy");
    return [[{ ok: 0 }], undefined];
  }
  if (/RELEASE_LOCK\(/i.test(text)) {
    const [name] = values;
    if (s.locks.get(name) === conn.id) s.locks.delete(name);
    return [[], undefined];
  }
  if (/IS_USED_LOCK\(/i.test(text)) {
    const [name] = values;
    count("lock_heartbeat");
    return [[{ held: s.locks.get(name) === conn.id ? 1 : 0 }], undefined];
  }
  if (/^SELECT 1\b/i.test(text)) return [[{ 1: 1 }], undefined];

  if (/^INSERT INTO ingest_runs/i.test(text)) {
    const id = s.nextRunId++;
    const status = /VALUES \(\?, '(\w+)'/.exec(text)?.[1] ?? values[1] ?? "running";
    s.runs.set(id, { id, trigger: values[0], status, errorMessage: null, summary: null });
    count("insert_run");
    return [{ affectedRows: 1, insertId: id }, undefined];
  }
  if (/^UPDATE ingest_runs SET status = 'failed'/i.test(text)) return [{ affectedRows: 0 }, undefined];
  if (/^UPDATE ingest_runs SET status = \?/i.test(text)) {
    const id = values[values.length - 1];
    const row = s.runs.get(id);
    if (row) {
      row.status = values[0];
      row.errorMessage = values[9];
      row.summary = values[8];
    }
    count("finish_run");
    return [{ affectedRows: 1 }, undefined];
  }
  if (/^INSERT INTO ingest_errors/i.test(text)) {
    s.errors.push({ runId: values[0], feedCode: values[1], url: values[2], message: values[3] });
    return OK;
  }

  // existingHashes.getExistingPayloadHashes
  if (/^SELECT external_id, payload_hash FROM news_items WHERE source_name = \? AND feed_code = \? AND external_id IN/i.test(text)) {
    const [source, feed, ...ids] = values;
    const rows = [];
    for (const id of ids) {
      const hash = s.hashes.get(`${source}::${feed}::${id}`);
      if (hash) rows.push({ external_id: id, payload_hash: hash });
    }
    return [rows, undefined];
  }
  if (/^SELECT canonical_url, payload_hash FROM news_items WHERE source_name = \? AND canonical_url IN/i.test(text)) {
    const [source, ...urls] = values;
    const rows = [];
    for (const url of urls) {
      const hash = s.hashes.get(`${source}::url::${url}`);
      if (hash) rows.push({ canonical_url: url, payload_hash: hash });
    }
    return [rows, undefined];
  }
  // persistItems identity lookups
  if (/^SELECT id, payload_hash FROM news_items WHERE source_name = \? AND feed_code = \? AND external_id = \?/i.test(text)) {
    const [source, feed, id] = values;
    const hash = s.hashes.get(`${source}::${feed}::${id}`);
    return [hash ? [{ id: 1, payload_hash: hash }] : [], undefined];
  }
  if (/^SELECT id, payload_hash FROM news_items WHERE source_name = \? AND canonical_url = \?/i.test(text)) {
    const [source, url] = values;
    const hash = s.hashes.get(`${source}::url::${url}`);
    return [hash ? [{ id: 1, payload_hash: hash }] : [], undefined];
  }
  if (/^UPDATE news_items SET last_seen_at_utc/i.test(text)) return OK;
  if (/^INSERT INTO news_items/i.test(text)) {
    const [source, feed, , externalId, canonicalUrl] = values;
    const payloadHash = values[25];
    const existed = s.hashes.has(`${source}::${feed}::${externalId}`) || s.hashes.has(`${source}::url::${canonicalUrl}`);
    s.hashes.set(`${source}::${feed}::${externalId}`, payloadHash);
    s.hashes.set(`${source}::url::${canonicalUrl}`, payloadHash);
    s.persisted += 1;
    count("upsert_news_item");
    return [{ affectedRows: existed ? 2 : 1, insertId: s.persisted }, undefined];
  }
  if (/^(DELETE FROM|INSERT INTO) (news_assets|news_item_topics)/i.test(text)) return OK;

  // geoExtractor facility lookup, duplicateImageDetection recent-image lookup, anything else read-only
  if (/^SELECT /i.test(text)) return [[], undefined];
  return OK;
};

const makeConn = () => {
  const conn = {
    id: state().nextConnectionId++,
    query: (sql, values) => run(sql, values, conn),
    execute: (sql, values) => run(sql, values, conn),
    beginTransaction: () => tick(),
    commit: () => tick(),
    rollback: () => tick(),
    release: () => {},
  };
  return conn;
};

const pool = {
  getConnection: async () => makeConn(),
  query: async (sql, values) => run(sql, values, makeConn()),
};

export const getMysqlPool = () => pool;
export const getPool = getMysqlPool;
export const ensureSchema = async () => {};
export const withConnection = async (runner) => {
  const conn = makeConn();
  try {
    return await runner(conn);
  } finally {
    conn.release();
  }
};
export const withConnectionFallback = async (_fallback, runner) => withConnection(runner);
export const withTransaction = async (runner) =>
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

// Same shape as lib/server/db/mysql.ts: lock and release on ONE connection, released in `finally`.
export const withAdvisoryLock = async (lockName, timeoutSeconds, runner) => {
  const conn = makeConn();
  let gotLock = false;
  try {
    const [rows] = await conn.query("SELECT GET_LOCK(?, ?) AS ok", [lockName, timeoutSeconds]);
    gotLock = rows?.[0]?.ok === 1;
    if (!gotLock) return { acquired: false };
    const result = await runner(conn);
    return { acquired: true, result };
  } finally {
    if (gotLock) await conn.query("DO RELEASE_LOCK(?)", [lockName]);
    conn.release();
  }
};
