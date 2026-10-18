/**
 * PM2 log retention, done by the app itself (issue #709, 2026-10-18).
 *
 * The host's `pm2-logrotate` module is being removed: it sits resident at about
 * 45-55 MB and holds 10 tasks, on an account whose physical memory limit (CloudLinux
 * PMEM) is only 1 GB. Without it nothing rotates ~/.pm2/logs (about 3 MB/day each
 * for the out and error log) so this once-a-day cron job (registerJobs.ts) takes its
 * place with no resident process and no host crontab. Its old settings were
 * max_size 10M, retain 3, compress, rotate daily at 00:00.
 *
 * Three jobs, each "plan, then execute": a PURE planner (planPm2LogRetention) turns
 * a list of files (name / size / mtime / whether it is this process's CURRENT log)
 * into a list of actions, and a thin fs layer (runPm2LogRetention) carries them out
 * one file at a time. Nothing is ever read into memory: rotation is copyFile, then
 * truncate.
 *
 * WHO WRITES THE LOGS, and so how "the current log" is found. Not this process. In
 * fork mode PM2 gives health-web's stdout/stderr to the God Daemon, and the DAEMON
 * opens the log files and appends to them (O_APPEND). Measured on the production
 * host (2026-10-18): health-web's /proc/self/fd/1 and fd/2 are `socket:[...]`, not
 * files, while the daemon's fds point at ~/.pm2/logs/health-web-out-1.log,
 * health-web-error-1.log, mall-out-2.log, mall-error-2.log and ~/.pm2/pm2.log.
 * PM2 does tell this process which files are its own: the environment variables
 * `pm_out_log_path` and `pm_err_log_path` (plus `pm_id`, `name`). Those are the
 * primary source of the current log files; /proc/self/fd/1|2 is only a fallback for
 * a process PM2 did not start (env absent). Whichever gives a path, it counts only
 * if it sits directly in the log directory and is named health-web-(out|error)...;
 * otherwise the current logs are "not resolved" and nothing is guessed.
 *
 * 1. Rotate by copytruncate the current logs (above). If either one is not resolved
 *    it is simply skipped. A file is rotated when it is larger than 8 MiB, or when
 *    more than ~1 day has passed since its newest rotated copy (judged from the
 *    copies' mtimes, so there is no state file). It is copied to
 *    `<name without .log>__YYYY-MM-DD_HH-mm-ss.log` and truncated in place
 *    (open O_WRONLY + ftruncate(0)). That is safe even though the writer is another
 *    process: the daemon holds the file open with O_APPEND, so its next write simply
 *    lands at the new end, offset 0 (no hole, no stale offset).
 *    Lines written between the copy and the truncate are lost (the usual
 *    copytruncate caveat). `~/.pm2/pm2.log` (the God Daemon's own log, the record
 *    of every SIGKILL) is rotated the same way, by size only, and is never deleted.
 * 2. Delete expired files, only ever these shapes and only when older than 7 days
 *    (mtime): rotated `health-web-(out|error)[-N]__<stamp>.log[.gz]`, rotated
 *    `pm2__<stamp>.log[.gz]`, leftover logs of a previous PM2 instance
 *    `health-web-(out|error)-N.log` that are NOT the current logs (only if both of
 *    the current logs were resolved, otherwise a quiet live error log could be
 *    mistaken for a leftover), and pm2-logrotate's own `pm2-logrotate-*.log`.
 * 3. Print and return one JSON summary line:
 *    {"event":"pm2_log_retention","ts":...,"rotated":[...],"deleted":[...],"skipped":n,"freedMB":x,"errors":[],
 *     "active":["health-web-out-1.log","health-web-error-1.log"],"activeResolved":true}
 *    (`active` / `activeResolved` say which current logs were found; an empty
 *    `active` is the signature of the "cannot find the current logs" failure.)
 *
 * What it will never touch: `mall-*` (the other app on this account), any name that
 * is not exactly one of the shapes above, the current logs (other than rotating
 * them), anything that is not a plain file (symlinks included: every
 * candidate is lstat()ed), and anything in ~/.pm2 outside logs/ other than the
 * pm2.log / pm2__<stamp>.log pair (dump.pm2, pids, modules, sockets stay alone).
 * Failures are recorded in `errors` and never thrown.
 */
import { constants, readlinkSync } from "node:fs";
import type { Dirent } from "node:fs";
import { copyFile, lstat, open, readdir, realpath, unlink, utimes } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

export const PM2_LOG_RETENTION_EVENT = "pm2_log_retention";

