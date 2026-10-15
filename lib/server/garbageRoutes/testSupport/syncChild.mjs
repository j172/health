// Child-process helper for syncMemory.test.mjs — NOT a test itself.
//
// Runs the real runGarbageRoutesSync() end to end (fetch -> parse -> 200-row
// upserts -> prune guard, both cities) with only the HTTP client and the MySQL
// pool stubbed (see syncStubs.mjs). The parent starts this under a deliberately
// tight `--max-old-space-size`, so a pipeline that materialises several copies
// of the 26.6k-row file dies here instead of passing silently.
//
//   node --max-old-space-size=40 syncChild.mjs <ntpc-csv> <taipei-csv>
//
// Prints one line `RESULT:<json>` on stdout once the sync finished.
import { registerSyncStubs } from "./syncStubs.mjs";
import { repoRootUrl } from "./repoHooks.mjs";

const [ntpcCsvPath, taipeiCsvPath] = process.argv.slice(2);
const state = registerSyncStubs({ ntpcCsvPath, taipeiCsvPath });
state.previousCount = Number(process.env.GARBAGE_SYNC_TEST_PREVIOUS_COUNT ?? 0);

// Count how often the pipeline hands the event loop back (the stubs wait with setTimeout, not this).
let immediateCalls = 0;
const realSetImmediate = globalThis.setImmediate;
globalThis.setImmediate = (...args) => {
  immediateCalls++;
  return realSetImmediate(...args);
};
// Collect the stage log lines instead of printing them.
const logLines = [];
console.log = (line) => logLines.push(String(line));

const { runGarbageRoutesSync } = await import(new URL("lib/server/garbageRoutes/runSync.ts", repoRootUrl).href);
const result = await runGarbageRoutesSync();

process.stdout.write(
  `RESULT:${JSON.stringify({
    cities: result.cities,
    skipped: result.skipped,
    stages: logLines.map((line) => JSON.parse(line)),
    immediateCalls,
    upsertQueries: state.upsertQueries,
    maxUpsertRows: state.maxUpsertRows,
    maxSqlChars: state.maxSqlChars,
    upsertRowsByCity: state.upsertRowsByCity,
    deletes: state.deletes.length,
    ingestErrors: state.ingestErrors.length,
    maxRssMB: Math.round((process.resourceUsage().maxRSS / 1024) * 10) / 10,
  })}\n`,
);
