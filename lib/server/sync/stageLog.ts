/**
 * One-JSON-line-per-stage memory trail for long in-process jobs (issue #699).
 *
 * The shape and the memory reader are PR #697's (lib/server/garbageRoutes/
 * stageLog.ts, written for the garbage-route sync); this is the same logger with
 * the `event` name and the repeated fields made parameters, so the RSS ingestion
 * does not copy it. health-web is SIGKILLed by the shared host without any V8
 * error when its resident memory crosses the account's cap, so the only evidence
 * of "which step was running" is whatever the process printed before it died.
 * Every stage therefore writes ONE self-contained line (console.log, i.e. straight
 * to the pm2 log file):
 *
 *   {"event":"rss_ingestion_stage","runId":812,"stage":"feed_done","feed":"cdc",
 *    "heapUsedMB":88.1,"rssMB":571.4,"externalMB":14.2,"elapsedMs":41210}
 */
import { readMemoryMb, type MemorySnapshotMb } from "@/lib/server/garbageRoutes/stageLog";

export { readMemoryMb, type MemorySnapshotMb };

export interface JsonStageLoggerOptions {
  /** The `event` field of every line, e.g. "rss_ingestion_stage". */
  event: string;
  /** Fields repeated on every line (runId, trigger, ...). */
  fields: Record<string, unknown>;
  /** Epoch ms the job started, for `elapsedMs`. */
  startedAtMs: number;
  /** Test seams; default to console.log and Date.now. */
  write?: (line: string) => void;
  now?: () => number;
  readMemory?: () => MemorySnapshotMb;
}

export type JsonStageLogger = (
  stage: string,
  detail?: Record<string, unknown>,
) => MemorySnapshotMb | null;

/**
 * Returns a logger; calling it writes a line and returns the memory snapshot it
 * recorded (null when the line could not be produced — a diagnostics line must
 * never be the reason a job fails).
 */
export const createJsonStageLogger = (
  options: JsonStageLoggerOptions,
): JsonStageLogger => {
  const write = options.write ?? ((line: string) => console.log(line));
  const now = options.now ?? Date.now;
  const readMemory = options.readMemory ?? readMemoryMb;

  return (stage, detail) => {
    try {
      const memory = readMemory();
      write(
        JSON.stringify({
          event: options.event,
          ...options.fields,
          stage,
          ...memory,
          elapsedMs: now() - options.startedAtMs,
          ...detail,
        }),
      );
      return memory;
    } catch {
      return null;
    }
  };
};
