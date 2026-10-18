import test, { afterEach } from "node:test";
import assert from "node:assert/strict";

// #709 (2026-10-18): the account has only 1 GB of physical memory (CloudLinux PMEM), an
// hour averages 580-730 MB, so the SIGKILLs come from short peaks. These tests cover what
// was added to procResourceLogger.ts to see them and say who caused them: per-process
// breakdown + labels, the 15-second peak sampler, and the proc_resources_spike line.

const {
  PROC_RESOURCE_LINE_MAX_CHARS,
  buildProcBreakdown,
  buildProcResourceSample,
  buildSpikeSample,
  classifyProcess,
  createPeakTracker,
  parseProcessDetail,
  peekEventLoopDelayMaxMs,
  readEventLoopDelay,
  readProcIdentity,
  resolveSpikeThresholdMb,
  scanAccountProcesses,
  serializeWithinBudget,
  startProcResourceLogger,
  stopProcResourceLogger,
} = await import("./procResourceLogger.ts");

afterEach(() => {
  stopProcResourceLogger();
});

const MB = 1024; // kB per MB
const OUR_UID = 1001;

/** A /proc/<pid>/status with the lines the breakdown reads. Fields left undefined are omitted. */
const detailStatus = ({ uid = OUR_UID, name = "node", rssKb, hwmKb, threads }) =>
  [
    `Name:\t${name}`,
    "State:\tS (sleeping)",
    `Uid:\t${uid}\t${uid}\t${uid}\t${uid}`,
    ...(hwmKb === undefined ? [] : [`VmHWM:\t ${hwmKb} kB`]),
    ...(rssKb === undefined ? [] : [`VmRSS:\t ${rssKb} kB`]),
    ...(threads === undefined ? [] : [`Threads:\t${threads}`]),
    "",
  ].join("\n");

const enoent = (path) => Object.assign(new Error(`ENOENT: ${path}`), { code: "ENOENT" });

/** A fake /proc for `procs` (mutable: the tests change rssKb between ticks). Our own pid is 4242. */
const fakeAccount = (procs) => ({
  readText: (path) => {
    if (path === "/proc/self/status") return detailStatus({ name: "next-server (v1", rssKb: 1 });
    const match = /^\/proc\/(\d+)\/(status|cmdline)$/.exec(path);
    const proc = match && procs.find((p) => String(p.pid) === match[1] && !p.gone);
    if (!proc) throw enoent(path);
    if (match[2] === "cmdline") {
      if (proc.cmdline === undefined) throw enoent(path);
      return proc.cmdline;
    }
    return detailStatus(proc);
  },
  listDir: (path) => {
    if (path !== "/proc") throw new Error("unexpected dir");
    return ["self", "loadavg", ...procs.map((p) => String(p.pid)), "thread-self"];
  },
  readLink: (path) => {
    const match = /^\/proc\/(\d+)\/cwd$/.exec(path);
    const proc = match && procs.find((p) => String(p.pid) === match[1] && !p.gone);
    if (!proc || proc.cwd === undefined) throw enoent(path);
    return proc.cwd;
  },
});

/** The five kinds of process that share the account, with RSS in MB. */
const accountProcs = ({ web = 400, mall = 100, daemon = 50, logrotate = 45, lsphp = 20 } = {}) => [
  { pid: 4242, name: "next-server (v1", rssKb: web * MB, hwmKb: (web + 40) * MB, threads: 11, cmdline: "next-server (v16.3.6)\0", cwd: "/home/tw123457/health_app" },
  { pid: 5001, name: "next-server (v1", rssKb: mall * MB, hwmKb: (mall + 10) * MB, threads: 9, cmdline: "next-server (v16.3.6)\0", cwd: "/home/tw123457/mall_app" },
  { pid: 900, name: "PM2 v7.0.3: God", rssKb: daemon * MB, hwmKb: (daemon + 5) * MB, threads: 10, cmdline: "PM2 v7.0.3: God Daemon (/home/tw123457/.pm2)\0", cwd: "/home/tw123457/health_app" },
  { pid: 901, name: "node", rssKb: logrotate * MB, hwmKb: (logrotate + 5) * MB, threads: 10, cmdline: "node\0/home/tw123457/.pm2/modules/pm2-logrotate/node_modules/pm2-logrotate/app.js\0", cwd: "/home/tw123457/health_app" },
  { pid: 7000, name: "lsphp", rssKb: lsphp * MB, hwmKb: lsphp * MB, threads: 1, cmdline: "lsphp\0", cwd: "/home/tw123457/health_app" },
  // Someone else's process never counts, however big.
  { pid: 1, uid: 0, name: "systemd", rssKb: 99_999 * MB, hwmKb: 99_999 * MB, threads: 1 },
];

