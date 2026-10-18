/**
 * Process-resource trail for health-web (issue #709).
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
 *    "eventLoopDelayP99Ms":3.2,"eventLoopDelayMaxMs":41.7,"activeJobs":["rss-sync"],
 *    "acctRssPeakMB":931.4,"acctRssPeakAt":"2026-10-17T06:02:45.123Z","ownRssPeakMB":601.2,
 *    "ownHwmMB":645.1,"peakProcs":[{"pid":4242,"label":"health-web","rssMB":601.2,"hwmMB":645.1},...],
 *    "procs":[{"pid":4242,"label":"health-web","rssMB":512.4,"hwmMB":645.1},...]}
 *
 * Grep after a kill:  grep '"event":"proc_resources"' ~/.pm2/logs/health-web-out*.log | tail
 * (`grep proc_resources` alone ALSO matches the spike lines below, which have no
 * rssMB / heap fields; the quoted `"event":"proc_resources"` form does not.)
 * `ts` is there because pm2 does not timestamp its out log unless asked to.
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
 * WHO caused a spike (2026-10-18, still #709). The account's physical-memory (PMEM)
 * limit is only 1 GB and an hour averages 580-730 MB, so the kills come from short
 * peaks a 5-minute snapshot cannot see. The NEW fields, always appended after every
 * pre-existing field (names and order of the old ones never change):
 * - `acctRssPeakMB` / `acctRssPeakAt`: highest account RSS sum seen by a cheap
 *   15-second sampler since the previous proc_resources line, and when;
 * - `ownRssPeakMB`: highest RSS of this process in the same window; `ownHwmMB`:
 *   this process's VmHWM (its RSS high-water mark since it started);
 * - `peakProcs`: the per-process breakdown AT the account peak (what the peak was
 *   made of); `procs`: the breakdown at this line's own sample. Each entry is
 *   `{pid,label,rssMB,hwmMB}`, top 6 by RSS. `label` is one of health-web, mall,
 *   pm2-daemon, pm2-module, pm2-cli, lsphp, deploy, or the process's `comm`
 *   (see classifyProcess);
 * - all of them are null / [] where /proc does not exist.
 *
 * And a line of its own the moment the account RSS sum is >= 800 MB (override with
 * PROC_RESOURCE_SPIKE_MB), at most one per 60 s per process:
 *
 *   {"event":"proc_resources_spike","ts":"...","acctRssMB":871.3,"ownRssMB":602.5,
 *    "procs":[{"pid":4242,"label":"health-web","rssMB":602.5,"hwmMB":645.1},...],
 *    "activeJobs":["rss-sync"],"eventLoopDelayMaxMs":41.7}
 *
 *   grep proc_resources_spike ~/.pm2/logs/health-web-out*.log | tail
 *
 * (`eventLoopDelayMaxMs` there is the max since the previous proc_resources line,
 * read without resetting the histogram that line owns.)
 *
 * Line size: the 5-minute line is ~1.4 KB with 6+6 breakdown entries and is cut
 * down (breakdown arrays first) rather than ever exceeding 2000 characters.
 *
 * Safety rules, because this runs inside the production web process:
 * - every read is individually wrapped, so a missing /proc (Windows/macOS dev
 *   machines) yields `null` fields, never an exception;
 * - both intervals (5 minutes, 15 seconds) are unref()ed so they can never keep
 *   the process alive;
 * - one logger per process, guarded on globalThis (Next can load a module more
 *   than once, e.g. hot reload);
 * - nothing runs outside production unless PROC_RESOURCE_LOG=1 (and
 *   PROC_RESOURCE_LOG=0 switches it off in production without a deploy of code);
 * - the 15-second sampler reads only the small /proc/<pid>/status files; cmdline
 *   and cwd are read only for the top few processes, only when a new account peak
 *   is set, a spike line is written, or a 5-minute line is built;
 * - no route, no public surface.
 */
import { readFileSync, readdirSync, readlinkSync } from "node:fs";
import { monitorEventLoopDelay } from "node:perf_hooks";