/** A log larger than this (strictly) is rotated. */
export const ROTATE_MAX_BYTES = 8 * 1024 * 1024;

/**
 * "More than a day since the last rotation". Slightly under 24 h on purpose: the
 * job runs once a day and its start time jitters by a few hundred milliseconds,
 * so an exact 24 h bound would skip every other day.
 */
export const ROTATE_AFTER_MS = 23 * 60 * 60 * 1000;

/** A rotated / leftover file whose mtime is older than this (strictly) is deleted. */
export const RETAIN_MS = 7 * 24 * 60 * 60 * 1000;

/** Which of the two directories a file lives in: ~/.pm2/logs, or ~/.pm2 itself (pm2.log only). */
export type Pm2LogDir = "logs" | "root";

const STAMP_SOURCE = "\\d{4}-\\d{2}-\\d{2}_\\d{2}-\\d{2}-\\d{2}";

/** The shape of a log health-web writes: health-web-out-0.log, health-web-error-0.log (id optional). */
const WEB_LOG = /^health-web-(?:out|error)(?:-\d+)?\.log$/;
/** A previous PM2 instance's leftover log (id required, and not the one being written): health-web-out-3.log. */
const STALE_INSTANCE_LOG = /^health-web-(?:out|error)-\d+\.log$/;
const ROTATED_WEB_LOG = new RegExp(`^health-web-(?:out|error)(?:-\\d+)?__${STAMP_SOURCE}\\.log(?:\\.gz)?$`);
const ROTATED_PM2_LOG = new RegExp(`^pm2__${STAMP_SOURCE}\\.log(?:\\.gz)?$`);
const LOGROTATE_OWN_LOG = /^pm2-logrotate-[A-Za-z0-9_.-]*\.log(?:\.gz)?$/;
const PM2_MAIN_LOG = "pm2.log";

export type LogNameKind =
  /** health-web-out|error[-N].log: the live one (active) or a previous instance's leftover (not). */
  | "web-log"
  | "rotated-web"
  | "logrotate-own"
  | "rotated-pm2"
  | "pm2-main";

/**
 * The only classifier: which (if any) of the shapes this job manages a name is.
 * Null for everything else, mall-* above all. Names with a path separator or a
 * NUL can never match, and the patterns are anchored.
 */
export const classifyLogName = (dir: Pm2LogDir, name: string): LogNameKind | null => {
  if (typeof name !== "string" || name === "" || name !== path.basename(name) || /[\\/\0]/.test(name)) return null;
  if (name.startsWith("mall")) return null;
  if (dir === "root") {
    if (name === PM2_MAIN_LOG) return "pm2-main";
    return ROTATED_PM2_LOG.test(name) ? "rotated-pm2" : null;
  }
  if (ROTATED_WEB_LOG.test(name)) return "rotated-web";
  if (ROTATED_PM2_LOG.test(name)) return "rotated-pm2";
  if (LOGROTATE_OWN_LOG.test(name)) return "logrotate-own";
  return WEB_LOG.test(name) ? "web-log" : null;
};

export interface Pm2LogFile {
  dir: Pm2LogDir;
  name: string;
  size: number;
  mtimeMs: number;
  /**
   * True when this is one of this process's CURRENT PM2 logs (pm_out_log_path /
   * pm_err_log_path, else /proc/self/fd/1|2). The writer is the PM2 God Daemon, not
   * this process; "active" only means "do not delete, rotate when due".
   */
  active: boolean;
}

export type DeleteReason = "expired-rotation" | "stale-instance" | "logrotate-module";

export type RetentionAction =
  | { kind: "rotate"; dir: Pm2LogDir; name: string; rotatedName: string; size: number }
  | { kind: "delete"; dir: Pm2LogDir; name: string; size: number; reason: DeleteReason };

export interface PlanInput {
  files: readonly Pm2LogFile[];
  nowMs: number;
  /** YYYY-MM-DD_HH-mm-ss for the name of any rotated copy made in this run. */
  stamp: string;
  /**
   * True only when BOTH of this process's current logs (stdout and stderr) were
   * resolved to health-web logs inside the log directory. Without that, a log
   * that merely looks like a previous instance's could be the live one.
   */
  activeResolved: boolean;
}

export interface RetentionPlan {
  /** Rotations first, then deletions; each group sorted by directory and name. */
  actions: RetentionAction[];
  /** Candidates given to the planner that need no action. */
  ignored: number;
}

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const withoutLogSuffix = (name: string): string => name.slice(0, name.length - ".log".length);

export const rotatedNameFor = (name: string, stamp: string): string => `${withoutLogSuffix(name)}__${stamp}.log`;

