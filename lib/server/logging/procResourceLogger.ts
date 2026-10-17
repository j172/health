/**
 * Five-minute process-resource trail for health-web (issue #709).
 *
 * Production's health-web is SIGKILLed from outside every ~15-35 minutes with no
 * V8 error, no signal handler to run and nothing in the app log. The only
 * evidence of "what did the process look like just before" is whatever it printed
 * earlier, so this prints ONE self-contained JSON line at startup and then every
 * 5 minutes (console.log, i.e. straight to the pm2 out log, same style as
 * lib/server/sync/stageLog.ts):
 *
 *   {"event":"proc_resources","ts":"2026-10-17T06:05:00.000Z","pid":4242,"uptimeS":1803,
 *    "rssMB":512.4,"heapUsedMB":141.2,"heapTotalMB":203.8,"externalMB":22.6,"arrayBuffersMB":9.1,
 *    "vmSizeMB":1731.5,"vmPeakMB":1811.2,"vmRssMB":512.4,"vmDataMB":1020.7,"threads":11,
 *    "fdCount":38,"acctRssMB":742.3,"acctProcs":6,"acctThreads":43,"loadAvg1":9.8,
 *    "eventLoopDelayP99Ms":3.2,"eventLoopDelayMaxMs":41.7,"activeJobs":["rss-sync"]}
 *
 * Grep after a kill:  grep proc_resources ~/.pm2/logs/health-web-out*.log | tail
 * The `"event":"proc_resources"` prefix is the stable handle; `ts` is there
 * because pm2 does not timestamp its out log unless asked to.
 *
 * What the fields answer: `vmPeakMB` creeping to 2048 means the account's 2 GiB
 * RLIMIT_AS address-space cap (not physical memory); `rssMB` flat while
 * `vmSizeMB` climbs points the same way; `fdCount` / `threads` growth points at a
 * leak; a large `eventLoopDelayMaxMs` right before a kill means the process was
 * already wedged; `activeJobs` says which in-process cron jobs were mid-run.
 * The `acct*` fields and `loadAvg1` are the account (CloudLinux LVE) view: all
 * processes of this uid summed (RSS, process count, thread count) and the host's
 * 1-minute load, to compare with the LVE limits when health-web AND the account's
 * other apps are killed together (see readAccountTotals).
 *
 * Safety rules, because this runs inside the production web process:
 * - every read is individually wrapped, so a missing /proc (Windows/macOS dev
 *   machines) yields `null` fields, never an exception;
 * - the interval is unref()ed so it can never keep the process alive;
 * - one timer per process, guarded on globalThis (Next can load a module more
 *   than once, e.g. hot reload);
 * - nothing runs outside production unless PROC_RESOURCE_LOG=1 (and
 *   PROC_RESOURCE_LOG=0 switches it off in production without a deploy of code);
 * - no route, no public surface.
 */
import { readFileSync, readdirSync } from "node:fs";
import { monitorEventLoopDelay } from "node:perf_hooks";

/** One line per this many ms (plus one at startup). */
export const PROC_RESOURCE_LOG_INTERVAL_MS = 5 * 60 * 1000;

/** monitorEventLoopDelay sampling period; its readings include this baseline. */
const EVENT_LOOP_RESOLUTION_MS = 20;

export const PROC_RESOURCE_EVENT = "proc_resources";

const GUARD_KEY = Symbol.for("health.procResourceLogger");

/** The /proc/self/status fields we keep. All null when the file is unreadable. */
export interface ProcStatusMb {
  vmSizeMB: number | null;
  vmPeakMB: number | null;
  vmRssMB: number | null;
  vmDataMB: number | null;
  threads: number | null;
}

const EMPTY_PROC_STATUS: ProcStatusMb = {
  vmSizeMB: null,
  vmPeakMB: null,
  vmRssMB: null,
  vmDataMB: null,
  threads: null,
};

const round1 = (value: number): number => Math.round(value * 10) / 10;
const bytesToMb = (bytes: number): number => round1(bytes / 1048576);

/**
 * Reads `Name:\t  <integer> [kB]` out of /proc/<pid>/status text. Returns the
 * number as written (kB for the Vm* lines, a bare count for Threads), or null
 * when the line is missing or not a plain non-negative integer.
 */
const readStatusInteger = (text: string, name: string): number | null => {
  const match = new RegExp(`^${name}:[ \\t]*(\\d+)(?:[ \\t]*kB)?[ \\t]*$`, "m").exec(text);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isSafeInteger(value) ? value : null;
};