// --- classifyProcess ------------------------------------------------------------

test("classifyProcess: the account's five kinds of process, including the cwd traps", () => {
  const cases = [
    // [expected, input]
    ["health-web", { name: "next-server (v1", cmdline: "next-server (v16.3.6)\0", cwd: "/home/tw123457/health_app" }],
    ["mall", { name: "next-server (v1", cmdline: "next-server (v16.3.6)\0", cwd: "/home/tw123457/mall_app" }],
    // The God Daemon and a pm2 module may well have the app directory as their cwd: command wins over cwd.
    ["pm2-daemon", { name: "PM2 v7.0.3: God", cmdline: "PM2 v7.0.3: God Daemon (/home/tw123457/.pm2)\0", cwd: "/home/tw123457/health_app" }],
    ["pm2-daemon", { name: "node", cmdline: "God Daemon", cwd: null }],
    ["pm2-module", { name: "node", cmdline: "node\0/home/tw123457/.pm2/modules/pm2-logrotate/node_modules/pm2-logrotate/app.js\0", cwd: "/home/tw123457/health_app" }],
    ["pm2-module", { name: "pm2-logrotate", cmdline: null, cwd: null }],
    ["pm2-cli", { name: "node", cmdline: "node\0/home/tw123457/.nvm/versions/node/v20.20.2/bin/pm2\0jlist\0", cwd: "/home/tw123457/health_app" }],
    ["lsphp", { name: "lsphp", cmdline: "lsphp\0", cwd: "/home/tw123457/health_app" }],
    ["deploy", { name: "tar", cmdline: "tar\0-xzf\0prebuilt.tgz\0", cwd: "/home/tw123457/health_app" }],
    ["deploy", { name: "gzip", cmdline: "gzip\0-d\0", cwd: "/home/tw123457/health_app" }],
    ["deploy", { name: "sh", cmdline: "sh\0-lc\0cd /home/tw123457/health_app && ./apply.sh\0", cwd: "/home/tw123457" }],
    ["deploy", { name: "bash", cmdline: "bash\0-lc\0cd /home/tw123457/health_app && ./apply.sh\0", cwd: "/home/tw123457/health_app" }],
  ];
  for (const [expected, input] of cases) {
    assert.equal(classifyProcess(input), expected, JSON.stringify(input));
  }
});

test("classifyProcess: anything else is labelled by comm (first word, <= 16 chars); unreadable everything is 'unknown'", () => {
  assert.equal(classifyProcess({ name: "bash", cmdline: "-bash\0", cwd: "/home/tw123457" }), "bash");
  assert.equal(classifyProcess({ name: "sh", cmdline: "sh\0-c\0echo hi\0", cwd: "/home/tw123457" }), "sh");
  assert.equal(classifyProcess({ name: "php", cmdline: "php\0artisan\0", cwd: null }), "php");
  // A Next process whose cwd could not be read: ambiguous between health-web and mall, so it says what it is.
  assert.equal(classifyProcess({ name: "next-server (v1", cmdline: null, cwd: null }), "next-server");
  assert.equal(classifyProcess({ name: "a-very-long-process-name-indeed", cmdline: null, cwd: null }).length, 16);
  assert.equal(classifyProcess({ name: null, cmdline: null, cwd: null }), "unknown");
  assert.equal(classifyProcess({ name: "(sd-pam)", cmdline: null, cwd: null }), "unknown");
  // Garbage in, no exception out.
  for (const input of [{}, { name: 5, cmdline: {}, cwd: [] }, { name: "x", cmdline: undefined, cwd: undefined }]) {
    assert.doesNotThrow(() => classifyProcess(input));
  }
});

test("classifyProcess: look-alikes do not fool it (PM2_HOME is not PM2, lowercase pm2 inside a word is not the CLI)", () => {
  assert.equal(classifyProcess({ name: "node", cmdline: "node\0server.js\0PM2_HOME=/x\0", cwd: "/home/tw123457/health_app" }), "health-web");
  assert.equal(classifyProcess({ name: "node", cmdline: "node\0/home/u/bin/mypm2tool\0", cwd: null }), "node");
});

// --- parsing and scanning ---------------------------------------------------------

test("parseProcessDetail: comm, uid, VmRSS, VmHWM and Threads from one /proc/<pid>/status", () => {
  assert.deepEqual(parseProcessDetail(detailStatus({ name: "next-server (v1", rssKb: 524288, hwmKb: 645120, threads: 11 })), {
    uid: OUR_UID,
    rssKb: 524288,
    threads: 11,
    name: "next-server (v1",
    hwmKb: 645120,
  });
  // VmHWM is not mistaken for anything else, and vice versa.
  assert.equal(parseProcessDetail("Uid:\t1\t1\t1\t1\nVmRSS:\t 4 kB\n").hwmKb, null);
  assert.equal(parseProcessDetail("Name:\tx\nVmHWM:\t 4 kB\n").rssKb, null);
  for (const input of ["", "garbage", undefined, null, 7]) {
    assert.doesNotThrow(() => parseProcessDetail(input));
    assert.deepEqual(parseProcessDetail(input), { uid: null, rssKb: null, threads: null, name: null, hwmKb: null });
  }
});

