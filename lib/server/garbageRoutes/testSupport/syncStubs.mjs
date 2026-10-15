// Stubs for the two outside edges of runGarbageRoutesSync(), shared by
// syncMemory.test.mjs (in-process) and syncChild.mjs (tight-heap child process):
//   - "@/lib/server/net/httpClient": serves a CSV from disk, in 16 KB chunks
//     like a socket would, or a configured HTTP status;
//   - "@/lib/server/db/mysql": a fake pool whose query() formats every upsert
//     with mysql2's real SQL formatter (so the string/parameter cost per batch
//     is the real one) and then answers like a database.
// Both reach the test through globalThis.__garbageSyncTest, because they are
// data: URL modules and cannot import anything relative.
import { createRequire } from "node:module";
import { registerRepoHooks, stubModule } from "./repoHooks.mjs";

const require = createRequire(import.meta.url);

const mysqlStubSource = `
const t = () => globalThis.__garbageSyncTest;
const conn = {
  async query(sql, values) {
    const s = t();
    s.queries++;
    if (/^\\s*SELECT COUNT/i.test(sql)) return [[{ total: s.previousCount }], undefined];
    if (/^\\s*DELETE/i.test(sql)) {
      s.deletes.push(values);
      return [{ affectedRows: 0 }, undefined];
    }
    const rows = Array.isArray(values?.[0]) ? values[0].length : 0;
    // the real driver turns the statement into one big string before sending it
    const text = s.format(sql, values);
    s.maxSqlChars = Math.max(s.maxSqlChars, text.length);
    s.upsertQueries++;
    s.maxUpsertRows = Math.max(s.maxUpsertRows, rows);
    const city = rows > 0 ? values[0][0][0] : "?";
    s.upsertRowsByCity[city] = (s.upsertRowsByCity[city] ?? 0) + rows;
    // a database round trip always comes back through the event loop
    await new Promise((resolve) => setTimeout(resolve, 0));
    return [{ affectedRows: rows }, undefined];
  },
  async execute(sql, values) {
    const s = t();
    if (/INSERT INTO ingest_runs/i.test(sql)) return [{ insertId: 1 }, undefined];
    if (/INSERT INTO ingest_errors/i.test(sql)) s.ingestErrors.push(values);
    return [{ affectedRows: 1 }, undefined];
  },
};
export const toSqlDateTime = (value) => value.toISOString().slice(0, 19).replace("T", " ");
export const utcNowSql = () => toSqlDateTime(new Date());
export const withConnection = async (fn) => fn(conn);
export const withAdvisoryLock = async (_name, _timeout, fn) => ({ acquired: true, result: await fn(conn) });
`;

const httpStubSource = `
export const httpGetText = async (url) => {
  const s = globalThis.__garbageSyncTest;
  const city = url.includes("ntpc.gov.tw") ? "ntpc" : "taipei";
  s.fetched.push(city);
  await new Promise((resolve) => setTimeout(resolve, 1));
  if (s.httpStatus[city]) return { status: s.httpStatus[city], text: "" };
  const raw = s.readFileSync(s.files[city]);
  const chunks = [];
  for (let i = 0; i < raw.length; i += 16384) chunks.push(Buffer.from(raw.subarray(i, i + 16384)));
  return { status: 200, text: Buffer.concat(chunks).toString("utf-8") };
};
`;

/** Installs the stubs (call before importing runSync.ts) and returns the mutable state the tests drive them with. */
export function registerSyncStubs({ ntpcCsvPath, taipeiCsvPath }) {
  const state = {
    files: { ntpc: ntpcCsvPath, taipei: taipeiCsvPath },
    /** city -> HTTP status to answer instead of the CSV (simulates an upstream outage). */
    httpStatus: {},
    /** What `SELECT COUNT(*)` reports as the previous snapshot size. */
    previousCount: 0,
    format: require("mysql2").format,
    readFileSync: require("node:fs").readFileSync,
    // observations
    fetched: [],
    queries: 0,
    upsertQueries: 0,
    maxUpsertRows: 0,
    maxSqlChars: 0,
    upsertRowsByCity: {},
    deletes: [],
    ingestErrors: [],
  };
  globalThis.__garbageSyncTest = state;
  registerRepoHooks({
    "@/lib/server/db/mysql": stubModule(mysqlStubSource),
    "@/lib/server/net/httpClient": stubModule(httpStubSource),
  });
  return state;
}

/** Clears what a previous run observed, keeping the file paths. */
export function resetSyncStubs(state) {
  state.httpStatus = {};
  state.previousCount = 0;
  state.fetched = [];
  state.queries = 0;
  state.upsertQueries = 0;
  state.maxUpsertRows = 0;
  state.maxSqlChars = 0;
  state.upsertRowsByCity = {};
  state.deletes = [];
  state.ingestErrors = [];
}