/** One line per this many ms (plus one at startup). */
export const PROC_RESOURCE_LOG_INTERVAL_MS = 5 * 60 * 1000;

/** The cheap account-RSS sampler that catches peaks between two proc_resources lines. */
export const PROC_RESOURCE_FAST_INTERVAL_MS = 15 * 1000;

/** monitorEventLoopDelay sampling period; its readings include this baseline. */
const EVENT_LOOP_RESOLUTION_MS = 20;

export const PROC_RESOURCE_EVENT = "proc_resources";
export const PROC_RESOURCE_SPIKE_EVENT = "proc_resources_spike";

/** Account RSS sum (MB) at or above which a proc_resources_spike line is written. */
export const DEFAULT_SPIKE_THRESHOLD_MB = 800;

/** At most one spike line per this many ms. */
export const SPIKE_MIN_GAP_MS = 60 * 1000;

/** Per-process breakdown entries kept per line. */
export const PROC_BREAKDOWN_LIMIT = 6;

/** A log line is cut down (breakdown arrays first) rather than ever growing past this many characters. */
export const PROC_RESOURCE_LINE_MAX_CHARS = 2000;

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
const kbToMbOrNull = (kb: number | null): number | null => (kb === null ? null : round1(kb / 1024));

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
  return {
    vmSizeMB: kbToMbOrNull(readStatusInteger(text, "VmSize")),
    vmPeakMB: kbToMbOrNull(readStatusInteger(text, "VmPeak")),
    vmRssMB: kbToMbOrNull(readStatusInteger(text, "VmRSS")),
    vmDataMB: kbToMbOrNull(readStatusInteger(text, "VmData")),
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
  /** readlink(2); only the per-process labelling (/proc/<pid>/cwd) needs it. */
  readLink?: (path: string) => string;
}

const realProcIo: ProcIo = {
  readText: (path) => readFileSync(path, "utf8"),
  listDir: (path) => readdirSync(path),
  readLink: (path) => readlinkSync(path),
};

/** Upper bound on /proc entries inspected per sample, so a freak host cannot make the walk long. */
const MAX_PROC_ENTRIES = 2000;

/** One process of our uid, as far as /proc/<pid>/status tells (everything but pid may be null). */
export interface ProcessRecord extends AccountProcessStatus {
  pid: number;
  /** The `Name:` line (comm, at most 15 characters). */
  name: string | null;
  /** VmHWM: this process's own RSS high-water mark. */
  hwmKb: number | null;
}

/** Every process of this process's own uid, from ONE walk of /proc. */
export interface AccountScan {
  uid: number;
  processes: ProcessRecord[];
}

/** Pure parser of one /proc/<pid>/status for the breakdown: uid, comm, VmRSS, VmHWM and Threads. */
export const parseProcessDetail = (text: string): Omit<ProcessRecord, "pid"> => {
  const base = parseAccountProcessStatus(text);
  if (typeof text !== "string") return { ...base, name: null, hwmKb: null };
  const nameMatch = /^Name:[ \t]*(.*)$/m.exec(text);
  const name = nameMatch ? nameMatch[1].trim() : "";
  return { ...base, name: name === "" ? null : name, hwmKb: readStatusInteger(text, "VmHWM") };
};

/**
 * Walks /proc/<pid>/status once and keeps the processes of this process's own
 * uid. Each process is read on its own try/catch (they exit mid-walk all the
 * time); any failure of the walk as a whole, or no /proc at all, gives null.
 */
export const scanAccountProcesses = (io: ProcIo = realProcIo): AccountScan | null => {
  try {
    const own = parseAccountProcessStatus(io.readText("/proc/self/status"));
    if (own.uid === null) return null;

    const processes: ProcessRecord[] = [];
    for (const entry of io.listDir("/proc").slice(0, MAX_PROC_ENTRIES)) {
      if (!/^\d+$/.test(entry)) continue;
      try {
        const detail = parseProcessDetail(io.readText(`/proc/${entry}/status`));
        if (detail.uid === own.uid) processes.push({ pid: Number(entry), ...detail });
      } catch {
        // The process exited between listing and reading, or hides itself.
      }
    }
    return { uid: own.uid, processes };
  } catch {
    return null;
  }
};