test("scanAccountProcesses: one walk, only our uid, pids as numbers, vanished processes skipped", () => {
  const procs = accountProcs();
  procs.push({ pid: 8000, name: "gone", rssKb: 1, gone: true });
  const scan = scanAccountProcesses(fakeAccount(procs));
  assert.equal(scan.uid, OUR_UID);
  assert.deepEqual(
    scan.processes.map((p) => p.pid).sort((a, b) => a - b),
    [900, 901, 4242, 5001, 7000],
  );
  const web = scan.processes.find((p) => p.pid === 4242);
  assert.deepEqual(web, { pid: 4242, uid: OUR_UID, name: "next-server (v1", rssKb: 400 * MB, hwmKb: 440 * MB, threads: 11 });

  const nothing = { readText: () => { throw enoent("x"); }, listDir: () => { throw enoent("x"); } };
  assert.equal(scanAccountProcesses(nothing), null);
  assert.equal(scanAccountProcesses({ ...fakeAccount([]), readText: () => "Name:\tnode\n" }), null, "no Uid line");
});

test("readProcIdentity: cmdline and cwd, each null on its own when unreadable", () => {
  const io = fakeAccount([
    { pid: 10, rssKb: 1, cmdline: "x\0y\0", cwd: "/home/tw123457/health_app" },
    { pid: 11, rssKb: 1, cmdline: "x\0" }, // cwd unreadable
    { pid: 12, rssKb: 1, cwd: "/tmp" }, // cmdline unreadable
  ]);
  assert.deepEqual(readProcIdentity(10, io), { cmdline: "x\0y\0", cwd: "/home/tw123457/health_app" });
  assert.deepEqual(readProcIdentity(11, io), { cmdline: "x\0", cwd: null });
  assert.deepEqual(readProcIdentity(12, io), { cmdline: null, cwd: "/tmp" });
  assert.deepEqual(readProcIdentity(13, io), { cmdline: null, cwd: null });
  // An io without readLink at all (the old ProcIo shape) is fine too.
  assert.deepEqual(readProcIdentity(10, { readText: io.readText, listDir: io.listDir }), { cmdline: "x\0y\0", cwd: null });
});

// --- the breakdown ------------------------------------------------------------------

test("buildProcBreakdown: top 6 by RSS, labelled, zombies left out, an unreadable identity falls back to comm", () => {
  const io = fakeAccount(accountProcs({ web: 560, mall: 140, daemon: 60, logrotate: 50, lsphp: 20 }));
  const records = scanAccountProcesses(io).processes;
  const breakdown = buildProcBreakdown(records, (pid) => readProcIdentity(pid, io));
  assert.deepEqual(breakdown, [
    { pid: 4242, label: "health-web", rssMB: 560, hwmMB: 600 },
    { pid: 5001, label: "mall", rssMB: 140, hwmMB: 150 },
    { pid: 900, label: "pm2-daemon", rssMB: 60, hwmMB: 65 },
    { pid: 901, label: "pm2-module", rssMB: 50, hwmMB: 55 },
    { pid: 7000, label: "lsphp", rssMB: 20, hwmMB: 20 },
  ]);

  // More than 6 processes: only the 6 biggest are kept, and a process with no VmRSS (zombie) never appears.
  const many = Array.from({ length: 9 }, (_, i) => ({ pid: 100 + i, name: `p${i}`, rssKb: (i + 1) * MB, hwmKb: (i + 2) * MB }));
  many.push({ pid: 200, name: "zombie", rssKb: undefined });
  const capped = buildProcBreakdown(scanAccountProcesses(fakeAccount(many)).processes, () => ({ cmdline: null, cwd: null }));
  assert.deepEqual(capped.map((e) => e.pid), [108, 107, 106, 105, 104, 103]);
  assert.ok(capped.every((e) => e.label.startsWith("p")), "no identity -> comm label");

  // The identity reader throwing (process gone) must not drop the entry.
  const survived = buildProcBreakdown(records, () => {
    throw new Error("gone");
  });
  assert.equal(survived.length, 5);
  assert.equal(survived[0].label, "next-server");
  assert.deepEqual(buildProcBreakdown([], () => ({ cmdline: null, cwd: null })), []);
});

// --- the peak tracker -----------------------------------------------------------------

