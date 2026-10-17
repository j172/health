/**
 * What an RSS ingestion run does between two units of work (issue #699).
 *
 * A full run walks ~50 feeds and ~50 scraped sources one after another for ten
 * minutes inside the same process that serves the site, so the gaps between
 * units are where it can be a good neighbour — and where it has to prove it is
 * still entitled to run. Each gap does, in order:
 *
 *   1. heartbeat  — the MySQL advisory lock that keeps a second ingestion out is
 *                   tied to one connection that sits idle for the whole run; if
 *                   the server drops that connection (wait_timeout, a restart)
 *                   the lock vanishes silently and the next trigger would start a
 *                   SECOND run on top of this one. IS_USED_LOCK tells us, and the
 *                   same round trip keeps the connection from being idle. The run
 *                   row's updated_at moves too, so a slow-but-alive run is never
 *                   reaped as "Abandoned" by the next sync that starts.
 *   2. collect    — release the dead heap (cheerio documents, parsed XML, HTTP
 *                   bodies) and the native memory behind it once the budget is
 *                   spent; see heapGovernor.ts.
 *   3. log        — ONE JSON line with the heap/RSS at that moment, so the last
 *                   line before a SIGKILL names the step that was running.
 *   4. yield      — hand the event loop back so requests, timers and the PM2
 *                   health probe are served between units.
 */
import type { PoolConnection } from "mysql2/promise";
import { touchIngestionRun } from "@/lib/server/logging/ingestionLogger";
import { createHeapGovernor, type HeapGovernor } from "@/lib/server/sync/heapGovernor";
import { createJsonStageLogger, type JsonStageLogger } from "@/lib/server/sync/stageLog";
import { yieldToEventLoop } from "@/lib/server/sync/yieldToEventLoop";

export const RSS_INGESTION_STAGE_EVENT = "rss_ingestion_stage";

export type IngestionStage =
  | "run_start"
  | "feed_done"
  | "source_done"
  | "gc_collected"
  | "run_end"
  | "run_failed";

export class AdvisoryLockLostError extends Error {
  constructor(lockName: string) {
    super(
      `Advisory lock ${lockName} is no longer held by this run's connection; stopping so a second ingestion does not overlap it.`,
    );
    this.name = "AdvisoryLockLostError";
  }
}

export interface RunMonitor {
  /** Writes one stage line (no heartbeat, no collection, no yield). */
  log: (stage: IngestionStage, detail?: Record<string, unknown>) => void;
  /** Between two units of work: heartbeat, collect, log, yield. Throws AdvisoryLockLostError if the lock is gone. */
  checkpoint: (stage: IngestionStage, detail?: Record<string, unknown>) => Promise<void>;
  /** Between two items of one unit: collect if the budget is spent, then yield. */
  tick: () => Promise<void>;
  readonly governor: HeapGovernor;
}

export interface RunMonitorOptions {
  runId: number;
  trigger: string;
  startedAtMs: number;
  /**
   * Confirms the lock is still this run's and marks the run alive. Defaults to
   * the real one (IS_USED_LOCK on `lockConn` + touchIngestionRun).
   */
  heartbeat?: () => Promise<void>;
  lockName?: string;
  lockConn?: Pick<PoolConnection, "query">;
  /** Test seams. */
  governor?: HeapGovernor;
  logger?: JsonStageLogger;
  yieldFn?: () => Promise<void>;
}

const realHeartbeat =
  (runId: number, lockName: string, lockConn: Pick<PoolConnection, "query">) =>
  async (): Promise<void> => {
    let held = false;
    try {
      const [rows] = (await lockConn.query(
        "SELECT IS_USED_LOCK(?) = CONNECTION_ID() AS held",
        [lockName],
      )) as unknown as [Array<{ held: number | null }>, unknown];
      held = rows?.[0]?.held === 1;
    } catch {
      // A dead connection cannot be holding anything.
      held = false;
    }
    if (!held) throw new AdvisoryLockLostError(lockName);
    // Best effort: failing to mark the row alive must not fail the run.
    await touchIngestionRun(runId).catch(() => undefined);
  };

export const createRunMonitor = (options: RunMonitorOptions): RunMonitor => {
  const governor = options.governor ?? createHeapGovernor();
  const logger =
    options.logger ??
    createJsonStageLogger({
      event: RSS_INGESTION_STAGE_EVENT,
      fields: { runId: options.runId, trigger: options.trigger },
      startedAtMs: options.startedAtMs,
    });
  const heartbeat =
    options.heartbeat ??
    (options.lockConn && options.lockName
      ? realHeartbeat(options.runId, options.lockName, options.lockConn)
      : async () => undefined);
  const yieldFn = options.yieldFn ?? yieldToEventLoop;

  const collectAndLog = (): void => {
    const collection = governor.maybeCollect();
    if (collection) {
      logger("gc_collected", {
        reason: collection.reason,
        pauseMs: collection.pauseMs,
        heapBeforeMB: collection.heapBeforeMb,
        heapAfterMB: collection.heapAfterMb,
        rssBeforeMB: collection.rssBeforeMb,
        rssAfterMB: collection.rssAfterMb,
      });
    }
  };

  return {
    governor,
    log: (stage, detail) => {
      logger(stage, detail);
    },
    checkpoint: async (stage, detail) => {
      await heartbeat();
      collectAndLog();
      logger(stage, detail);
      await yieldFn();
    },
    tick: async () => {
      collectAndLog();
      await yieldFn();
    },
  };
};