const byDirThenName = (a: Pm2LogFile, b: Pm2LogFile): number =>
  a.dir === b.dir ? (a.name < b.name ? -1 : a.name > b.name ? 1 : 0) : a.dir < b.dir ? -1 : 1;

/**
 * PURE. Decides what to rotate and what to delete; touches nothing.
 *
 * Boundaries are deliberate and tested: a file of exactly 8 MiB is NOT rotated
 * (only larger); a file exactly 7 days old is NOT deleted (only older); the "a day
 * since the last rotation" test is strictly greater than ROTATE_AFTER_MS.
 */
export const planPm2LogRetention = ({ files, nowMs, stamp, activeResolved }: PlanInput): RetentionPlan => {
  const sorted = [...files].sort(byDirThenName);
  const rotations: RetentionAction[] = [];
  const deletions: RetentionAction[] = [];
  let ignored = 0;

  const expired = (file: Pm2LogFile): boolean => nowMs - file.mtimeMs > RETAIN_MS;

  /** mtime of the newest rotated copy of `file`, or null when it has never been rotated. */
  const lastRotationMs = (file: Pm2LogFile): number | null => {
    const sibling = new RegExp(`^${escapeRegExp(withoutLogSuffix(file.name))}__${STAMP_SOURCE}\\.log(?:\\.gz)?$`);
    let newest: number | null = null;
    for (const other of sorted) {
      if (other.dir !== file.dir || !sibling.test(other.name)) continue;
      if (newest === null || other.mtimeMs > newest) newest = other.mtimeMs;
    }
    return newest;
  };

  for (const file of sorted) {
    const kind = classifyLogName(file.dir, file.name);
    let handled = false;

    if (kind === "web-log" && file.active) {
      const last = lastRotationMs(file);
      const tooBig = file.size > ROTATE_MAX_BYTES;
      const dayOld = file.size > 0 && (last === null || nowMs - last > ROTATE_AFTER_MS);
      if (tooBig || dayOld) {
        rotations.push({ kind: "rotate", dir: file.dir, name: file.name, rotatedName: rotatedNameFor(file.name, stamp), size: file.size });
        handled = true;
      }
    } else if (kind === "pm2-main" && file.dir === "root") {
      // The God Daemon's own log: rotated by size only, and NEVER deleted.
      if (file.size > ROTATE_MAX_BYTES) {
        rotations.push({ kind: "rotate", dir: file.dir, name: file.name, rotatedName: rotatedNameFor(file.name, stamp), size: file.size });
        handled = true;
      }
    } else if (!file.active && expired(file)) {
      if (kind === "rotated-web" || kind === "rotated-pm2") {
        deletions.push({ kind: "delete", dir: file.dir, name: file.name, size: file.size, reason: "expired-rotation" });
        handled = true;
      } else if (kind === "web-log" && STALE_INSTANCE_LOG.test(file.name) && activeResolved) {
        deletions.push({ kind: "delete", dir: file.dir, name: file.name, size: file.size, reason: "stale-instance" });
        handled = true;
      } else if (kind === "logrotate-own") {
        deletions.push({ kind: "delete", dir: file.dir, name: file.name, size: file.size, reason: "logrotate-module" });
        handled = true;
      }
    }

    if (!handled) ignored += 1;
  }

  return { actions: [...rotations, ...deletions], ignored };
};

/** YYYY-MM-DD_HH-mm-ss in the server's local time, the same shape pm2-logrotate named its files with. */
export const formatRotationStamp = (date: Date): string => {
  const two = (value: number): string => String(value).padStart(2, "0");
  return (
    `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}` +
    `_${two(date.getHours())}-${two(date.getMinutes())}-${two(date.getSeconds())}`
  );
};

/**
 * Candidate paths of this process's current stdout / stderr log files, not yet
 * validated (resolveActiveLogs does that). Each is PM2's `pm_out_log_path` /
 * `pm_err_log_path` when the environment has one, otherwise where
 * /proc/self/fd/1 / fd/2 point (readlink; under PM2 fork mode these are
 * `socket:[...]`, which never validates), otherwise null.
 */
export interface ActiveLogTargets {
  stdout: string | null;
  stderr: string | null;
}

const readlinkOrNull = (fdPath: string): string | null => {
  try {
    return readlinkSync(fdPath);
  } catch {
    return null;
  }
};

const nonEmptyOrNull = (value: string | undefined | null): string | null =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : null;