test("createPeakTracker: keeps the highest account sum with its time and breakdown, reads the breakdown only for a new peak", () => {
  const tracker = createPeakTracker();
  let breakdownReads = 0;
  const observe = (atMs, acctRssKb, ownRssKb, label) =>
    tracker.observe({
      atMs,
      acctRssKb,
      ownRssKb,
      breakdown: () => {
        breakdownReads += 1;
        return [{ pid: 1, label, rssMB: acctRssKb / MB, hwmMB: null }];
      },
    });

  assert.equal(observe(1000, 600 * MB, 400 * MB, "first"), true);
  assert.equal(observe(2000, 900 * MB, 500 * MB, "peak"), true);
  assert.equal(observe(3000, 700 * MB, 650 * MB, "lower"), false, "a lower sum is not a peak");
  assert.equal(observe(4000, 900 * MB, 420 * MB, "tie"), false, "a tie keeps the earlier time");
  assert.equal(breakdownReads, 2, "cmdline / cwd are read only when a new peak is set");

  const window = tracker.take();
  assert.deepEqual(window, {
    acctRssPeakMB: 900,
    acctRssPeakAt: new Date(2000).toISOString(),
    // The process's own peak is tracked independently: it peaked at a different moment (3000).
    ownRssPeakMB: 650,
    peakProcs: [{ pid: 1, label: "peak", rssMB: 900, hwmMB: null }],
  });

  // take() starts a fresh window.
  assert.deepEqual(tracker.take(), { acctRssPeakMB: null, acctRssPeakAt: null, ownRssPeakMB: null, peakProcs: [] });
  assert.equal(observe(5000, 100 * MB, 50 * MB, "next"), true, "a fresh window has no high to beat");
  assert.equal(tracker.take().acctRssPeakMB, 100);
});

test("createPeakTracker: null readings and a throwing breakdown never throw", () => {
  const tracker = createPeakTracker();
  assert.equal(tracker.observe({ atMs: 1, acctRssKb: null, ownRssKb: null, breakdown: () => [] }), false);
  assert.equal(
    tracker.observe({
      atMs: 2,
      acctRssKb: 5 * MB,
      ownRssKb: null,
      breakdown: () => {
        throw new Error("cmdline gone");
      },
    }),
    true,
  );
  const window = tracker.take();
  assert.equal(window.acctRssPeakMB, 5);
  assert.deepEqual(window.peakProcs, []);
  assert.equal(window.ownRssPeakMB, null);
  // A nonsense clock must not cost the window.
  tracker.observe({ atMs: Number.NaN, acctRssKb: 9 * MB, ownRssKb: 9 * MB, breakdown: () => [] });
  assert.doesNotThrow(() => tracker.take());
});

// --- threshold, budget, event-loop peek ---------------------------------------------------

test("resolveSpikeThresholdMb: 800 by default, PROC_RESOURCE_SPIKE_MB overrides, junk falls back", () => {
  assert.equal(resolveSpikeThresholdMb({}), 800);
  assert.equal(resolveSpikeThresholdMb({ PROC_RESOURCE_SPIKE_MB: "650" }), 650);
  assert.equal(resolveSpikeThresholdMb({ PROC_RESOURCE_SPIKE_MB: " 700.5 " }), 700.5);
  for (const junk of ["", "  ", "abc", "0", "-5", "NaN", "Infinity"]) {
    assert.equal(resolveSpikeThresholdMb({ PROC_RESOURCE_SPIKE_MB: junk }), 800, JSON.stringify(junk));
  }
});

test("serializeWithinBudget: untouched when it fits; otherwise the named arrays are cut, nothing else", () => {
  const entry = { pid: 1234, label: "health-web", rssMB: 512.4, hwmMB: 645.1 };
  const sample = {
    event: "proc_resources",
    rssMB: 512.4,
    activeJobs: ["a", "b"],
    peakProcs: Array.from({ length: 6 }, () => entry),
    procs: Array.from({ length: 6 }, () => entry),
  };
  const full = JSON.stringify(sample);
  assert.equal(serializeWithinBudget(sample, ["peakProcs", "procs"], full.length), full, "exactly at the budget: unchanged");

  const cut = JSON.parse(serializeWithinBudget(sample, ["peakProcs", "procs"], full.length - 1));
  assert.equal(cut.peakProcs.length, 3, "first named key is cut first");
  assert.equal(cut.procs.length, 6);
  assert.equal(cut.rssMB, 512.4);
  assert.deepEqual(cut.activeJobs, ["a", "b"]);

  const tight = JSON.parse(serializeWithinBudget(sample, ["peakProcs", "procs"], 100));
  assert.deepEqual(tight.peakProcs, []);
  assert.deepEqual(tight.procs, []);
  assert.equal(tight.event, "proc_resources");
  assert.equal(sample.peakProcs.length, 6, "the input object is not mutated");
});