/** Account totals of a scan (all-null when there is none). */
export const totalsOfScan = (scan: AccountScan | null): AccountTotals =>
  scan ? summarizeAccountProcesses(scan.processes, scan.uid) : { ...EMPTY_ACCOUNT_TOTALS };

/**
 * Walks /proc/<pid>/status for every process of this process's own uid. Each
 * process is read on its own try/catch (they exit mid-walk all the time); any
 * failure of the walk as a whole, or no /proc at all, gives all-null totals.
 */
export const readAccountTotals = (io: ProcIo = realProcIo): AccountTotals => totalsOfScan(scanAccountProcesses(io));

/** 1-minute load average from /proc/loadavg, or null where it does not exist. */
export const readLoadAvg1 = (io: ProcIo = realProcIo): number | null => {
  try {
    return parseLoadAvg1(io.readText("/proc/loadavg"));
  } catch {
    return null;
  }
};

// --- who is using the memory: labels and the per-process breakdown ------------

/** What identifies a process beyond its status: /proc/<pid>/cmdline (NUL-separated) and /proc/<pid>/cwd. */
export interface ProcIdentity {
  cmdline: string | null;
  cwd: string | null;
}

export interface ProcessLabelInput {
  /** comm, the `Name:` line of /proc/<pid>/status. */
  name: string | null;
  cmdline: string | null;
  cwd: string | null;
}

const CMDLINE_MAX_CHARS = 400;
const MAX_LABEL_CHARS = 16;

const normalizeCmdline = (cmdline: string | null): string =>
  typeof cmdline === "string" ? cmdline.slice(0, CMDLINE_MAX_CHARS).replace(/\0+/g, " ").trim() : "";

/**
 * Pure classifier behind the `label` of every breakdown entry. Order matters, and
 * the cwd rules come last on purpose: the PM2 God Daemon, a pm2 module, a deploy
 * shell and lsphp can all have the app directory as their cwd, so identity by
 * command wins over identity by directory.
 *
 *   pm2-module  cmdline under `.pm2/modules` (pm2-logrotate)
 *   pm2-daemon  cmdline or comm has `PM2` / `God Daemon`
 *   pm2-cli     a `pm2 ...` command (watchdog's `pm2 jlist`, a human's shell)
 *   deploy      tar / gzip, or an sh/bash -lc ... health_app, or apply-prebuilt
 *   lsphp       LiteSpeed PHP
 *   health-web  cwd contains `health_app`
 *   mall        cwd contains `mall_app`
 *   otherwise   `comm` (first word, at most 16 characters), or "unknown"
 */