/** Pure parser of the text of /proc/self/status (VmSize/VmPeak/VmRSS/VmData in kB -> MB). */
export const parseProcStatus = (text: string): ProcStatusMb => {
  if (typeof text !== "string") return { ...EMPTY_PROC_STATUS };
  const kbToMb = (kb: number | null): number | null => (kb === null ? null : round1(kb / 1024));
  return {
    vmSizeMB: kbToMb(readStatusInteger(text, "VmSize")),
    vmPeakMB: kbToMb(readStatusInteger(text, "VmPeak")),
    vmRssMB: kbToMb(readStatusInteger(text, "VmRSS")),
    vmDataMB: kbToMb(readStatusInteger(text, "VmData")),
    threads: readStatusInteger(text, "Threads"),
  };
};

/** /proc/self/status of this process, or all-null where /proc does not exist. */
export const readProcStatus = (): ProcStatusMb => {
  try {
    return parseProcStatus(readFileSync("/proc/self/status", "utf8"));
  } catch {
    return { ...EMPTY_PROC_STATUS };
  }
};

/** Open file descriptors of this process (includes the directory handle of the listing itself), or null. */
export const countOpenFds = (): number | null => {
  try {
    return readdirSync("/proc/self/fd").length;
  } catch {
    return null;
  }
};

/**
 * ACCOUNT-level view. On 2026-10-17 10:13-10:14 UTC health-web was SIGKILLed 7
 * times in 50 s while the same account's mall app was killed 5 times, so the
 * governor is the CloudLinux LVE (cgroup /lve2004) for the whole uid, not a
 * per-process cap. To line the numbers up against LVE limits the line also
 * carries what every process of OUR uid adds up to.
 *
 * acctRssMB is a sum of per-process VmRSS, so pages shared between processes are
 * counted once per process: it is an upper bound on, not equal to, what the LVE
 * charges. Trend and step changes are what matter.
 */
export interface AccountProcessStatus {
  uid: number | null;
  rssKb: number | null;
  threads: number | null;
}

export interface AccountTotals {
  acctRssMB: number | null;
  acctProcs: number | null;
  acctThreads: number | null;
}

const EMPTY_ACCOUNT_TOTALS: AccountTotals = { acctRssMB: null, acctProcs: null, acctThreads: null };

/** Pure parser of one /proc/<pid>/status: real uid (first number of the `Uid:` line), VmRSS in kB, Threads. */
export const parseAccountProcessStatus = (text: string): AccountProcessStatus => {
  if (typeof text !== "string") return { uid: null, rssKb: null, threads: null };
  const uidMatch = /^Uid:[ \t]*(\d+)/m.exec(text);
  const uid = uidMatch ? Number(uidMatch[1]) : null;
  return {
    uid: uid !== null && Number.isSafeInteger(uid) ? uid : null,
    rssKb: readStatusInteger(text, "VmRSS"),
    threads: readStatusInteger(text, "Threads"),
  };
};

/**
 * Pure aggregation over parsed statuses: only processes whose uid is `uid` count.
 * A process with no VmRSS line (zombie, kernel thread) adds 0 to the RSS but is
 * still a process; one with no Threads line adds no threads.
 */
export const summarizeAccountProcesses = (
  statuses: readonly AccountProcessStatus[],
  uid: number | null,
): AccountTotals => {
  if (uid === null) return { ...EMPTY_ACCOUNT_TOTALS };
  let rssKb = 0;
  let procs = 0;
  let threads = 0;
  for (const status of statuses) {
    if (status.uid !== uid) continue;
    procs += 1;
    rssKb += status.rssKb ?? 0;
    threads += status.threads ?? 0;
  }
  return { acctRssMB: round1(rssKb / 1024), acctProcs: procs, acctThreads: threads };
};

/** Pure parser of /proc/loadavg: its first value (the 1-minute load average), or null. */
export const parseLoadAvg1 = (text: string): number | null => {
  if (typeof text !== "string") return null;
  const match = /^\s*(\d+(?:\.\d+)?)\s/.exec(text);
  return match ? Number(match[1]) : null;
};

/** The file-system access of the /proc walkers; a test seam (the real one is node:fs). */
export interface ProcIo {
  readText: (path: string) => string;
  listDir: (path: string) => string[];
}

const realProcIo: ProcIo = {
  readText: (path) => readFileSync(path, "utf8"),
  listDir: (path) => readdirSync(path),
};

/** Upper bound on /proc entries inspected per sample, so a freak host cannot make the walk long. */
const MAX_PROC_ENTRIES = 2000;

/**
 * Walks /proc/<pid>/status for every process of this process's own uid. Each
 * process is read on its own try/catch (they exit mid-walk all the time); any
 * failure of the walk as a whole, or no /proc at all, gives all-null totals.
 */