test("a realistic five-minute line (6 + 6 entries, a few active jobs) stays near 1.4 KB and always under the 2000-char cap", () => {
  const io = fakeAccount(accountProcs({ web: 560, mall: 140, daemon: 60, logrotate: 50, lsphp: 20 }));
  const scan = scanAccountProcesses(io);
  // Pad to the full six rows with extra shells.
  scan.processes.push({ pid: 31000, uid: OUR_UID, name: "bash", rssKb: 4 * MB, hwmKb: 5 * MB, threads: 1 });
  const tracker = createPeakTracker();
  tracker.observe({
    atMs: Date.UTC(2026, 9, 18, 3, 2, 45),
    acctRssKb: 870 * MB,
    ownRssKb: 600 * MB,
    breakdown: () => buildProcBreakdown(scan.processes, (pid) => readProcIdentity(pid, io)),
  });
  const sample = buildProcResourceSample({
    now: () => Date.UTC(2026, 9, 18, 3, 5, 0),
    pid: 4242,
    uptimeSeconds: () => 1803,
    memoryUsage: () => ({ rss: 536870912, heapTotal: 213909504, heapUsed: 148062208, external: 23726080, arrayBuffers: 9542041 }),
    readProcStatus: () => ({ vmSizeMB: 1731.5, vmPeakMB: 1811.2, vmRssMB: 512.4, vmDataMB: 1020.7, threads: 11 }),
    countOpenFds: () => 38,
    readLoadAvg1: () => 9.84,
    delayMonitor: null,
    extraFields: () => ({ activeJobs: ["rss-sync", "news-card-images", "aqi-sync"] }),
    scanProcesses: () => scan,
    readIdentity: (pid) => readProcIdentity(pid, io),
    peakTracker: tracker,
  });
  assert.equal(sample.procs.length, 6);
  assert.equal(sample.peakProcs.length, 6);
  const line = serializeWithinBudget(sample, ["peakProcs", "procs", "activeJobs"]);
  assert.ok(line.length > 1000 && line.length < 1700, `unexpected line length ${line.length}`);
  assert.equal(line, JSON.stringify(sample), "no trimming needed at this size");
  assert.ok(PROC_RESOURCE_LINE_MAX_CHARS <= 2000);

  // A pathological pile of active jobs is trimmed, but the line still never passes the cap.
  const jobs = Array.from({ length: 40 }, (_, i) => `a-rather-long-cron-job-name-number-${i}`);
  const bloated = serializeWithinBudget({ ...sample, activeJobs: jobs }, ["peakProcs", "procs", "activeJobs"]);
  assert.ok(bloated.length <= PROC_RESOURCE_LINE_MAX_CHARS, `bloated line is ${bloated.length} chars`);
  assert.equal(JSON.parse(bloated).rssMB, 512, "plain fields are never touched");
  assert.equal(JSON.parse(bloated).acctProcs, sample.acctProcs);
});

test("peekEventLoopDelayMaxMs: the worst delay since the last reset, WITHOUT resetting it; null when empty", () => {
  let resets = 0;
  const monitor = (count, maxNs) => ({ enable() {}, disable() {}, reset: () => (resets += 1), count, max: maxNs, percentile: () => 0 });
  assert.equal(peekEventLoopDelayMaxMs(monitor(15000, 61_700_000), 20), 41.7);
  assert.equal(peekEventLoopDelayMaxMs(monitor(15000, 20_000_000), 20), 0, "never negative");
  assert.equal(peekEventLoopDelayMaxMs(monitor(0, 0), 20), null);
  assert.equal(peekEventLoopDelayMaxMs(null), null);
  assert.equal(
    peekEventLoopDelayMaxMs({ enable() {}, disable() {}, reset() {}, get count() { throw new Error("gone"); }, max: 0, percentile: () => 0 }),
    null,
  );
  assert.equal(resets, 0, "peeking must not steal the five-minute line's data");
  // ...whereas the five-minute reader resets, as before.
  readEventLoopDelay(monitor(1, 30_000_000), 20);
  assert.equal(resets, 1);
});

