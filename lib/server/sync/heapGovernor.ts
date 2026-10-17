/**
 * Collects garbage when a long job has piled up enough of it, instead of waiting
 * for V8 to decide (issue #699).
 *
 * Why this exists: health-web runs with --max-old-space-size=768 but the shared
 * host kills it when its *resident* memory crosses the account's cap, which is
 * far lower and which V8 knows nothing about. V8 only starts a full collection
 * when the heap nears its own limit, and in the meantime short-lived but
 * promoted objects — cheerio documents, parsed XML, HTTP bodies — simply
 * accumulate: the measurement harness (scripts/measure-rss-ingestion-memory.mjs)
 * saw a whole ingestion run, 18 s and several GB of allocation, trigger ONE
 * mark-compact, with ~100 MB of dead heap sitting on ~20 MB live. Native memory
 * behind finalizers (TLS contexts, Buffers) waits for the same collection. So a
 * job that allocates in bursts calls maybeCollect() between its units of work:
 * it is a cheap counter check unless the process has grown by more than a budget
 * since the last collection, and then it takes the pause the job would have
 * taken anyway, at a moment of its own choosing.
 *
 * The collector is obtained without a launch flag (PM2's node_args are not ours
 * to change from here): if `global.gc` is not exposed the V8 flag is switched on
 * at runtime and the function is read out of a fresh context. Anywhere that does
 * not work, maybeCollect() is a no-op and the job behaves exactly as before.
 */
import v8 from "node:v8";
import vm from "node:vm";

export type GcFunction = () => void;

let resolvedGc: GcFunction | null | undefined;

/** The V8 collector, or null when this runtime will not hand it out. Resolved once. */
export const resolveGc = (): GcFunction | null => {
  if (resolvedGc !== undefined) return resolvedGc;
  resolvedGc = null;
  try {
    const exposed = (globalThis as { gc?: unknown }).gc;
    if (typeof exposed === "function") {
      resolvedGc = exposed as GcFunction;
    } else {
      v8.setFlagsFromString("--expose-gc");
      const fromContext = vm.runInNewContext("gc") as unknown;
      if (typeof fromContext === "function") {
        resolvedGc = fromContext as GcFunction;
      }
    }
  } catch {
    resolvedGc = null;
  }
  return resolvedGc;
};

export interface HeapGovernorOptions {
  /** Collect once the V8 heap has grown by this much since the last collection. */
  heapGrowthBudgetMb?: number;
  /** ...or once resident memory has (native memory V8 cannot see grows RSS but not the heap). */
  rssGrowthBudgetMb?: number;
  /** Never collect more often than this; a full collection pauses the process. */
  minIntervalMs?: number;
  /** Test seams. */
  gc?: GcFunction | null;
  now?: () => number;
  readMemory?: () => { heapUsedMb: number; rssMb: number };
}

export interface CollectionRecord {
  reason: "heap_growth" | "rss_growth";
  pauseMs: number;
  heapBeforeMb: number;
  heapAfterMb: number;
  rssBeforeMb: number;
  rssAfterMb: number;
}

export interface HeapGovernor {
  /** Collects if the budget is spent; returns what it did, or null when it did nothing. */
  maybeCollect: () => CollectionRecord | null;
  /** True when a collector is available (false: maybeCollect never does anything). */
  readonly enabled: boolean;
  /** How many collections this governor has triggered. */
  readonly collections: number;
}

const toMb = (bytes: number): number => Math.round((bytes / 1048576) * 10) / 10;

const defaultReadMemory = () => {
  const usage = process.memoryUsage();
  return { heapUsedMb: toMb(usage.heapUsed), rssMb: toMb(usage.rss) };
};

export const createHeapGovernor = (
  options: HeapGovernorOptions = {},
): HeapGovernor => {
  const heapBudget = options.heapGrowthBudgetMb ?? 48;
  const rssBudget = options.rssGrowthBudgetMb ?? 96;
  const minInterval = options.minIntervalMs ?? 1500;
  const gc = options.gc === undefined ? resolveGc() : options.gc;
  const now = options.now ?? Date.now;
  const readMemory = options.readMemory ?? defaultReadMemory;

  let baseline = readMemory();
  let lastCollectionAt = Number.NEGATIVE_INFINITY;
  let collections = 0;

  return {
    get enabled() {
      return gc !== null;
    },
    get collections() {
      return collections;
    },
    maybeCollect: () => {
      if (!gc) return null;
      const startedAt = now();
      if (startedAt - lastCollectionAt < minInterval) return null;

      const before = readMemory();
      const heapGrew = before.heapUsedMb - baseline.heapUsedMb >= heapBudget;
      const rssGrew = before.rssMb - baseline.rssMb >= rssBudget;
      if (!heapGrew && !rssGrew) return null;

      try {
        gc();
      } catch {
        return null;
      }
      const finishedAt = now();
      const after = readMemory();
      baseline = after;
      lastCollectionAt = finishedAt;
      collections += 1;
      return {
        reason: heapGrew ? "heap_growth" : "rss_growth",
        pauseMs: finishedAt - startedAt,
        heapBeforeMb: before.heapUsedMb,
        heapAfterMb: after.heapUsedMb,
        rssBeforeMb: before.rssMb,
        rssAfterMb: after.rssMb,
      };
    },
  };
};