export const readAccountTotals = (io: ProcIo = realProcIo): AccountTotals => {
  try {
    const own = parseAccountProcessStatus(io.readText("/proc/self/status"));
    if (own.uid === null) return { ...EMPTY_ACCOUNT_TOTALS };

    const statuses: AccountProcessStatus[] = [];
    for (const entry of io.listDir("/proc").slice(0, MAX_PROC_ENTRIES)) {
      if (!/^\d+$/.test(entry)) continue;
      try {
        statuses.push(parseAccountProcessStatus(io.readText(`/proc/${entry}/status`)));
      } catch {
        // The process exited between listing and reading, or hides itself.
      }
    }
    return summarizeAccountProcesses(statuses, own.uid);
  } catch {
    return { ...EMPTY_ACCOUNT_TOTALS };
  }
};

/** 1-minute load average from /proc/loadavg, or null where it does not exist. */
export const readLoadAvg1 = (io: ProcIo = realProcIo): number | null => {
  try {
    return parseLoadAvg1(io.readText("/proc/loadavg"));
  } catch {
    return null;
  }
};

/** The slice of perf_hooks' IntervalHistogram we use; also the test seam. */
export interface EventLoopDelayMonitor {
  enable(): unknown;
  disable(): unknown;
  reset(): void;
  readonly count?: number;
  /** Nanoseconds. */
  readonly max: number;
  percentile(percentile: number): number;
}

export interface EventLoopDelayReading {
  p99Ms: number | null;
  maxMs: number | null;
}

/**
 * Reads then resets the histogram. Node's values are timer lateness PLUS the
 * sampling resolution, so the resolution is subtracted; an interval with no
 * samples (the startup line) yields nulls rather than the histogram's sentinel
 * values.
 */
export const readEventLoopDelay = (
  monitor: EventLoopDelayMonitor | null,
  resolutionMs: number = EVENT_LOOP_RESOLUTION_MS,
): EventLoopDelayReading => {
  const empty: EventLoopDelayReading = { p99Ms: null, maxMs: null };
  if (!monitor) return empty;
  try {
    const hasSamples = typeof monitor.count === "number" ? monitor.count > 0 : monitor.max > 0;
    if (!hasSamples) return empty;
    const toMs = (ns: number): number | null =>
      Number.isFinite(ns) ? round1(Math.max(0, ns / 1e6 - resolutionMs)) : null;
    return { p99Ms: toMs(monitor.percentile(99)), maxMs: toMs(monitor.max) };
  } catch {
    return empty;
  } finally {
    try {
      monitor.reset();
    } catch {
      // ignore
    }
  }
};

export interface ProcResourceSampleDeps {
  now?: () => number;
  uptimeSeconds?: () => number;
  pid?: number;
  memoryUsage?: () => NodeJS.MemoryUsage;
  readProcStatus?: () => ProcStatusMb;
  countOpenFds?: () => number | null;
  readAccountTotals?: () => AccountTotals;
  readLoadAvg1?: () => number | null;
  delayMonitor?: EventLoopDelayMonitor | null;
  extraFields?: () => Record<string, unknown> | undefined;
}

/** Runs `read`, returning null if it throws: one broken field must not cost the line. */
const orNull = <T>(read: () => T): T | null => {
  try {
    return read();
  } catch {
    return null;
  }
};

/**
 * Builds the object for one line. Never throws; every field that could not be
 * read is null. Key order is the line's field order (`event` first, so every line
 * starts with `{"event":"proc_resources",`).
 */
export const buildProcResourceSample = (deps: ProcResourceSampleDeps = {}): Record<string, unknown> => {
  const memory = orNull(deps.memoryUsage ?? (() => process.memoryUsage()));
  const status = orNull(deps.readProcStatus ?? readProcStatus) ?? EMPTY_PROC_STATUS;
  const account = orNull(deps.readAccountTotals ?? (() => readAccountTotals())) ?? EMPTY_ACCOUNT_TOTALS;
  const loop = readEventLoopDelay(deps.delayMonitor ?? null);
  const extra = orNull(deps.extraFields ?? (() => undefined));

  const sample: Record<string, unknown> = {
    event: PROC_RESOURCE_EVENT,
    ts: orNull(() => new Date((deps.now ?? Date.now)()).toISOString()),
    pid: deps.pid ?? orNull(() => process.pid),
    uptimeS: orNull(() => Math.round((deps.uptimeSeconds ?? (() => process.uptime()))())),
    rssMB: memory ? bytesToMb(memory.rss) : null,
    heapUsedMB: memory ? bytesToMb(memory.heapUsed) : null,
    heapTotalMB: memory ? bytesToMb(memory.heapTotal) : null,
    externalMB: memory ? bytesToMb(memory.external) : null,
    arrayBuffersMB: memory ? bytesToMb(memory.arrayBuffers ?? 0) : null,
    vmSizeMB: status.vmSizeMB,
    vmPeakMB: status.vmPeakMB,
    vmRssMB: status.vmRssMB,
    vmDataMB: status.vmDataMB,
    threads: status.threads,
    fdCount: orNull(deps.countOpenFds ?? countOpenFds),
    acctRssMB: account.acctRssMB,
    acctProcs: account.acctProcs,
    acctThreads: account.acctThreads,
    loadAvg1: orNull(deps.readLoadAvg1 ?? (() => readLoadAvg1())),
    eventLoopDelayP99Ms: loop.p99Ms,
    eventLoopDelayMaxMs: loop.maxMs,
  };
  // Caller-supplied fields (e.g. activeJobs) go last and can never replace a standard one.
  if (extra && typeof extra === "object") {
    for (const [key, value] of Object.entries(extra)) {
      if (!Object.hasOwn(sample, key)) sample[key] = value;
    }
  }
  return sample;
};