test("buildSpikeSample: the documented shape, in order; activeJobs null when the caller has none", () => {
  const io = fakeAccount(accountProcs({ web: 700 }));
  const scan = scanAccountProcesses(io);
  const breakdown = buildProcBreakdown(scan.processes, (pid) => readProcIdentity(pid, io));
  const spike = buildSpikeSample({
    nowMs: Date.UTC(2026, 9, 18, 3, 2, 45),
    scan,
    ownPid: 4242,
    breakdown,
    extra: { activeJobs: ["rss-sync"] },
    eventLoopDelayMaxMs: 41.7,
  });
  assert.deepEqual(Object.keys(spike), ["event", "ts", "acctRssMB", "ownRssMB", "procs", "activeJobs", "eventLoopDelayMaxMs"]);
  assert.equal(spike.event, "proc_resources_spike");
  assert.equal(spike.ts, "2026-10-18T03:02:45.000Z");
  assert.equal(spike.acctRssMB, 915); // 700 + 100 + 50 + 45 + 20
  assert.equal(spike.ownRssMB, 700);
  assert.deepEqual(spike.activeJobs, ["rss-sync"]);
  assert.equal(spike.eventLoopDelayMaxMs, 41.7);
  assert.equal(spike.procs[0].label, "health-web");

  const bare = buildSpikeSample({ nowMs: 0, scan, ownPid: 99999, breakdown: [], extra: undefined, eventLoopDelayMaxMs: null });
  assert.equal(bare.activeJobs, null);
  assert.equal(bare.ownRssMB, null);
});

// --- the logger end to end ---------------------------------------------------------------------

const fakeTimers = () => {
  const intervals = [];
  return {
    intervals,
    setIntervalFn: (callback, ms) => {
      const timer = { unref() {}, hasRef: () => false };
      intervals.push({ callback, ms, timer });
      return timer;
    },
    clearIntervalFn: () => {},
  };
};

/** Starts the logger against a fake /proc and a fake clock; returns the knobs. */
const startFake = ({ procs, extraEnv = {}, ...rest }) => {
  const timers = fakeTimers();
  const lines = [];
  const clock = { ms: Date.UTC(2026, 9, 18, 3, 0, 0) };
  const io = fakeAccount(procs);
  const handle = startProcResourceLogger({
    env: { NODE_ENV: "production", ...extraEnv },
    write: (line) => lines.push(line),
    setIntervalFn: timers.setIntervalFn,
    clearIntervalFn: timers.clearIntervalFn,
    createDelayMonitor: () => null,
    now: () => clock.ms,
    pid: 4242,
    scanProcesses: () => scanAccountProcesses(io),
    readIdentity: (pid) => readProcIdentity(pid, io),
    readProcStatus: () => ({ vmSizeMB: null, vmPeakMB: null, vmRssMB: null, vmDataMB: null, threads: null }),
    countOpenFds: () => null,
    readLoadAvg1: () => null,
    extraFields: () => ({ activeJobs: ["rss-sync"] }),
    ...rest,
  });
  const parsed = () => lines.map((line) => JSON.parse(line));
  return {
    handle,
    lines,
    parsed,
    spikes: () => parsed().filter((l) => l.event === "proc_resources_spike"),
    fiveMinute: () => parsed().filter((l) => l.event === "proc_resources"),
    clock,
    /** Sets a process's RSS; its VmHWM follows it up but never down, as the kernel's does. */
    setRss: (pid, mb) => {
      const proc = procs.find((p) => p.pid === pid);
      proc.rssKb = mb * MB;
      proc.hwmKb = Math.max(proc.hwmKb, mb * MB);
    },
    fastTick: () => timers.intervals[1].callback(),
    lineTick: () => timers.intervals[0].callback(),
    timers,
  };
};

test("the 15-second sampler tracks the account peak between two lines; the next proc_resources line reports it and the window resets", () => {
  const procs = accountProcs({ web: 400, mall: 100, daemon: 50, logrotate: 45, lsphp: 20 }); // 615 MB
  const t = startFake({ procs });
  assert.equal(t.fiveMinute().length, 1, "startup line");
  assert.equal(t.spikes().length, 0);

  // Quiet, then a short peak that no 5-minute snapshot would see, then quiet again (all under 800 MB).
  t.clock.ms += 15_000;
  t.fastTick();
  t.clock.ms += 15_000;
  t.setRss(4242, 560); // 560 + 100 + 50 + 45 + 20 = 775 MB: the peak, still below the spike threshold
  t.fastTick();
  const peakAt = t.clock.ms;
  t.clock.ms += 15_000;
  t.setRss(4242, 420); // 635
  t.fastTick();
  assert.equal(t.spikes().length, 0);

  t.clock.ms += 15_000;
  t.lineTick();
  const line = t.fiveMinute().at(-1);
  assert.equal(line.acctRssPeakMB, 775);
  assert.equal(line.acctRssPeakAt, new Date(peakAt).toISOString());
  assert.equal(line.ownRssPeakMB, 560);
  assert.equal(line.ownHwmMB, 560, "VmHWM of this process: its own high-water mark, which stays at the peak after RSS drops");
  assert.equal(line.peakProcs[0].label, "health-web");
  assert.equal(line.peakProcs[0].rssMB, 560, "the breakdown AT the peak, not at the line");
  assert.equal(line.procs[0].rssMB, 420, "this line's own sample");
  assert.deepEqual(
    line.procs.map((e) => e.label),
    ["health-web", "mall", "pm2-daemon", "pm2-module", "lsphp"],
  );
  assert.deepEqual(line.activeJobs, ["rss-sync"]);
  assert.deepEqual(Object.keys(line).slice(-7), ["activeJobs", "acctRssPeakMB", "acctRssPeakAt", "ownRssPeakMB", "ownHwmMB", "peakProcs", "procs"]);

  // The next line starts from a fresh window: with no fast tick in between it only has its own instant.
  t.clock.ms += 300_000;
  t.setRss(4242, 300);
  t.lineTick();
  const next = t.fiveMinute().at(-1);
  assert.equal(next.acctRssPeakMB, 515); // 300 + 100 + 50 + 45 + 20
  assert.equal(next.acctRssPeakAt, new Date(t.clock.ms).toISOString());
  assert.equal(next.ownRssPeakMB, 300);
});