/**
 * The real source of ActiveLogTargets. PM2's env paths win; /proc/self/fd/1|2 is
 * the fallback for a process PM2 did not start (env absent), and gives null where
 * /proc does not exist. An env value that is present is NOT second-guessed by
 * falling back to the fd: if PM2 named a file, it must validate, or nothing is
 * resolved. `env` and `readlink` are test seams.
 */
export const readActiveLogTargets = (
  env: Record<string, string | undefined> = process.env,
  readlink: (fdPath: string) => string | null = readlinkOrNull,
): ActiveLogTargets => ({
  stdout: nonEmptyOrNull(env.pm_out_log_path) ?? readlink("/proc/self/fd/1"),
  stderr: nonEmptyOrNull(env.pm_err_log_path) ?? readlink("/proc/self/fd/2"),
});

export interface ResolvedActiveLogs {
  /** Basenames of this process's current log files, inside the log directory. */
  names: Set<string>;
  /** True only when both stdout and stderr resolved. */
  resolved: boolean;
}

/**
 * PURE. A target counts only if it sits directly in the log directory (as given,
 * or as its realpath, since /proc shows the real one) and is named like a
 * health-web out/error log. Anything else (a `socket:[...]`, a pipe, a tty, a
 * " (deleted)" file, a relative path, another directory, a mall-* log) resolves to
 * nothing: no guessing.
 */
export const resolveActiveLogs = (
  targets: ActiveLogTargets,
  logDirs: readonly string[],
): ResolvedActiveLogs => {
  const names = new Set<string>();
  let okCount = 0;
  for (const target of [targets.stdout, targets.stderr]) {
    if (typeof target !== "string" || target === "") continue;
    const name = path.basename(target);
    if (!WEB_LOG.test(name) || !logDirs.includes(path.dirname(target))) continue;
    names.add(name);
    okCount += 1;
  }
  return { names, resolved: okCount === 2 };
};

export interface Pm2LogRetentionSummary {
  event: typeof PM2_LOG_RETENTION_EVENT;
  ts: string;
  /** `logs/<name> -> <rotated name>`, or `root/pm2.log -> ...` */
  rotated: string[];
  /** Names of the files removed (`logs/<name>` / `root/<name>`). */
  deleted: string[];
  /** Directory entries left alone (not a managed shape, not a plain file, not due, protected). */
  skipped: number;
  /** Size of the deleted files in MB (rotation frees nothing net: the copy takes the space). */
  freedMB: number;
  /** Failures, recorded instead of thrown. */
  errors: string[];
  /** Basenames of this process's current logs that were found; empty means they could NOT be found. */
  active: string[];
  /** True when both current logs were found (what leftover-instance cleanup requires). */
  activeResolved: boolean;
}

export interface Pm2LogRetentionOptions {
  /** Defaults to $PM2_LOG_DIR, else ~/.pm2/logs. The ~/.pm2 directory is its parent (only when it is named `logs`). */
  logDir?: string;
  now?: () => number;
  /** Test seam for the current-log candidates (default: readActiveLogTargets(): PM2 env, else /proc/self/fd/1|2). */
  readActiveTargets?: () => ActiveLogTargets;
  /** Where the summary line goes; defaults to console.log (the pm2 out log). */
  write?: (line: string) => void;
}

export const defaultPm2LogDir = (env: Record<string, string | undefined> = process.env): string => {
  const override = env.PM2_LOG_DIR?.trim();
  return override ? override : path.join(homedir(), ".pm2", "logs");
};

const errorCode = (error: unknown): string => {
  if (error && typeof error === "object") {
    const record = error as { code?: unknown; message?: unknown };
    if (typeof record.code === "string") return record.code;
    if (typeof record.message === "string") return record.message.slice(0, 80);
  }
  return String(error).slice(0, 80);
};

interface Listing {
  files: Pm2LogFile[];
  ignored: number;
}

/**
 * Lists one directory: only plain files whose NAME is one of the managed shapes
 * become candidates. readdir's file types do not follow symlinks, and each candidate
 * is lstat()ed again, so a symlink (or anything swapped in since) is never a file here.
 */
const listCandidates = async (dir: string, label: Pm2LogDir, activeNames: ReadonlySet<string>): Promise<Listing> => {
  let entries: Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") return { files: [], ignored: 0 };
    throw error;
  }
  const files: Pm2LogFile[] = [];
  let ignored = 0;
  for (const entry of entries) {
    if (!entry.isFile() || classifyLogName(label, entry.name) === null) {
      ignored += 1;
      continue;
    }
    try {
      const stat = await lstat(path.join(dir, entry.name));
      if (!stat.isFile()) {
        ignored += 1;
        continue;
      }
      files.push({
        dir: label,
        name: entry.name,
        size: stat.size,
        mtimeMs: stat.mtimeMs,
        active: label === "logs" && activeNames.has(entry.name),
      });
    } catch {
      ignored += 1; // vanished between readdir and lstat
    }
  }
  return { files, ignored };
};

