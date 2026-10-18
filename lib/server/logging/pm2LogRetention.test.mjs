import test, { after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, truncateSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// #709 (2026-10-18): the pm2-logrotate module is being removed from the 1 GB host; this
// daily in-app job replaces it. The planner is pure and covered at its boundaries; the
// executor is run against a real temporary ~/.pm2 to prove what it will and will not touch.

const {
  PM2_LOG_RETENTION_EVENT,
  RETAIN_MS,
  ROTATE_AFTER_MS,
  ROTATE_MAX_BYTES,
  classifyLogName,
  defaultPm2LogDir,
  formatRotationStamp,
  planPm2LogRetention,
  readActiveLogTargets,
  resolveActiveLogs,
  rotatedNameFor,
  runPm2LogRetention,
} = await import("./pm2LogRetention.ts");

const MiB = 1024 * 1024;
const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const NOW = new Date(2026, 9, 18, 1, 46, 0).getTime(); // local time, like the stamp
const STAMP = "2026-10-18_01-46-00";

/** A planner input file, `ageMs` old. */
const file = (name, { dir = "logs", size = 1000, ageMs = 0, active = false } = {}) => ({ dir, name, size, mtimeMs: NOW - ageMs, active });
const plan = (files, extra = {}) => planPm2LogRetention({ files, nowMs: NOW, stamp: STAMP, activeResolved: true, ...extra });
const summarize = (result) => result.actions.map((a) => `${a.kind} ${a.dir}/${a.name}${a.rotatedName ? ` -> ${a.rotatedName}` : ""}${a.reason ? ` (${a.reason})` : ""}`);

// --- constants and small pure helpers ---------------------------------------------

test("the thresholds are the ones the owner chose: 8 MiB, about a day, 7 days", () => {
  assert.equal(ROTATE_MAX_BYTES, 8 * 1024 * 1024);
  assert.equal(RETAIN_MS, 7 * DAY);
  assert.ok(ROTATE_AFTER_MS > 22 * HOUR && ROTATE_AFTER_MS <= DAY, "about a day, with slack for the daily job's start jitter");
  assert.equal(PM2_LOG_RETENTION_EVENT, "pm2_log_retention");
});

test("rotatedNameFor / formatRotationStamp: <name minus .log>__YYYY-MM-DD_HH-mm-ss.log, local time, zero padded", () => {
  assert.equal(formatRotationStamp(new Date(2026, 9, 18, 1, 46, 7)), "2026-10-18_01-46-07");
  assert.equal(formatRotationStamp(new Date(2026, 0, 2, 3, 4, 5)), "2026-01-02_03-04-05");
  assert.equal(rotatedNameFor("health-web-out-0.log", STAMP), "health-web-out-0__2026-10-18_01-46-00.log");
  assert.equal(rotatedNameFor("pm2.log", STAMP), "pm2__2026-10-18_01-46-00.log");
});

test("defaultPm2LogDir: ~/.pm2/logs, or PM2_LOG_DIR", () => {
  assert.equal(defaultPm2LogDir({ PM2_LOG_DIR: "/tmp/x/logs" }), "/tmp/x/logs");
  assert.equal(defaultPm2LogDir({ PM2_LOG_DIR: "  " }).endsWith(path.join(".pm2", "logs")), true);
  assert.equal(path.basename(defaultPm2LogDir({})), "logs");
});

test("classifyLogName: only the managed shapes; mall, traversal and look-alikes are null", () => {
  const logs = (name) => classifyLogName("logs", name);
  assert.equal(logs("health-web-out-0.log"), "web-log");
  assert.equal(logs("health-web-error-12.log"), "web-log");
  assert.equal(logs("health-web-out.log"), "web-log");
  assert.equal(logs("health-web-out-0__2026-10-18_00-00-00.log"), "rotated-web");
  assert.equal(logs("health-web-error-3__2026-10-18_00-00-00.log.gz"), "rotated-web");
  assert.equal(logs("pm2__2026-10-18_00-00-00.log"), "rotated-pm2");
  assert.equal(logs("pm2-logrotate-out.log"), "logrotate-own");
  assert.equal(logs("pm2-logrotate-error__2026-10-18_00-00-00.log.gz"), "logrotate-own");
  assert.equal(classifyLogName("root", "pm2.log"), "pm2-main");
  assert.equal(classifyLogName("root", "pm2__2026-10-18_00-00-00.log"), "rotated-pm2");

  for (const name of [
    "mall-out-0.log",
    "mall-error-1.log",
    "mall-out-0__2026-10-18_00-00-00.log",
    "mall-health-web-out-0.log",
    "pm2.log", // the God Daemon's log lives in ~/.pm2, never in logs/
    "dump.pm2",
    "health-web-out-0.log.bak",
    "health-web-out-0.logx",
    "health-web-out-0__x.log",
    "health-web-outer-0.log",
    "xhealth-web-out-0.log",
    "health-web-out-0__2026-10-18_00-00-00.log.zip",
    "health-web-out-0__2026-10-18_00-00-00.log/",
    "../health-web-out-0__2026-10-18_00-00-00.log",
    "..\\health-web-out-0.log",
    "sub/health-web-out-0.log",
    "health-web-out-0.log\0",
    "",
    ".",
    "..",
  ]) {
    assert.equal(logs(name), null, JSON.stringify(name));
  }
  // ~/.pm2 itself: only pm2.log and its rotated copies are ever managed.
  for (const name of ["health-web-out-0.log", "mall-out-0.log", "dump.pm2", "pm2-logrotate-out.log", "../pm2.log", "pm2.log/", "pm2.log.bak"]) {
    assert.equal(classifyLogName("root", name), null, name);
  }
  assert.equal(classifyLogName("logs", undefined), null);
  assert.equal(classifyLogName("logs", 5), null);
});

// --- planner: rotating the live logs ---------------------------------------------------

test("plan: a live log larger than 8 MiB is rotated; exactly 8 MiB is not (strictly larger)", () => {
  const recent = (name) => file(name.replace(".log", "__2026-10-17_23-00-00.log"), { ageMs: HOUR });
  const files = (size) => [file("health-web-out-0.log", { size, active: true }), recent("health-web-out-0.log")];

  assert.deepEqual(summarize(plan(files(8 * MiB))), []);
  assert.deepEqual(summarize(plan(files(8 * MiB + 1))), ["rotate logs/health-web-out-0.log -> health-web-out-0__2026-10-18_01-46-00.log"]);
  assert.deepEqual(summarize(plan(files(300 * MiB))), ["rotate logs/health-web-out-0.log -> health-web-out-0__2026-10-18_01-46-00.log"]);
});

test("plan: a live log is also rotated when its newest rotated copy is more than ~a day old (strict), judged by mtime", () => {
  const sibling = (ageMs, ext = ".log") => file(`health-web-out-0__2026-10-17_01-00-00${ext}`, { ageMs });
  const live = file("health-web-out-0.log", { size: 3 * MiB, active: true });

  assert.deepEqual(summarize(plan([live, sibling(ROTATE_AFTER_MS)])), [], "exactly at the bound: not yet");
  assert.equal(summarize(plan([live, sibling(ROTATE_AFTER_MS + 1)])).length, 1, "one millisecond past it: rotate");
  assert.deepEqual(summarize(plan([live, sibling(2 * HOUR)])), []);
  // The newest copy counts, not the oldest; a compressed pm2-logrotate copy counts too.
  assert.deepEqual(summarize(plan([live, sibling(5 * DAY), sibling(2 * HOUR)])), []);
  assert.deepEqual(summarize(plan([live, sibling(2 * HOUR, ".log.gz")])), []);
  // A copy of a DIFFERENT log (the error log) says nothing about this one.
  assert.equal(
    summarize(plan([live, file("health-web-error-0__2026-10-18_00-00-00.log", { ageMs: HOUR })])).length,
    1,
  );
  // Never rotated before: rotate now (that creates the baseline for tomorrow) ...
  assert.equal(summarize(plan([live])).length, 1);
  // ... unless it is empty: nothing to rotate.
  assert.deepEqual(summarize(plan([file("health-web-out-0.log", { size: 0, active: true })])), []);
});

test("plan: only a log THIS process is writing is rotated; an idle leftover of the same shape is not", () => {
  const big = { size: 50 * MiB };
  assert.deepEqual(summarize(plan([file("health-web-out-3.log", { ...big, active: false })])), []);
  assert.equal(summarize(plan([file("health-web-out-3.log", { ...big, active: true })])).length, 1);
});

test("plan: pm2.log (the God Daemon's own log) is rotated by size only, never by age, and NEVER deleted", () => {
  const root = (props) => file("pm2.log", { dir: "root", ...props });
  assert.deepEqual(summarize(plan([root({ size: 8 * MiB })])), []);
  assert.deepEqual(summarize(plan([root({ size: 8 * MiB + 1 })])), ["rotate root/pm2.log -> pm2__2026-10-18_01-46-00.log"]);
  // However old, however big: the only possible action is a rotation.
  assert.deepEqual(summarize(plan([root({ size: 1 * MiB, ageMs: 400 * DAY })])), []);
  assert.ok(plan([root({ size: 900 * MiB, ageMs: 400 * DAY })]).actions.every((a) => a.kind === "rotate"));
  // A pm2.log in logs/ is not the daemon's log and is not managed.
  assert.deepEqual(summarize(plan([file("pm2.log", { size: 50 * MiB, ageMs: 400 * DAY })])), []);
});

// --- planner: deleting expired files -----------------------------------------------------

test("plan: rotated health-web logs and rotated pm2.log copies are deleted only when older than 7 days (strict)", () => {
  const names = [
    ["logs", "health-web-out-0__2026-10-01_00-00-00.log"],
    ["logs", "health-web-error-0__2026-10-01_00-00-00.log.gz"],
    ["logs", "pm2__2026-10-01_00-00-00.log"],
    ["root", "pm2__2026-10-01_00-00-00.log.gz"],
  ];
  for (const [dir, name] of names) {
    assert.deepEqual(summarize(plan([file(name, { dir, ageMs: RETAIN_MS })])), [], `${name} exactly 7 days`);
    assert.deepEqual(summarize(plan([file(name, { dir, ageMs: RETAIN_MS - 1 })])), [], `${name} just under`);
    assert.deepEqual(summarize(plan([file(name, { dir, ageMs: RETAIN_MS + 1 })])), [`delete ${dir}/${name} (expired-rotation)`], `${name} just over`);
  }
});

test("plan: a previous PM2 instance's leftover health-web-out|error-N.log goes after 7 days, but only if the live files were resolved", () => {
  const old = file("health-web-out-1.log", { ageMs: 10 * DAY });
  const live = [file("health-web-out-0.log", { active: true, ageMs: 40 * DAY, size: 10 }), file("health-web-error-0.log", { active: true, ageMs: 40 * DAY, size: 10 })];

  const resolved = summarize(plan([old, ...live]));
  assert.ok(resolved.includes("delete logs/health-web-out-1.log (stale-instance)"));
  assert.ok(!resolved.some((line) => line.includes("delete logs/health-web-out-0.log")), "the live log is never deleted, however old its mtime");
  assert.ok(!resolved.some((line) => line.includes("delete logs/health-web-error-0.log")), "an idle live error log is not a leftover");

  // Could not tell which files are live: leave every leftover alone (the idle live error log could be one of them).
  assert.deepEqual(summarize(plan([old, ...live], { activeResolved: false })).filter((l) => l.startsWith("delete")), []);

  assert.deepEqual(summarize(plan([file("health-web-out-1.log", { ageMs: RETAIN_MS })])), []);
  assert.deepEqual(summarize(plan([file("health-web-out-1.log", { ageMs: RETAIN_MS + 1 })])), ["delete logs/health-web-out-1.log (stale-instance)"]);
  // No numeric id: not the previous-instance shape, so not deleted.
  assert.deepEqual(summarize(plan([file("health-web-out.log", { ageMs: 30 * DAY })])), []);
});

test("plan: pm2-logrotate's own logs go after 7 days, and a fresh one stays", () => {
  assert.deepEqual(
    summarize(plan([file("pm2-logrotate-out.log", { ageMs: 8 * DAY }), file("pm2-logrotate-error.log", { ageMs: 2 * DAY })])),
    ["delete logs/pm2-logrotate-out.log (logrotate-module)"],
  );
  assert.deepEqual(summarize(plan([file("pm2-logrotate-out__2026-10-01_00-00-00.log.gz", { ageMs: 8 * DAY })])), [
    "delete logs/pm2-logrotate-out__2026-10-01_00-00-00.log.gz (logrotate-module)",
  ]);
});

test("plan: mall logs, unknown names and a live file are NEVER acted on, whatever their size, age or 'active' flag", () => {
  const ancient = 900 * DAY;
  const hostile = [
    file("mall-out-0.log", { size: 500 * MiB, ageMs: ancient }),
    file("mall-error-0.log", { size: 500 * MiB, ageMs: ancient, active: true }),
    file("mall-out-0__2026-01-01_00-00-00.log", { ageMs: ancient }),
    file("mall-out-0__2026-01-01_00-00-00.log.gz", { ageMs: ancient }),
    file("dump.pm2", { ageMs: ancient }),
    file("pm2.pid", { ageMs: ancient }),
    file("random.txt", { ageMs: ancient }),
    file("health-web-out-0.log.bak", { ageMs: ancient }),
    file("../health-web-out-9__2026-01-01_00-00-00.log", { ageMs: ancient }),
    file("sub/health-web-out-9__2026-01-01_00-00-00.log", { ageMs: ancient }),
    file("dump.pm2", { dir: "root", ageMs: ancient }),
    file("mall-out-0.log", { dir: "root", ageMs: ancient, size: 500 * MiB }),
    file("modules", { dir: "root", ageMs: ancient }),
  ];
  const result = plan(hostile);
  assert.deepEqual(result.actions, []);
  assert.equal(result.ignored, hostile.length);
});

test("plan: rotations come before deletions, both in a stable order, and the input is not mutated", () => {
  const files = [
    file("health-web-out-1.log", { ageMs: 9 * DAY }),
    file("health-web-error-0.log", { active: true, size: 20 * MiB }),
    file("pm2-logrotate-out.log", { ageMs: 9 * DAY }),
    file("health-web-out-0.log", { active: true, size: 20 * MiB }),
    file("pm2.log", { dir: "root", size: 20 * MiB }),
    file("pm2__2026-09-01_00-00-00.log", { dir: "root", ageMs: 9 * DAY }),
  ];
  const copy = JSON.parse(JSON.stringify(files));
  const result = summarize(plan(files));
  assert.deepEqual(result, [
    "rotate logs/health-web-error-0.log -> health-web-error-0__2026-10-18_01-46-00.log",
    "rotate logs/health-web-out-0.log -> health-web-out-0__2026-10-18_01-46-00.log",
    "rotate root/pm2.log -> pm2__2026-10-18_01-46-00.log",
    "delete logs/health-web-out-1.log (stale-instance)",
    "delete logs/pm2-logrotate-out.log (logrotate-module)",
    "delete root/pm2__2026-09-01_00-00-00.log (expired-rotation)",
  ]);
  assert.deepEqual(files, copy);
  assert.deepEqual(summarize(plan([...files].reverse())), result, "input order does not matter");
});

// --- resolving which files this process is writing -------------------------------------------

test("resolveActiveLogs: only health-web logs directly inside the log directory count; pipes, ttys and (deleted) files resolve to nothing", () => {
  const dirs = ["/home/u/.pm2/logs", "/home2/u/.pm2/logs"];
  const resolve = (stdout, stderr) => resolveActiveLogs({ stdout, stderr }, dirs);

  const both = resolve("/home/u/.pm2/logs/health-web-out-0.log", "/home/u/.pm2/logs/health-web-error-0.log");
  assert.deepEqual([...both.names].sort(), ["health-web-error-0.log", "health-web-out-0.log"]);
  assert.equal(both.resolved, true);
  // /proc shows the real path while homedir() may be a symlinked alias: either spelling is accepted.
  assert.equal(resolve("/home2/u/.pm2/logs/health-web-out-0.log", "/home2/u/.pm2/logs/health-web-error-0.log").resolved, true);

  for (const [stdout, stderr] of [
    ["pipe:[12345]", "pipe:[12346]"],
    ["/dev/null", "/dev/null"],
    ["/dev/pts/3", "/dev/pts/3"],
    ["/home/u/.pm2/logs/health-web-out-0.log (deleted)", "/home/u/.pm2/logs/health-web-error-0.log"],
    ["/home/u/.pm2/logs/mall-out-0.log", "/home/u/.pm2/logs/mall-error-0.log"],
    ["/elsewhere/health-web-out-0.log", "/elsewhere/health-web-error-0.log"],
    ["/home/u/.pm2/logs/sub/health-web-out-0.log", "/home/u/.pm2/logs/health-web-error-0.log"],
    [null, null],
  ]) {
    const result = resolve(stdout, stderr);
    assert.equal(result.resolved, false, `${stdout} / ${stderr}`);
  }
  // One good, one bad: the good one is still known to be live (so it can be rotated), but not "resolved".
  const half = resolve("/home/u/.pm2/logs/health-web-out-0.log", "pipe:[1]");
  assert.deepEqual([...half.names], ["health-web-out-0.log"]);
  assert.equal(half.resolved, false);

  assert.doesNotThrow(() => readActiveLogTargets());
  const real = readActiveLogTargets();
  assert.ok(real.stdout === null || typeof real.stdout === "string");
});

// --- executor against a real temporary ~/.pm2 -------------------------------------------------------

const sandboxes = [];
after(() => {
  for (const dir of sandboxes) rmSync(dir, { recursive: true, force: true });
});

/** Makes <tmp>/.pm2/{logs,modules} and returns helpers. Times are set relative to NOW. */
const makeSandbox = () => {
  const base = mkdtempSync(path.join(tmpdir(), "pm2-retention-"));
  sandboxes.push(base);
  const pm2 = path.join(base, ".pm2");
  const logs = path.join(pm2, "logs");
  mkdirSync(logs, { recursive: true });
  mkdirSync(path.join(pm2, "modules"), { recursive: true });
  const put = (dir, name, { size = 100, ageMs = 0, content } = {}) => {
    const full = path.join(dir, name);
    if (content !== undefined) writeFileSync(full, content);
    else {
      writeFileSync(full, "");
      truncateSync(full, size);
    }
    const when = new Date(NOW - ageMs);
    utimesSync(full, when, when);
    return full;
  };
  return { base, pm2, logs, put };
};

const liveTargets = (logs, out = "health-web-out-0.log", err = "health-web-error-0.log") => ({
  readActiveTargets: () => ({ stdout: path.join(logs, out), stderr: path.join(logs, err) }),
});

const run = (sandbox, extra = {}) => {
  const lines = [];
  return runPm2LogRetention({ logDir: sandbox.logs, now: () => NOW, write: (line) => lines.push(line), ...liveTargets(sandbox.logs), ...extra }).then((summary) => ({ summary, lines }));
};

test("executor: a full pass rotates the live logs and the daemon log, deletes only expired managed files, leaves everything else alone", async () => {
  const s = makeSandbox();
  const outside = path.join(s.base, "outside");
  mkdirSync(outside);
  const precious = path.join(outside, "precious.txt");
  writeFileSync(precious, "keep me");
  const preciousDir = path.join(outside, "precious-dir");
  mkdirSync(preciousDir);
  writeFileSync(path.join(preciousDir, "inside.txt"), "keep me too");

  // Live logs: out is over the limit, error is small and was rotated an hour ago.
  s.put(s.logs, "health-web-out-0.log", { size: 9 * MiB, ageMs: 0 });
  s.put(s.logs, "health-web-error-0.log", { size: 2000, ageMs: 40 * DAY });
  s.put(s.logs, "health-web-error-0__2026-10-18_00-46-00.log", { size: 2000, ageMs: HOUR });
  // Expired / fresh rotated copies.
  s.put(s.logs, "health-web-out-0__2026-10-01_00-00-00.log.gz", { ageMs: 17 * DAY, size: 4096 });
  s.put(s.logs, "health-web-out-0__2026-10-15_00-00-00.log", { ageMs: 3 * DAY });
  // A previous PM2 instance's leftovers: one old, one recent.
  s.put(s.logs, "health-web-out-1.log", { ageMs: 10 * DAY, size: 2048 });
  s.put(s.logs, "health-web-error-1.log", { ageMs: 2 * DAY });
  // pm2-logrotate's own log.
  s.put(s.logs, "pm2-logrotate-out.log", { ageMs: 30 * DAY, size: 1024 });
  // The other app and unrelated files, all ancient.
  const untouchedNames = ["mall-out-1.log", "mall-error-1.log", "mall-out-1__2026-01-01_00-00-00.log", "random.txt", "health-web-out-0.log.bak"];
  const untouched = untouchedNames.map((name) => [s.put(s.logs, name, { size: 700, ageMs: 400 * DAY }), 700]);
  // A directory whose name looks managed.
  mkdirSync(path.join(s.logs, "health-web-out-5__2026-01-01_00-00-00.log"));
  utimesSync(path.join(s.logs, "health-web-out-5__2026-01-01_00-00-00.log"), new Date(NOW - 400 * DAY), new Date(NOW - 400 * DAY));
  // Symlinks with managed-looking names pointing outside the log directory.
  let symlinksWork = true;
  try {
    symlinkSync(precious, path.join(s.logs, "health-web-out-7__2026-01-01_00-00-00.log"));
    symlinkSync(preciousDir, path.join(s.logs, "health-web-error-8__2026-01-01_00-00-00.log"), "dir");
    symlinkSync(precious, path.join(s.logs, "health-web-out-9.log"));
    symlinkSync(precious, path.join(s.logs, "pm2-logrotate-error.log"));
  } catch {
    symlinksWork = false; // Windows without developer mode: cannot create symlinks
  }
  // A junction needs no privilege on Windows and lstat reports it as a symlink (on POSIX it is a plain symlink).
  const junction = path.join(s.logs, "health-web-error-6__2026-01-01_00-00-00.log");
  let junctionWorks = true;
  try {
    symlinkSync(preciousDir, junction, "junction");
  } catch {
    junctionWorks = false;
  }
  // ~/.pm2 itself: pm2.log is big, one rotated copy is expired, and the rest must not be touched.
  s.put(s.pm2, "pm2.log", { size: 9 * MiB, ageMs: 0 });
  s.put(s.pm2, "pm2__2026-09-01_00-00-00.log", { ageMs: 40 * DAY, size: 5000 });
  const pm2Untouched = ["dump.pm2", "dump.pm2.bak", "pm2.pid", "rpc.sock", "module_conf.json", "mall-out-0.log"].map((name) => [
    s.put(s.pm2, name, { size: 50, ageMs: 400 * DAY }),
    50,
  ]);
  const moduleFile = [s.put(path.join(s.pm2, "modules"), "pm2-logrotate.js", { size: 50, ageMs: 400 * DAY }), 50];

  const { summary, lines } = await run(s);

  assert.deepEqual(summary.errors, []);
  assert.deepEqual(summary.rotated.sort(), [
    "logs/health-web-out-0.log -> health-web-out-0__2026-10-18_01-46-00.log",
    "root/pm2.log -> pm2__2026-10-18_01-46-00.log",
  ]);
  assert.deepEqual(summary.deleted.sort(), [
    "logs/health-web-out-0__2026-10-01_00-00-00.log.gz",
    "logs/health-web-out-1.log",
    "logs/pm2-logrotate-out.log",
    "root/pm2__2026-09-01_00-00-00.log",
  ]);
  assert.equal(summary.freedMB, Math.round(((4096 + 2048 + 1024 + 5000) / 1048576) * 100) / 100);
  assert.ok(summary.skipped > 0);
  assert.equal(summary.event, "pm2_log_retention");
  assert.equal(summary.ts, new Date(NOW).toISOString());

  // Rotation: the original is emptied in place, the copy holds everything and is dated now.
  assert.equal(statSync(path.join(s.logs, "health-web-out-0.log")).size, 0);
  const copy = path.join(s.logs, "health-web-out-0__2026-10-18_01-46-00.log");
  assert.equal(statSync(copy).size, 9 * MiB);
  assert.ok(Math.abs(statSync(copy).mtimeMs - NOW) < 2000, "the copy's mtime is the rotation time (starts its 7-day clock)");
  assert.equal(statSync(path.join(s.pm2, "pm2.log")).size, 0);
  assert.equal(statSync(path.join(s.pm2, "pm2__2026-10-18_01-46-00.log")).size, 9 * MiB);
  // The small error log was rotated an hour ago: left as it is.
  assert.equal(statSync(path.join(s.logs, "health-web-error-0.log")).size, 2000);
  assert.ok(!existsSync(path.join(s.logs, "health-web-error-0__2026-10-18_01-46-00.log")));

  // Deleted: exactly the expired managed files.
  for (const gone of ["health-web-out-0__2026-10-01_00-00-00.log.gz", "health-web-out-1.log", "pm2-logrotate-out.log"]) {
    assert.ok(!existsSync(path.join(s.logs, gone)), gone);
  }
  assert.ok(!existsSync(path.join(s.pm2, "pm2__2026-09-01_00-00-00.log")));
  // Kept: fresh rotated copies, a recent leftover, the live logs.
  for (const kept of ["health-web-out-0__2026-10-15_00-00-00.log", "health-web-error-1.log", "health-web-error-0__2026-10-18_00-46-00.log", "health-web-out-0.log", "health-web-error-0.log"]) {
    assert.ok(existsSync(path.join(s.logs, kept)), kept);
  }
  // Never touched: mall, unknown names, everything else under ~/.pm2, the directory with a managed-looking name.
  for (const [untouchedFile, expectedSize] of [...untouched, ...pm2Untouched, moduleFile]) {
    assert.ok(existsSync(untouchedFile), untouchedFile);
    assert.equal(statSync(untouchedFile).size, expectedSize, untouchedFile);
  }
  assert.ok(lstatSync(path.join(s.logs, "health-web-out-5__2026-01-01_00-00-00.log")).isDirectory());
  assert.equal(readFileSync(precious, "utf8"), "keep me", "a symlink must never lead the job to a file outside the log directory");
  assert.equal(readFileSync(path.join(preciousDir, "inside.txt"), "utf8"), "keep me too");
  if (junctionWorks) {
    assert.ok(lstatSync(junction).isSymbolicLink(), "a link with a managed-looking, expired name is left alone");
  }
  assert.ok(symlinksWork || junctionWorks || process.platform === "win32", "at least one kind of link was exercised (Windows without privileges may only manage a junction)");
  if (symlinksWork) {
    for (const link of ["health-web-out-7__2026-01-01_00-00-00.log", "health-web-error-8__2026-01-01_00-00-00.log", "health-web-out-9.log", "pm2-logrotate-error.log"]) {
      assert.ok(lstatSync(path.join(s.logs, link)).isSymbolicLink(), `${link} is still the symlink it was`);
    }
  }

  // Exactly one JSON summary line was printed, and it is the returned summary.
  assert.equal(lines.length, 1);
  assert.deepEqual(JSON.parse(lines[0]), summary);
  assert.ok(lines[0].startsWith('{"event":"pm2_log_retention",'));
  assert.ok(!lines[0].includes("\n"));

  // A second pass the same minute has nothing left to do (the live log is empty now, the copies are fresh).
  const again = await run(s);
  assert.deepEqual(again.summary.rotated, []);
  assert.deepEqual(again.summary.deleted, []);
  assert.deepEqual(again.summary.errors, []);
  assert.equal(again.summary.freedMB, 0);
});

test("executor: when the live log files cannot be resolved nothing is rotated and no leftover is deleted, but expired rotations still are", async () => {
  for (const readActiveTargets of [
    () => ({ stdout: "pipe:[1]", stderr: "pipe:[2]" }),
    () => ({ stdout: null, stderr: null }),
  ]) {
    const s = makeSandbox();
    s.put(s.logs, "health-web-out-0.log", { size: 9 * MiB });
    s.put(s.logs, "health-web-error-0.log", { size: 100, ageMs: 40 * DAY }); // the quiet live error log: indistinguishable from a leftover
    s.put(s.logs, "health-web-out-1.log", { size: 100, ageMs: 40 * DAY });
    s.put(s.logs, "health-web-out-0__2026-10-01_00-00-00.log", { ageMs: 17 * DAY });

    const { summary } = await run(s, { readActiveTargets });
    assert.deepEqual(summary.rotated, [], "never guess which file is live");
    assert.deepEqual(summary.deleted, ["logs/health-web-out-0__2026-10-01_00-00-00.log"], "expired rotations do not need the live files");
    assert.ok(existsSync(path.join(s.logs, "health-web-error-0.log")), "an idle live error log must survive");
    assert.ok(existsSync(path.join(s.logs, "health-web-out-1.log")), "no leftover is deleted unless both live files were resolved");
    assert.equal(statSync(path.join(s.logs, "health-web-out-0.log")).size, 9 * MiB);
  }

  // Only stdout resolved: that file is known to be live (so it is rotated), but nothing counts as a leftover.
  const s = makeSandbox();
  s.put(s.logs, "health-web-out-0.log", { size: 9 * MiB });
  s.put(s.logs, "health-web-error-0.log", { size: 100, ageMs: 40 * DAY });
  s.put(s.logs, "health-web-out-1.log", { size: 100, ageMs: 40 * DAY });
  const { summary } = await run(s, { readActiveTargets: () => ({ stdout: path.join(s.logs, "health-web-out-0.log"), stderr: "pipe:[2]" }) });
  assert.deepEqual(summary.rotated, ["logs/health-web-out-0.log -> health-web-out-0__2026-10-18_01-46-00.log"]);
  assert.deepEqual(summary.deleted, []);
  assert.ok(existsSync(path.join(s.logs, "health-web-error-0.log")));
  assert.ok(existsSync(path.join(s.logs, "health-web-out-1.log")));
});

test("executor: an existing rotated copy is never overwritten, and the original is left whole when the copy fails", async () => {
  const s = makeSandbox();
  s.put(s.logs, "health-web-out-0.log", { size: 9 * MiB });
  s.put(s.logs, "health-web-out-0__2026-10-18_01-46-00.log", { size: 77, ageMs: 0, content: "do not overwrite me" });
  const { summary } = await run(s);
  assert.deepEqual(summary.rotated, []);
  assert.equal(summary.errors.length, 1);
  assert.match(summary.errors[0], /^rotate logs\/health-web-out-0\.log: EEXIST$/);
  assert.equal(statSync(path.join(s.logs, "health-web-out-0.log")).size, 9 * MiB, "not truncated: no copy was made");
  assert.equal(readFileSync(path.join(s.logs, "health-web-out-0__2026-10-18_01-46-00.log"), "utf8"), "do not overwrite me");
});

test("executor: it never throws - a missing or unusable log directory is reported, not raised", async () => {
  const s = makeSandbox();
  const missing = await runPm2LogRetention({ logDir: path.join(s.base, "nope", "logs"), now: () => NOW, write: () => {}, readActiveTargets: () => ({ stdout: null, stderr: null }) });
  assert.deepEqual(missing.errors, []);
  assert.deepEqual(missing.rotated, []);

  const notADirectory = path.join(s.base, "afile");
  writeFileSync(notADirectory, "x");
  const broken = await runPm2LogRetention({ logDir: notADirectory, now: () => NOW, write: () => {}, readActiveTargets: () => ({ stdout: null, stderr: null }) });
  assert.equal(broken.errors.length, 1);
  assert.match(broken.errors[0], /^run: /);

  const throwingTargets = await runPm2LogRetention({
    logDir: s.logs,
    now: () => NOW,
    write: () => {
      throw new Error("sink is gone");
    },
    readActiveTargets: () => {
      throw new Error("no /proc");
    },
  });
  assert.equal(throwingTargets.event, "pm2_log_retention");
  assert.equal(throwingTargets.errors.length, 1, "a throwing target reader is recorded as the run's error");
});

test("executor: ~/.pm2 itself is consulted only when the log directory is named `logs`", async () => {
  const s = makeSandbox();
  const odd = path.join(s.base, "elsewhere");
  mkdirSync(odd);
  // A pm2.log NEXT TO an arbitrary directory is none of our business.
  const stray = path.join(s.base, "pm2.log");
  writeFileSync(stray, "");
  truncateSync(stray, 9 * MiB);
  const summary = await runPm2LogRetention({ logDir: odd, now: () => NOW, write: () => {}, readActiveTargets: () => ({ stdout: null, stderr: null }) });
  assert.deepEqual(summary.errors, []);
  assert.deepEqual(summary.rotated, []);
  assert.equal(statSync(stray).size, 9 * MiB);
  assert.ok(!existsSync(path.join(s.base, "pm2__2026-10-18_01-46-00.log")));
});

test("executor: with the real /proc readers on this platform it still returns a summary and never throws", async () => {
  const s = makeSandbox();
  s.put(s.logs, "health-web-out-0__2026-10-01_00-00-00.log", { ageMs: 17 * DAY });
  const lines = [];
  const summary = await runPm2LogRetention({ logDir: s.logs, now: () => NOW, write: (l) => lines.push(l) });
  // Here (not under PM2) stdout/stderr are not health-web logs, so nothing is rotated; the expired copy still goes.
  assert.deepEqual(summary.rotated, []);
  assert.deepEqual(summary.deleted, ["logs/health-web-out-0__2026-10-01_00-00-00.log"]);
  assert.equal(lines.length, 1);
});

// --- registration ---------------------------------------------------------------------------------

test("registerJobs.ts runs the retention job daily through runGuarded, and the collision lint's baseline did not grow", () => {
  const registerJobs = readFileSync(new URL("../cron/registerJobs.ts", import.meta.url), "utf8");
  assert.match(registerJobs, /import \{ runPm2LogRetention \} from "@\/lib\/server\/logging\/pm2LogRetention";/);
  assert.match(
    registerJobs,
    /cron\.schedule\(\s*"46 1 \* \* \*",\s*runGuarded\("pm2-log-retention-cron\.log", \(\) => runPm2LogRetention\(\)\),\s*\);/,
  );
  const lint = readFileSync(new URL("../cron/cronCollisions.test.mjs", import.meta.url), "utf8");
  assert.ok(!lint.includes("pm2-log-retention"), "a new job must pick a free minute, not extend LEGACY_BASELINE_COLLISIONS");
});