test("proc_resources_spike: >= 800 MB writes one line immediately, then at most one per 60 s", () => {
  const procs = accountProcs({ web: 400, mall: 100, daemon: 50, logrotate: 45, lsphp: 20 });
  const t = startFake({ procs });

  t.clock.ms += 15_000;
  t.setRss(4242, 700); // 915 MB
  t.fastTick();
  assert.equal(t.spikes().length, 1, "written the moment it is seen");
  const first = t.spikes()[0];
  assert.deepEqual(Object.keys(first), ["event", "ts", "acctRssMB", "ownRssMB", "procs", "activeJobs", "eventLoopDelayMaxMs"]);
  assert.equal(first.ts, new Date(t.clock.ms).toISOString());
  assert.equal(first.acctRssMB, 915);
  assert.equal(first.ownRssMB, 700);
  assert.deepEqual(first.activeJobs, ["rss-sync"]);
  assert.equal(first.eventLoopDelayMaxMs, null, "no histogram in this test");
  assert.deepEqual(first.procs[0], { pid: 4242, label: "health-web", rssMB: 700, hwmMB: 700 });
  assert.equal(first.procs.length, 5);

  // Still above the threshold for the next 45 s: no new line.
  for (const rss of [750, 760, 720]) {
    t.clock.ms += 15_000;
    t.setRss(4242, rss);
    t.fastTick();
  }
  assert.equal(t.spikes().length, 1, "rate limited to one per 60 s");

  // 60 s after the first one it may speak again.
  t.clock.ms += 15_000;
  t.setRss(4242, 710);
  t.fastTick();
  assert.equal(t.spikes().length, 2);
  assert.equal(t.spikes()[1].ownRssMB, 710);

  // The peak window still holds the highest of all those ticks (760 + 215 = 975).
  t.lineTick();
  assert.equal(t.fiveMinute().at(-1).acctRssPeakMB, 975);
});

test("PROC_RESOURCE_SPIKE_MB moves the threshold; a lower account sum stays quiet", () => {
  const quiet = startFake({ procs: accountProcs({ web: 300 }) }); // 515 MB at start
  quiet.clock.ms += 15_000;
  quiet.setRss(4242, 500); // 715 MB
  quiet.fastTick();
  assert.equal(quiet.spikes().length, 0, "715 MB is under the default 800");
  stopProcResourceLogger();

  const eager = startFake({ procs: accountProcs({ web: 300 }), extraEnv: { PROC_RESOURCE_SPIKE_MB: "700" } });
  assert.equal(eager.spikes().length, 0, "515 MB is under 700");
  eager.clock.ms += 15_000;
  eager.setRss(4242, 500);
  eager.fastTick();
  assert.equal(eager.spikes().length, 1);
  assert.equal(eager.spikes()[0].acctRssMB, 715);
});

test("a spike seen only at the five-minute instant also gets its spike line, written just before the proc_resources line", () => {
  const t = startFake({ procs: accountProcs({ web: 400 }), extraEnv: { PROC_RESOURCE_SPIKE_MB: "600" } });
  // The startup emit already saw 615 MB >= 600.
  assert.deepEqual(t.parsed().map((l) => l.event), ["proc_resources_spike", "proc_resources"]);
});

test("the spike line carries the event-loop max since the last proc_resources line without resetting the histogram", () => {
  let resets = 0;
  const monitor = { enable() {}, disable() {}, reset: () => (resets += 1), count: 100, max: 61_700_000, percentile: () => 23_400_000 };
  const procs = accountProcs({ web: 700 });
  const t = startFake({ procs, createDelayMonitor: () => monitor });
  const resetsAfterStartup = resets;
  t.clock.ms += 15_000;
  t.setRss(4242, 701);
  t.clock.ms += 61_000;
  t.fastTick();
  const spike = t.spikes().at(-1);
  assert.equal(spike.eventLoopDelayMaxMs, 41.7);
  assert.equal(resets, resetsAfterStartup, "the fast path never resets the histogram");
});

