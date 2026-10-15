/**
 * Stage-by-stage memory trail of the garbage-route sync (issue #674).
 *
 * The first production run restarted the web process while the 新北 city was
 * being processed, and nothing in the logs said at which step. Each stage
 * therefore writes ONE self-contained JSON line (console.log, i.e. straight to
 * the pm2 log file) with the heap and resident memory at that moment, so the
 * last line before a crash names the step that was running:
 *
 *   {"event":"garbage_routes_sync_stage","runId":12,"city":"new_taipei","stage":"after_parse",
 *    "heapUsedMB":41.2,"rssMB":468.9,"externalMB":9.7,"elapsedMs":930,"rows":26574}
 *
 * Stages, in order, per city: before_fetch, after_fetch, after_parse,
 * after_upsert_batches (every UPSERT_LOG_EVERY_BATCHES batches), after_upsert,
 * after_prune. A failed city ends with city_failed instead.
 */

export type GarbageRoutesSyncStage =
  | "before_fetch"
  | "after_fetch"
  | "after_parse"
  | "after_upsert_batches"
  | "after_upsert"
  | "after_prune"
  | "city_failed";

/** One log line per this many upsert batches (200 rows each), plus one for the last batch. */
export const UPSERT_LOG_EVERY_BATCHES = 10;

const toMb = (bytes: number): number => Math.round((bytes / 1048576) * 10) / 10;

export interface MemorySnapshotMb {
  heapUsedMB: number;
  rssMB: number;
  /** Memory held outside the V8 heap (Buffers, TLS, zlib). */
  externalMB: number;
}

export const readMemoryMb = (): MemorySnapshotMb => {
  const usage = process.memoryUsage();
  return { heapUsedMB: toMb(usage.heapUsed), rssMB: toMb(usage.rss), externalMB: toMb(usage.external) };
};

export type GarbageRoutesStageLogger = (stage: GarbageRoutesSyncStage, detail?: Record<string, unknown>) => void;

export interface StageLoggerOptions {
  runId: number;
  city: string;
  /** Epoch ms the run started, for `elapsedMs`. */
  runStartedAtMs: number;
  /** Test seams; default to console.log and Date.now. */
  write?: (line: string) => void;
  now?: () => number;
  readMemory?: () => MemorySnapshotMb;
}

export const createStageLogger = (options: StageLoggerOptions): GarbageRoutesStageLogger => {
  const write = options.write ?? ((line: string) => console.log(line));
  const now = options.now ?? Date.now;
  const readMemory = options.readMemory ?? readMemoryMb;

  return (stage, detail) => {
    try {
      write(
        JSON.stringify({
          event: "garbage_routes_sync_stage",
          runId: options.runId,
          city: options.city,
          stage,
          ...readMemory(),
          elapsedMs: now() - options.runStartedAtMs,
          ...detail,
        }),
      );
    } catch {
      // A diagnostics line must never be the reason a sync fails.
    }
  };
};