/** copytruncate: copy first (never overwriting), then empty the original in place. */
const rotateOne = async (dirPath: string, action: Extract<RetentionAction, { kind: "rotate" }>, nowMs: number): Promise<void> => {
  const source = path.join(dirPath, action.name);
  const target = path.join(dirPath, action.rotatedName);
  if (!(await lstat(source)).isFile()) throw new Error("not a plain file");
  await copyFile(source, target, constants.COPYFILE_EXCL);
  try {
    // O_WRONLY without O_APPEND/O_TRUNC, then ftruncate: never follows a symlink swapped in meanwhile.
    const handle = await open(source, constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      await handle.truncate(0);
    } finally {
      await handle.close();
    }
  } catch (error) {
    // The original could not be emptied: do not leave a duplicate behind to be re-made tomorrow.
    await unlink(target).catch(() => undefined);
    throw error;
  }
  // A copy keeps no timestamps on every platform; "rotated at" must be now for the 7-day clock and the daily rule.
  await utimes(target, new Date(nowMs), new Date(nowMs)).catch(() => undefined);
};

const deleteOne = async (dirPath: string, action: Extract<RetentionAction, { kind: "delete" }>): Promise<void> => {
  const target = path.join(dirPath, action.name);
  if (!(await lstat(target)).isFile()) throw new Error("not a plain file");
  await unlink(target); // unlink removes a name, never what a symlink points at
};

/**
 * Runs one retention pass. Sequential, one file at a time, no file content ever
 * read into memory. Never throws; the summary line is written and returned.
 */
export const runPm2LogRetention = async (options: Pm2LogRetentionOptions = {}): Promise<Pm2LogRetentionSummary> => {
  const nowMs = (options.now ?? Date.now)();
  const summary: Pm2LogRetentionSummary = {
    event: PM2_LOG_RETENTION_EVENT,
    ts: new Date(nowMs).toISOString(),
    rotated: [],
    deleted: [],
    skipped: 0,
    freedMB: 0,
    errors: [],
    active: [],
    activeResolved: false,
  };
  let freedBytes = 0;

  try {
    const logDir = path.resolve(options.logDir ?? defaultPm2LogDir());
    // ~/.pm2 itself is only consulted (for pm2.log) when the log directory really is <something>/logs.
    const rootDir = path.basename(logDir) === "logs" ? path.dirname(logDir) : null;
    const realLogDir = await realpath(logDir).catch(() => logDir);

    const active = resolveActiveLogs((options.readActiveTargets ?? readActiveLogTargets)(), [logDir, realLogDir]);
    summary.active = [...active.names].sort();
    summary.activeResolved = active.resolved;
    const logs = await listCandidates(logDir, "logs", active.names);
    const root = rootDir ? await listCandidates(rootDir, "root", new Set()) : { files: [], ignored: 0 };

    const stamp = formatRotationStamp(new Date(nowMs));
    const plan = planPm2LogRetention({
      files: [...logs.files, ...root.files],
      nowMs,
      stamp,
      activeResolved: active.resolved,
    });

    for (const action of plan.actions) {
      const dirPath = action.dir === "logs" ? logDir : rootDir;
      const label = `${action.dir}/${action.name}`;
      try {
        // Re-check at the moment of acting: the planner's input could be stale, and the executor trusts nothing.
        if (!dirPath || classifyLogName(action.dir, action.name) === null) throw new Error("not a managed log");
        if (action.kind === "rotate") {
          await rotateOne(dirPath, action, nowMs);
          summary.rotated.push(`${label} -> ${action.rotatedName}`);
        } else {
          await deleteOne(dirPath, action);
          summary.deleted.push(label);
          freedBytes += action.size;
        }
      } catch (error) {
        summary.errors.push(`${action.kind} ${label}: ${errorCode(error)}`);
      }
    }

    // Entries of ~/.pm2 itself (dump.pm2, pids, modules, ...) are outside this job's scope and not counted.
    summary.skipped = logs.ignored + plan.ignored;
    summary.freedMB = Math.round((freedBytes / 1048576) * 100) / 100;
  } catch (error) {
    summary.errors.push(`run: ${errorCode(error)}`);
  }

  try {
    (options.write ?? ((line: string) => console.log(line)))(JSON.stringify(summary));
  } catch {
    // The summary line is a convenience; the return value is the real result.
  }
  return summary;
};