/**
 * PROC_RESOURCE_LOG=1|true|on forces it on (local experiments), 0|false|off forces
 * it off; otherwise it runs exactly when NODE_ENV is "production".
 */
export const isProcResourceLoggerEnabled = (
  env: Record<string, string | undefined> = process.env,
): boolean => {
  const flag = env.PROC_RESOURCE_LOG?.trim().toLowerCase();
  if (flag === "0" || flag === "false" || flag === "off") return false;
  if (flag === "1" || flag === "true" || flag === "on") return true;
  return env.NODE_ENV === "production";
};

export interface ProcResourceLoggerOptions extends ProcResourceSampleDeps {
  env?: Record<string, string | undefined>;
  intervalMs?: number;
  /** Test seams; default to console.log / the real timers / a real histogram. */
  write?: (line: string) => void;
  setIntervalFn?: (callback: () => void, ms: number) => TimerLike;
  clearIntervalFn?: (timer: TimerLike) => void;
  createDelayMonitor?: () => EventLoopDelayMonitor | null;
}

export interface TimerLike {
  unref?: () => unknown;
}

export interface ProcResourceLoggerHandle {
  timer: TimerLike;
  /** Stops the interval and the histogram and re-arms the single-timer guard. Mainly for tests. */
  stop: () => void;
}

const createRealDelayMonitor = (): EventLoopDelayMonitor | null => {
  try {
    return monitorEventLoopDelay({ resolution: EVENT_LOOP_RESOLUTION_MS }) as unknown as EventLoopDelayMonitor;
  } catch {
    return null;
  }
};

type GuardSlot = { [GUARD_KEY]?: ProcResourceLoggerHandle };

/**
 * Starts the logger: one immediate line, then one every 5 minutes. Returns the
 * handle, or null when it is disabled or a logger is already running in this
 * process (the guard lives on globalThis, so a second copy of this module, e.g.
 * after a hot reload, sees it). Never throws.
 */
export const startProcResourceLogger = (
  options: ProcResourceLoggerOptions = {},
): ProcResourceLoggerHandle | null => {
  try {
    if (!isProcResourceLoggerEnabled(options.env)) return null;
    const slot = globalThis as unknown as GuardSlot;
    if (slot[GUARD_KEY]) return null;

    const write = options.write ?? ((line: string) => console.log(line));
    const setIntervalFn =
      options.setIntervalFn ?? ((callback: () => void, ms: number): TimerLike => setInterval(callback, ms));
    const clearIntervalFn =
      options.clearIntervalFn ?? ((timer: TimerLike) => clearInterval(timer as ReturnType<typeof setInterval>));
    const delayMonitor = (options.createDelayMonitor ?? createRealDelayMonitor)();
    orNull(() => delayMonitor?.enable());

    const emit = (): void => {
      try {
        write(JSON.stringify(buildProcResourceSample({ ...options, delayMonitor })));
      } catch {
        // A diagnostics line must never be the reason the web process fails.
      }
    };

    const timer = setIntervalFn(emit, options.intervalMs ?? PROC_RESOURCE_LOG_INTERVAL_MS);
    orNull(() => timer.unref?.());

    const handle: ProcResourceLoggerHandle = {
      timer,
      stop: () => {
        orNull(() => clearIntervalFn(timer));
        orNull(() => delayMonitor?.disable());
        if (slot[GUARD_KEY] === handle) delete slot[GUARD_KEY];
      },
    };
    slot[GUARD_KEY] = handle;

    emit();
    return handle;
  } catch {
    return null;
  }
};

/** Stops the process-wide logger if one is running (tests; also lets a caller opt out later). */
export const stopProcResourceLogger = (): void => {
  try {
    (globalThis as unknown as GuardSlot)[GUARD_KEY]?.stop();
  } catch {
    // ignore
  }
};