test("no /proc at all: the old fields are null as before, the new ones null / [], and neither timer writes or throws", () => {
  const t = startFake({ procs: [], scanProcesses: () => null, readAccountTotals: undefined });
  const [line] = t.fiveMinute();
  for (const key of ["acctRssMB", "acctProcs", "acctThreads", "vmSizeMB", "fdCount", "loadAvg1"]) {
    assert.equal(line[key], null, key);
  }
  assert.equal(line.acctRssPeakMB, null);
  assert.equal(line.acctRssPeakAt, null);
  assert.equal(line.ownRssPeakMB, null);
  assert.equal(line.ownHwmMB, null);
  assert.deepEqual(line.peakProcs, []);
  assert.deepEqual(line.procs, []);
  for (const key of ["event", "ts", "pid", "uptimeS", "rssMB", "heapUsedMB", "eventLoopDelayP99Ms", "eventLoopDelayMaxMs", "activeJobs"]) {
    assert.ok(Object.hasOwn(line, key), `old field ${key} is still there`);
  }

  assert.doesNotThrow(() => t.fastTick());
  assert.doesNotThrow(() => t.lineTick());
  assert.equal(t.spikes().length, 0);
  assert.equal(t.lines.length, 2, "startup line + the one 5-minute tick; the fast tick wrote nothing");
});

test("a scanner, identity reader, clock or sink that throws never escapes either timer", () => {
  const boom = () => {
    throw new Error("boom");
  };
  const t = startFake({
    procs: accountProcs({ web: 700 }),
    write: boom,
    extraFields: boom,
  });
  t.clock.ms += 15_000;
  assert.doesNotThrow(() => t.fastTick(), "a throwing sink on the spike path");
  assert.doesNotThrow(() => t.lineTick());
  stopProcResourceLogger();

  const t2 = startFake({ procs: accountProcs({ web: 700 }), scanProcesses: boom, readIdentity: boom, now: boom });
  assert.doesNotThrow(() => t2.fastTick());
  assert.doesNotThrow(() => t2.lineTick());
  stopProcResourceLogger();

  // A broken identity reader only costs the labels, not the line.
  const t3 = startFake({ procs: accountProcs({ web: 700 }), readIdentity: boom });
  t3.clock.ms += 15_000;
  t3.fastTick();
  assert.equal(t3.spikes()[0].procs[0].label, "next-server");
});

test("if the 15-second timer cannot be created the five-minute line still runs", () => {
  let created = 0;
  const intervals = [];
  const handle = startProcResourceLogger({
    env: { NODE_ENV: "production" },
    write: () => {},
    createDelayMonitor: () => null,
    scanProcesses: () => null,
    setIntervalFn: (callback, ms) => {
      created += 1;
      if (created === 2) throw new Error("no more timers");
      const timer = { unref() {} };
      intervals.push({ callback, ms });
      return timer;
    },
  });
  assert.ok(handle);
  assert.equal(handle.fastTimer, null);
  assert.equal(intervals.length, 1);
  assert.doesNotThrow(() => handle.stop());
});

test("with the real /proc readers on whatever platform this is: valid JSON, new keys present, nulls only where /proc is missing", () => {
  const lines = [];
  const handle = startProcResourceLogger({
    env: { NODE_ENV: "production", PROC_RESOURCE_SPIKE_MB: "1000000000" },
    write: (line) => lines.push(line),
  });
  assert.ok(handle);
  const parsed = JSON.parse(lines[0]);
  for (const key of ["acctRssPeakMB", "acctRssPeakAt", "ownRssPeakMB", "ownHwmMB", "peakProcs", "procs"]) {
    assert.ok(Object.hasOwn(parsed, key), key);
  }
  assert.ok(Array.isArray(parsed.peakProcs) && Array.isArray(parsed.procs));
  if (parsed.acctRssMB === null) {
    // No /proc (Windows, macOS): everything new is empty.
    assert.equal(parsed.acctRssPeakMB, null);
    assert.equal(parsed.ownHwmMB, null);
    assert.deepEqual(parsed.procs, []);
  } else {
    assert.ok(parsed.procs.length > 0 && parsed.procs.length <= 6);
    assert.ok(parsed.acctRssPeakMB >= 0);
  }
  assert.ok(lines[0].length < PROC_RESOURCE_LINE_MAX_CHARS);
  handle.stop();
});