export const classifyProcess = (input: ProcessLabelInput): string => {
  const comm = typeof input.name === "string" ? input.name.trim() : "";
  const cmd = normalizeCmdline(input.cmdline);
  const cwd = typeof input.cwd === "string" ? input.cwd : "";

  if (/\.pm2\/modules|pm2-logrotate/.test(cmd) || /^pm2-logrotate/.test(comm)) return "pm2-module";
  if (/God Daemon|\bPM2\b/.test(cmd) || /God Daemon|\bPM2\b/.test(comm)) return "pm2-daemon";
  if (/(?:^|[\s/])pm2(?:\s|$)/.test(cmd)) return "pm2-cli";
  if (/^(?:tar|gzip|gunzip|zcat|unzip)$/.test(comm)) return "deploy";
  if (/^(?:sh|bash|dash)$/.test(comm) && cmd.includes("health_app")) return "deploy";
  if (cmd.includes("apply-prebuilt")) return "deploy";
  if (/^lsphp/.test(comm) || /(?:^|[\s/])lsphp/.test(cmd)) return "lsphp";
  if (cwd.includes("health_app")) return "health-web";
  if (cwd.includes("mall_app")) return "mall";

  const label = comm.replace(/\s*\(.*$/, "").split(/\s+/)[0].slice(0, MAX_LABEL_CHARS);
  return label === "" ? "unknown" : label;
};

/** One row of a breakdown: who, and how much. */
export interface ProcBreakdownEntry {
  pid: number;
  label: string;
  rssMB: number | null;
  hwmMB: number | null;
}

/** Reads the identity of one process; may throw (the process may be gone). */
export type ProcIdentityReader = (pid: number) => ProcIdentity;

/** cmdline and cwd of a process; each one null when unreadable (gone, or not ours to read). */
export const readProcIdentity = (pid: number, io: ProcIo = realProcIo): ProcIdentity => {
  const attempt = (read: () => string | undefined): string | null => {
    try {
      return read() ?? null;
    } catch {
      return null;
    }
  };
  return {
    cmdline: attempt(() => io.readText(`/proc/${pid}/cmdline`)),
    cwd: attempt(() => io.readLink?.(`/proc/${pid}/cwd`)),
  };
};

/**
 * The top `limit` processes by RSS, each labelled. cmdline / cwd are read only
 * for those few; a process whose identity cannot be read is labelled by comm.
 * Processes with no VmRSS line (zombies) are left out: they hold no memory.
 */
export const buildProcBreakdown = (
  records: readonly ProcessRecord[],
  readIdentity: ProcIdentityReader,
  limit: number = PROC_BREAKDOWN_LIMIT,
): ProcBreakdownEntry[] =>
  records
    .filter((record) => record.rssKb !== null)
    .sort((a, b) => (b.rssKb ?? 0) - (a.rssKb ?? 0))
    .slice(0, limit)
    .map((record) => {
      let identity: ProcIdentity = { cmdline: null, cwd: null };
      try {
        identity = readIdentity(record.pid);
      } catch {
        // gone, or hidden: fall back to the comm label.
      }
      return {
        pid: record.pid,
        label: classifyProcess({ name: record.name, cmdline: identity.cmdline, cwd: identity.cwd }),
        rssMB: kbToMbOrNull(record.rssKb),
        hwmMB: kbToMbOrNull(record.hwmKb),
      };
    });

// --- peaks between two lines ---------------------------------------------------

/** What the fast sampler saw since the previous proc_resources line. */
export interface PeakWindow {
  acctRssPeakMB: number | null;
  acctRssPeakAt: string | null;
  ownRssPeakMB: number | null;
  /** The breakdown at the moment of the account peak. */
  peakProcs: ProcBreakdownEntry[];
}

export interface PeakObservation {
  atMs: number;
  acctRssKb: number | null;
  ownRssKb: number | null;
  /** Called only when this observation sets a new account peak (it reads cmdline / cwd). */
  breakdown: () => ProcBreakdownEntry[];
}

export interface PeakTracker {
  /** Folds one sample in; true when it set a new account RSS high for the current window. */
  observe: (observation: PeakObservation) => boolean;
  /** Returns the current window and starts a fresh one. */
  take: () => PeakWindow;
}

const emptyPeakWindow = (): PeakWindow => ({
  acctRssPeakMB: null,
  acctRssPeakAt: null,
  ownRssPeakMB: null,
  peakProcs: [],
});

export const createPeakTracker = (): PeakTracker => {
  let acctPeakKb: number | null = null;
  let acctPeakAtMs: number | null = null;
  let ownPeakKb: number | null = null;
  let peakProcs: ProcBreakdownEntry[] = [];

  return {
    observe: ({ atMs, acctRssKb, ownRssKb, breakdown }) => {
      if (ownRssKb !== null && (ownPeakKb === null || ownRssKb > ownPeakKb)) ownPeakKb = ownRssKb;
      if (acctRssKb === null || (acctPeakKb !== null && acctRssKb <= acctPeakKb)) return false;
      acctPeakKb = acctRssKb;
      acctPeakAtMs = atMs;
      try {
        peakProcs = breakdown();
      } catch {
        peakProcs = [];
      }
      return true;
    },
    take: () => {
      let acctRssPeakAt: string | null = null;
      try {
        acctRssPeakAt = acctPeakAtMs === null ? null : new Date(acctPeakAtMs).toISOString();
      } catch {
        // a nonsense clock must not cost the line
      }
      const window: PeakWindow = {
        acctRssPeakMB: kbToMbOrNull(acctPeakKb),
        acctRssPeakAt,
        ownRssPeakMB: kbToMbOrNull(ownPeakKb),
        peakProcs,
      };
      acctPeakKb = null;
      acctPeakAtMs = null;
      ownPeakKb = null;
      peakProcs = [];
      return window;
    },
  };
};

/** Raw sum of VmRSS (kB) over a scan, and the VmRSS of one pid inside it. */
const sumRssKb = (scan: AccountScan): number => scan.processes.reduce((sum, p) => sum + (p.rssKb ?? 0), 0);
const findProcess = (scan: AccountScan | null, pid: number | null | undefined): ProcessRecord | null =>
  scan && typeof pid === "number" ? (scan.processes.find((p) => p.pid === pid) ?? null) : null;

/**
 * PROC_RESOURCE_SPIKE_MB as a positive number of MB; anything else (unset,
 * empty, zero, negative, NaN) is the default 800.
 */
export const resolveSpikeThresholdMb = (env: Record<string, string | undefined> = process.env): number => {
  const raw = env.PROC_RESOURCE_SPIKE_MB?.trim();
  if (!raw) return DEFAULT_SPIKE_THRESHOLD_MB;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_SPIKE_THRESHOLD_MB;
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

/**
 * Worst event-loop delay since the histogram was last reset, WITHOUT resetting
 * it (the five-minute line owns the reset). Null when there are no samples.
 */
export const peekEventLoopDelayMaxMs = (
  monitor: EventLoopDelayMonitor | null,
  resolutionMs: number = EVENT_LOOP_RESOLUTION_MS,
): number | null => {
  if (!monitor) return null;
  try {
    const hasSamples = typeof monitor.count === "number" ? monitor.count > 0 : monitor.max > 0;
    if (!hasSamples || !Number.isFinite(monitor.max)) return null;
    return round1(Math.max(0, monitor.max / 1e6 - resolutionMs));
  } catch {
    return null;
  }
};

export interface ProcResourceSampleDeps {
  now?: () => number;
  uptimeSeconds?: () => number;
  pid?: number;
  memoryUsage?: () => NodeJS.MemoryUsage;
  readProcStatus?: () => ProcStatusMb;
  countOpenFds?: () => number | null;
  /** Overrides the account totals; by default they come out of the same single /proc walk as the breakdown. */
  readAccountTotals?: () => AccountTotals;
  readLoadAvg1?: () => number | null;
  delayMonitor?: EventLoopDelayMonitor | null;
  extraFields?: () => Record<string, unknown> | undefined;
  /** The one /proc walk behind acct*, procs and ownHwmMB. */
  scanProcesses?: () => AccountScan | null;
  /** cmdline / cwd of one pid, for the breakdown labels. */
  readIdentity?: ProcIdentityReader;
  /** Source of acctRssPeak* / ownRssPeakMB / peakProcs; its window is consumed (reset) by the line. */
  peakTracker?: PeakTracker | null;
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
 * read is null (or [] for the two breakdown arrays). Key order is the line's
 * field order (`event` first, so every line starts with
 * `{"event":"proc_resources",`): the pre-existing fields, then caller-supplied
 * ones (activeJobs), then the peak / breakdown fields added for #709.
 */
export const buildProcResourceSample = (deps: ProcResourceSampleDeps = {}): Record<string, unknown> => {
  const memory = orNull(deps.memoryUsage ?? (() => process.memoryUsage()));
  const status = orNull(deps.readProcStatus ?? readProcStatus) ?? EMPTY_PROC_STATUS;
  const scan = orNull(deps.scanProcesses ?? (() => scanAccountProcesses()));
  const account =
    (deps.readAccountTotals ? orNull(deps.readAccountTotals) : totalsOfScan(scan)) ?? EMPTY_ACCOUNT_TOTALS;
  const loop = readEventLoopDelay(deps.delayMonitor ?? null);
  const extra = orNull(deps.extraFields ?? (() => undefined));
  const ownPid = deps.pid ?? orNull(() => process.pid);
  const readIdentity = deps.readIdentity ?? ((pid: number) => readProcIdentity(pid));

  const sample: Record<string, unknown> = {
    event: PROC_RESOURCE_EVENT,
    ts: orNull(() => new Date((deps.now ?? Date.now)()).toISOString()),
    pid: ownPid,
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

  // The #709 peak / breakdown fields. They are appended AFTER the caller-supplied
  // ones so no pre-existing field ever moves.
  const peaks = (deps.peakTracker ? orNull(() => deps.peakTracker!.take()) : null) ?? emptyPeakWindow();
  const own = findProcess(scan, ownPid);
  const added: Record<string, unknown> = {
    acctRssPeakMB: peaks.acctRssPeakMB,
    acctRssPeakAt: peaks.acctRssPeakAt,
    ownRssPeakMB: peaks.ownRssPeakMB,
    ownHwmMB: kbToMbOrNull(own?.hwmKb ?? null),
    peakProcs: peaks.peakProcs,
    procs: scan ? (orNull(() => buildProcBreakdown(scan.processes, readIdentity)) ?? []) : [],
  };

  // Caller-supplied fields (e.g. activeJobs) can never replace a standard or a new one.
  if (extra && typeof extra === "object") {
    for (const [key, value] of Object.entries(extra)) {
      if (!Object.hasOwn(sample, key) && !Object.hasOwn(added, key)) sample[key] = value;
    }
  }
  return Object.assign(sample, added);
};

export interface SpikeSampleInput {
  nowMs: number;
  scan: AccountScan;
  ownPid: number | null;
  breakdown: ProcBreakdownEntry[];
  /** The extraFields() object, if the caller has one. */
  extra: Record<string, unknown> | null | undefined;
  eventLoopDelayMaxMs: number | null;
}

/** The `proc_resources_spike` object. Never throws on odd input; unreadable parts are null. */
export const buildSpikeSample = (input: SpikeSampleInput): Record<string, unknown> => ({
  event: PROC_RESOURCE_SPIKE_EVENT,
  ts: orNull(() => new Date(input.nowMs).toISOString()),
  acctRssMB: round1(sumRssKb(input.scan) / 1024),
  ownRssMB: kbToMbOrNull(findProcess(input.scan, input.ownPid)?.rssKb ?? null),
  procs: input.breakdown,
  activeJobs: input.extra && Array.isArray(input.extra.activeJobs) ? input.extra.activeJobs : null,
  eventLoopDelayMaxMs: input.eventLoopDelayMaxMs,
});

/**
 * JSON for one line, kept within `maxChars`: if it is too long the named array
 * fields are cut (to 3 entries, then 1, then none), in the order given, until it
 * fits. Every other field is left exactly as it is.
 */
export const serializeWithinBudget = (
  sample: Record<string, unknown>,
  trimKeys: readonly string[],
  maxChars: number = PROC_RESOURCE_LINE_MAX_CHARS,
): string => {
  let line = JSON.stringify(sample);
  if (line.length <= maxChars) return line;
  const trimmed: Record<string, unknown> = { ...sample };
  for (const keep of [3, 1, 0]) {
    for (const key of trimKeys) {
      const value = trimmed[key];
      if (!Array.isArray(value) || value.length <= keep) continue;
      trimmed[key] = value.slice(0, keep);
      line = JSON.stringify(trimmed);
      if (line.length <= maxChars) return line;
    }
  }
  return line;
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
  /** The fast account-RSS sampler's period (default 15 s). */
  fastIntervalMs?: number;
  /** Minimum gap between two spike lines (default 60 s). */
  spikeMinGapMs?: number;
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
  /** The five-minute line's timer. */
  timer: TimerLike;
  /** The fifteen-second peak sampler's timer (null if it could not be created). */
  fastTimer: TimerLike | null;
  /** Stops both intervals and the histogram and re-arms the single-logger guard. Mainly for tests. */
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
 * Starts the logger: one immediate proc_resources line, then one every 5 minutes,
 * plus a 15-second sampler that tracks the account's RSS peak between those lines
 * and writes a proc_resources_spike line when it crosses the threshold. Returns
 * the handle, or null when it is disabled or a logger is already running in this
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

    const now = options.now ?? Date.now;
    const scanProcesses = options.scanProcesses ?? (() => scanAccountProcesses());
    const readIdentity = options.readIdentity ?? ((pid: number) => readProcIdentity(pid));
    const spikeThresholdMb = resolveSpikeThresholdMb(options.env);
    const spikeMinGapMs = options.spikeMinGapMs ?? SPIKE_MIN_GAP_MS;
    const tracker = createPeakTracker();
    let lastSpikeAtMs: number | null = null;

    /** Folds one scan into the peak window and writes a spike line if it is one. Never throws. */
    const observeScan = (scan: AccountScan | null): void => {
      try {
        if (!scan) return;
        const atMs = now();
        const acctRssKb = sumRssKb(scan);
        const ownPid = options.pid ?? process.pid;
        // Built at most once per scan, and only when something needs it.
        let breakdown: ProcBreakdownEntry[] | null = null;
        const getBreakdown = (): ProcBreakdownEntry[] =>
          (breakdown ??= buildProcBreakdown(scan.processes, readIdentity));

        tracker.observe({
          atMs,
          acctRssKb,
          ownRssKb: findProcess(scan, ownPid)?.rssKb ?? null,
          breakdown: getBreakdown,
        });

        if (acctRssKb / 1024 >= spikeThresholdMb && (lastSpikeAtMs === null || atMs - lastSpikeAtMs >= spikeMinGapMs)) {
          lastSpikeAtMs = atMs;
          const spike = buildSpikeSample({
            nowMs: atMs,
            scan,
            ownPid,
            breakdown: orNull(getBreakdown) ?? [],
            extra: orNull(options.extraFields ?? (() => undefined)),
            eventLoopDelayMaxMs: peekEventLoopDelayMaxMs(delayMonitor),
          });
          write(serializeWithinBudget(spike, ["procs", "activeJobs"]));
        }
      } catch {
        // A diagnostics line must never be the reason the web process fails.
      }
    };

    const emit = (): void => {
      try {
        const scan = orNull(scanProcesses);
        observeScan(scan);
        const sample = buildProcResourceSample({
          ...options,
          delayMonitor,
          scanProcesses: () => scan,
          readIdentity,
          peakTracker: tracker,
        });
        write(serializeWithinBudget(sample, ["peakProcs", "procs", "activeJobs"]));
      } catch {
        // A diagnostics line must never be the reason the web process fails.
      }
    };

    const fastTick = (): void => {
      try {
        observeScan(orNull(scanProcesses));
      } catch {
        // see above
      }
    };

    const timer = setIntervalFn(emit, options.intervalMs ?? PROC_RESOURCE_LOG_INTERVAL_MS);
    orNull(() => timer.unref?.());
    // The peak sampler is the optional half: if its timer cannot be made, the five-minute line still runs.
    const fastTimer = orNull(() => {
      const created = setIntervalFn(fastTick, options.fastIntervalMs ?? PROC_RESOURCE_FAST_INTERVAL_MS);
      orNull(() => created.unref?.());
      return created;
    });

    const handle: ProcResourceLoggerHandle = {
      timer,
      fastTimer,
      stop: () => {
        orNull(() => clearIntervalFn(timer));
        if (fastTimer) orNull(() => clearIntervalFn(fastTimer));
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
