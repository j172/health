import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const {
  PROC_RESOURCE_FAST_INTERVAL_MS,
  PROC_RESOURCE_LOG_INTERVAL_MS,
  PROC_RESOURCE_LINE_MAX_CHARS,
  buildProcBreakdown,
  buildProcResourceSample,
  buildSpikeSample,
  classifyProcess,
  countOpenFds,
  createPeakTracker,
  isProcResourceLoggerEnabled,
  parseAccountProcessStatus,
  parseLoadAvg1,
  parseProcStatus,
  parseProcessDetail,
  peekEventLoopDelayMaxMs,
  readAccountTotals,
  readEventLoopDelay,
  readLoadAvg1,
  readProcIdentity,
  readProcStatus,
  resolveSpikeThresholdMb,
  scanAccountProcesses,
  serializeWithinBudget,
  summarizeAccountProcesses,
  startProcResourceLogger,
  stopProcResourceLogger,
} = await import("./procResourceLogger.ts");

// A trimmed but verbatim-shaped /proc/<pid>/status of a Node process on Linux.
const STATUS_FIXTURE = [
  "Name:\tnext-server (v16.",
  "Umask:\t0022",
  "State:\tS (sleeping)",
  "Tgid:\t4242",
  "Pid:\t4242",
  "FDSize:\t256",
  "VmPeak:\t 1853440 kB",
  "VmSize:\t 1772544 kB",
  "VmLck:\t       0 kB",
  "VmHWM:\t  645120 kB",
  "VmRSS:\t  524288 kB",
  "RssAnon:\t  480000 kB",
  "VmData:\t 1045504 kB",
  "VmStk:\t     132 kB",
  "Threads:\t11",
  "voluntary_ctxt_switches:\t1234",
  "",
].join("\n");

afterEach(() => {
  stopProcResourceLogger();
});

/** Field names and order of the proc_resources line as first shipped in #711. Never edit this list. */
const PRE_EXISTING_KEYS = [
  "event",
  "ts",
  "pid",
  "uptimeS",
  "rssMB",
  "heapUsedMB",
  "heapTotalMB",
  "externalMB",
  "arrayBuffersMB",
  "vmSizeMB",
  "vmPeakMB",
  "vmRssMB",
  "vmDataMB",
  "threads",
  "fdCount",
  "acctRssMB",
  "acctProcs",
  "acctThreads",
  "loadAvg1",
  "eventLoopDelayP99Ms",
  "eventLoopDelayMaxMs",
];

/** Added for #709 (2026-10-18), always after everything above (and after activeJobs). */
const PEAK_KEYS = ["acctRssPeakMB", "acctRssPeakAt", "ownRssPeakMB", "ownHwmMB", "peakProcs", "procs"];

// Deterministic start-up tests: no real /proc walk (a Linux CI box's own-uid RSS sum could
// cross the 800 MB spike threshold and add a line), and an unreachable spike threshold.
const productionEnv = { NODE_ENV: "production", PROC_RESOURCE_SPIKE_MB: "1000000000" };
const noScan = () => null;

/** Fake timer API that records what the logger asks of it. */
const fakeTimers = () => {
  const calls = { setInterval: [], clear: [], unref: 0 };
  const created = [];
  return {
    calls,
    /** The timer objects handed out, in order: [0] is the 5-minute line, [1] the 15-second peak sampler. */
    created,
    setIntervalFn: (callback, ms) => {
      calls.setInterval.push({ callback, ms });
      const timer = { unref: () => (calls.unref += 1) };
      created.push(timer);
      return timer;
    },
    clearIntervalFn: (t) => calls.clear.push(t),
  };
};

const noDelayMonitor = () => null;

test("parseProcStatus: reads VmSize/VmPeak/VmRSS/VmData (kB -> MB) and Threads from /proc/self/status text", () => {
  assert.deepEqual(parseProcStatus(STATUS_FIXTURE), {
    vmSizeMB: 1731,
    vmPeakMB: 1810,
    vmRssMB: 512,
    vmDataMB: 1021, // 1045504 kB / 1024 = 1021.0
    threads: 11,
  });
});

test("parseProcStatus: matches whole field names only, not VmHWM/VmStk/RssAnon look-alikes", () => {
  const parsed = parseProcStatus("VmHWM:\t 2048 kB\nRssAnon:\t 4096 kB\nVmStk:\t 1024 kB\n");
  assert.deepEqual(parsed, { vmSizeMB: null, vmPeakMB: null, vmRssMB: null, vmDataMB: null, threads: null });
});

test("parseProcStatus: missing, malformed or non-string input yields nulls and never throws", () => {
  const allNull = { vmSizeMB: null, vmPeakMB: null, vmRssMB: null, vmDataMB: null, threads: null };
  for (const input of ["", "garbage", "VmSize:\tabc kB\nThreads:\t-3\n", undefined, null, 42, {}]) {
    assert.doesNotThrow(() => parseProcStatus(input));
    assert.deepEqual(parseProcStatus(input), allNull, `input ${JSON.stringify(input)}`);
  }
  // A partial file keeps what it has.
  assert.deepEqual(parseProcStatus("VmPeak:\t 1024 kB\n"), { ...allNull, vmPeakMB: 1 });
});

test("the real /proc readers never throw: numbers on Linux, nulls where /proc does not exist", () => {
  const status = readProcStatus();
  for (const value of Object.values(status)) {
    assert.ok(value === null || (typeof value === "number" && value >= 0));
  }
  const fds = countOpenFds();
  assert.ok(fds === null || (Number.isInteger(fds) && fds > 0));

  const account = readAccountTotals();
  assert.deepEqual(Object.keys(account), ["acctRssMB", "acctProcs", "acctThreads"]);
  for (const value of Object.values(account)) {
    assert.ok(value === null || (typeof value === "number" && value >= 0));
  }
  const load = readLoadAvg1();
  assert.ok(load === null || (typeof load === "number" && load >= 0));
});

// A fake /proc: our uid is 1001 (the "Uid:" line is real/effective/saved/fs).
const procStatus = ({ uid, rssKb, threads }) =>
  [
    "Name:\tnode",
    "State:\tS (sleeping)",
    `Uid:\t${uid}\t${uid}\t${uid}\t${uid}`,
    `Gid:\t${uid}\t${uid}\t${uid}\t${uid}`,
    ...(rssKb === undefined ? [] : [`VmRSS:\t ${rssKb} kB`]),
    ...(threads === undefined ? [] : [`Threads:\t${threads}`]),
    "",
  ].join("\n");

const fakeProc = (files, { unreadable = [] } = {}) => ({
  readText: (path) => {
    if (unreadable.includes(path) || !Object.hasOwn(files, path)) {
      throw Object.assign(new Error(`ENOENT: ${path}`), { code: "ENOENT" });
    }
    return files[path];
  },
  listDir: (path) => {
    if (path !== "/proc") throw new Error("unexpected dir");
    const pids = Object.keys(files)
      .map((f) => /^\/proc\/(\d+)\/status$/.exec(f)?.[1])
      .filter(Boolean);
    // Real /proc also lists non-numeric entries and `self`.
    return ["self", "loadavg", "cpuinfo", ...pids, "thread-self"];
  },
});

test("parseAccountProcessStatus: real uid (first number of Uid:), VmRSS in kB and Threads", () => {
  assert.deepEqual(parseAccountProcessStatus(procStatus({ uid: 1001, rssKb: 524288, threads: 11 })), {
    uid: 1001,
    rssKb: 524288,
    threads: 11,
  });
  // Real uid wins over the effective one.
  assert.equal(parseAccountProcessStatus("Uid:\t1001\t0\t0\t0\n").uid, 1001);
  // Kernel threads and zombies have no VmRSS line.
  assert.deepEqual(parseAccountProcessStatus(procStatus({ uid: 0, threads: 1 })), { uid: 0, rssKb: null, threads: 1 });
  for (const input of ["", "garbage", undefined, null, 7]) {
    assert.deepEqual(parseAccountProcessStatus(input), { uid: null, rssKb: null, threads: null });
  }
});

test("summarizeAccountProcesses: sums only our uid; processes without VmRSS still count as processes", () => {
  const statuses = [
    { uid: 1001, rssKb: 524288, threads: 11 }, // health-web, 512 MB
    { uid: 1001, rssKb: 262144, threads: 9 }, // mall, 256 MB
    { uid: 1001, rssKb: null, threads: 1 }, // zombie: no VmRSS
    { uid: 1001, rssKb: 10240, threads: null }, // no Threads line
    { uid: 1002, rssKb: 999999, threads: 50 }, // someone else
    { uid: null, rssKb: 1, threads: 1 }, // unparseable
  ];
  assert.deepEqual(summarizeAccountProcesses(statuses, 1001), {
    acctRssMB: 778, // (524288 + 262144 + 10240) / 1024
    acctProcs: 4,
    acctThreads: 21,
  });
  assert.deepEqual(summarizeAccountProcesses(statuses, null), { acctRssMB: null, acctProcs: null, acctThreads: null });
  assert.deepEqual(summarizeAccountProcesses([], 1001), { acctRssMB: 0, acctProcs: 0, acctThreads: 0 });
});

test("readAccountTotals: walks /proc/<pid>/status, skips non-numeric entries, other uids and processes that vanish mid-walk", () => {
  const files = {
    "/proc/self/status": procStatus({ uid: 1001, rssKb: 524288, threads: 11 }),
    "/proc/100/status": procStatus({ uid: 1001, rssKb: 524288, threads: 11 }),
    "/proc/101/status": procStatus({ uid: 1001, rssKb: 262144, threads: 9 }),
    "/proc/102/status": procStatus({ uid: 1001, rssKb: 102400, threads: 3 }), // exits between listing and reading
    "/proc/103/status": procStatus({ uid: 1002, rssKb: 999999, threads: 50 }),
    "/proc/2/status": procStatus({ uid: 0, threads: 1 }),
  };
  const io = fakeProc(files, { unreadable: ["/proc/102/status"] });
  assert.deepEqual(readAccountTotals(io), { acctRssMB: 768, acctProcs: 2, acctThreads: 20 });
});

test("readAccountTotals: no /proc, an unparseable self status, or a failing listing -> nulls, never a throw", () => {
  const allNull = { acctRssMB: null, acctProcs: null, acctThreads: null };
  const missing = {
    readText: () => {
      throw new Error("ENOENT");
    },
    listDir: () => {
      throw new Error("ENOENT");
    },
  };
  assert.doesNotThrow(() => readAccountTotals(missing));
  assert.deepEqual(readAccountTotals(missing), allNull);
  assert.deepEqual(readAccountTotals(fakeProc({ "/proc/self/status": "Name:\tnode\n" })), allNull);
  assert.deepEqual(
    readAccountTotals({
      readText: () => procStatus({ uid: 1001, rssKb: 1, threads: 1 }),
      listDir: () => {
        throw new Error("EACCES");
      },
    }),
    allNull,
  );
});

test("parseLoadAvg1 / readLoadAvg1: first value of /proc/loadavg, null when missing or malformed", () => {
  assert.equal(parseLoadAvg1("9.84 10.21 11.07 3/412 28817\n"), 9.84);
  assert.equal(parseLoadAvg1("0.00 0.01 0.05 1/100 2\n"), 0);
  assert.equal(parseLoadAvg1("12 3 4 1/1 1"), 12);
  for (const input of ["", "garbage", "-1.0 2 3", undefined, null]) {
    assert.equal(parseLoadAvg1(input), null, JSON.stringify(input));
  }
  assert.equal(readLoadAvg1(fakeProc({ "/proc/loadavg": "9.84 10.21 11.07 3/412 28817\n" })), 9.84);
  assert.equal(readLoadAvg1(fakeProc({})), null);
});

test("buildProcResourceSample: the full field set, `event` first, one JSON line with the grep-able prefix", () => {
  const sample = buildProcResourceSample({
    now: () => Date.UTC(2026, 9, 17, 6, 5, 0),
    pid: 4242,
    uptimeSeconds: () => 1803.4,
    memoryUsage: () => ({
      rss: 536870912, // 512 MiB
      heapTotal: 213909504,
      heapUsed: 148062208,
      external: 23726080,
      arrayBuffers: 9542041,
    }),
    readProcStatus: () => parseProcStatus(STATUS_FIXTURE),
    countOpenFds: () => 38,
    readAccountTotals: () => ({ acctRssMB: 742.3, acctProcs: 6, acctThreads: 43 }),
    readLoadAvg1: () => 9.84,
    delayMonitor: null,
  });

  // The pre-existing fields keep their names and order (people grep and script against them);
  // the #709 peak / breakdown fields come after every one of them.
  assert.deepEqual(Object.keys(sample), [...PRE_EXISTING_KEYS, ...PEAK_KEYS]);
  assert.equal(sample.event, "proc_resources");
  assert.equal(sample.acctRssMB, 742.3);
  assert.equal(sample.acctProcs, 6);
  assert.equal(sample.acctThreads, 43);
  assert.equal(sample.loadAvg1, 9.84);
  assert.equal(sample.ts, "2026-10-17T06:05:00.000Z");
  assert.equal(sample.uptimeS, 1803);
  assert.equal(sample.rssMB, 512);
  assert.equal(sample.heapUsedMB, 141.2);
  assert.equal(sample.vmPeakMB, 1810);
  assert.equal(sample.fdCount, 38);
  assert.equal(sample.eventLoopDelayP99Ms, null, "no monitor -> null, not 0");

  const line = JSON.stringify(sample);
  assert.ok(line.startsWith('{"event":"proc_resources",'), line);
  assert.ok(!line.includes("\n"));
});

test("buildProcResourceSample: with /proc missing and every reader throwing, it still returns a sample of nulls", () => {
  const boom = () => {
    throw new Error("ENOENT: /proc/self/status");
  };
  let sample;
  assert.doesNotThrow(() => {
    sample = buildProcResourceSample({
      memoryUsage: boom,
      readProcStatus: boom,
      countOpenFds: boom,
      readAccountTotals: boom,
      readLoadAvg1: boom,
      uptimeSeconds: boom,
      now: boom,
      extraFields: boom,
      delayMonitor: {
        enable() {},
        disable() {},
        reset: boom,
        get count() {
          throw new Error("histogram gone");
        },
        max: 0,
        percentile: boom,
      },
    });
  });
  assert.equal(sample.event, "proc_resources");
  for (const key of ["ts", "uptimeS", "rssMB", "heapUsedMB", "vmSizeMB", "vmPeakMB", "threads", "fdCount", "acctRssMB", "acctProcs", "acctThreads", "loadAvg1", "eventLoopDelayP99Ms"]) {
    assert.equal(sample[key], null, key);
  }
  assert.doesNotThrow(() => JSON.stringify(sample));
});

test("buildProcResourceSample: extraFields follow the standard fields, precede the #709 fields and cannot replace either", () => {
  const sample = buildProcResourceSample({
    delayMonitor: null,
    scanProcesses: noScan,
    extraFields: () => ({ activeJobs: ["rss-sync"], event: "hijacked", rssMB: -1, procs: "hijacked", ownHwmMB: -1 }),
  });
  assert.deepEqual(sample.activeJobs, ["rss-sync"]);
  assert.equal(sample.event, "proc_resources");
  assert.notEqual(sample.rssMB, -1);
  assert.deepEqual(sample.procs, [], "a caller field cannot replace a #709 field");
  assert.equal(sample.ownHwmMB, null);
  assert.deepEqual(Object.keys(sample), [...PRE_EXISTING_KEYS, "activeJobs", ...PEAK_KEYS]);
});

test("readEventLoopDelay: nulls for an empty interval, resolution subtracted, clamped at 0, reset every read", () => {
  const monitorWith = ({ count, p99Ns, maxNs }) => {
    const state = { resets: 0 };
    return {
      state,
      enable() {},
      disable() {},
      reset: () => (state.resets += 1),
      count,
      max: maxNs,
      percentile: (p) => {
        assert.equal(p, 99);
        return p99Ns;
      },
    };
  };

  const empty = monitorWith({ count: 0, p99Ns: 511, maxNs: 0 });
  assert.deepEqual(readEventLoopDelay(empty, 20), { p99Ms: null, maxMs: null });
  assert.equal(empty.state.resets, 1);

  const busy = monitorWith({ count: 15000, p99Ns: 23_400_000, maxNs: 61_700_000 });
  assert.deepEqual(readEventLoopDelay(busy, 20), { p99Ms: 3.4, maxMs: 41.7 });
  assert.equal(busy.state.resets, 1);

  const quiet = monitorWith({ count: 15000, p99Ns: 19_000_000, maxNs: 20_000_000 });
  assert.deepEqual(readEventLoopDelay(quiet, 20), { p99Ms: 0, maxMs: 0 });

  assert.deepEqual(readEventLoopDelay(null), { p99Ms: null, maxMs: null });
});

test("isProcResourceLoggerEnabled: production by default, PROC_RESOURCE_LOG=1 forces on, =0 forces off", () => {
  assert.equal(isProcResourceLoggerEnabled({ NODE_ENV: "production" }), true);
  assert.equal(isProcResourceLoggerEnabled({ NODE_ENV: "development" }), false);
  assert.equal(isProcResourceLoggerEnabled({ NODE_ENV: "test" }), false);
  assert.equal(isProcResourceLoggerEnabled({}), false);
  assert.equal(isProcResourceLoggerEnabled({ NODE_ENV: "development", PROC_RESOURCE_LOG: "1" }), true);
  assert.equal(isProcResourceLoggerEnabled({ NODE_ENV: "development", PROC_RESOURCE_LOG: " TRUE " }), true);
  assert.equal(isProcResourceLoggerEnabled({ NODE_ENV: "production", PROC_RESOURCE_LOG: "0" }), false);
  assert.equal(isProcResourceLoggerEnabled({ NODE_ENV: "production", PROC_RESOURCE_LOG: "off" }), false);
  assert.equal(isProcResourceLoggerEnabled({ NODE_ENV: "production", PROC_RESOURCE_LOG: "garbage" }), true);
});

test("outside production the logger does no work at all: no timer, no line, no histogram", () => {
  const timers = fakeTimers();
  const lines = [];
  let monitorsCreated = 0;
  const handle = startProcResourceLogger({
    env: { NODE_ENV: "development" },
    write: (l) => lines.push(l),
    setIntervalFn: timers.setIntervalFn,
    createDelayMonitor: () => {
      monitorsCreated += 1;
      return null;
    },
  });
  assert.equal(handle, null);
  assert.equal(timers.calls.setInterval.length, 0);
  assert.equal(lines.length, 0);
  assert.equal(monitorsCreated, 0);

  // ...and the env flag turns it on.
  const forced = startProcResourceLogger({
    env: { NODE_ENV: "development", PROC_RESOURCE_LOG: "1" },
    write: (l) => lines.push(l),
    setIntervalFn: timers.setIntervalFn,
    clearIntervalFn: timers.clearIntervalFn,
    createDelayMonitor: noDelayMonitor,
    scanProcesses: noScan,
  });
  assert.ok(forced);
  assert.equal(lines.length, 1);
});

test("in production: one line at startup, then one per 5-minute tick, each parseable with the stable prefix", () => {
  const timers = fakeTimers();
  const lines = [];
  const handle = startProcResourceLogger({
    env: productionEnv,
    write: (l) => lines.push(l),
    setIntervalFn: timers.setIntervalFn,
    clearIntervalFn: timers.clearIntervalFn,
    createDelayMonitor: noDelayMonitor,
    readProcStatus: () => parseProcStatus(STATUS_FIXTURE),
    countOpenFds: () => 38,
    readAccountTotals: () => ({ acctRssMB: 742.3, acctProcs: 6, acctThreads: 43 }),
    readLoadAvg1: () => 9.84,
    extraFields: () => ({ activeJobs: ["rss-sync"] }),
    scanProcesses: noScan,
  });

  assert.ok(handle);
  assert.equal(PROC_RESOURCE_LOG_INTERVAL_MS, 300_000);
  assert.equal(PROC_RESOURCE_FAST_INTERVAL_MS, 15_000);
  assert.equal(timers.calls.setInterval.length, 2, "the 5-minute line and the 15-second peak sampler");
  assert.equal(timers.calls.setInterval[0].ms, 300_000);
  assert.equal(timers.calls.setInterval[1].ms, 15_000);
  assert.equal(lines.length, 1, "the startup line");

  timers.calls.setInterval[0].callback();
  timers.calls.setInterval[0].callback();
  assert.equal(lines.length, 3);
  for (const line of lines) {
    assert.ok(line.startsWith('{"event":"proc_resources",'));
    const parsed = JSON.parse(line);
    assert.equal(parsed.vmPeakMB, 1810);
    assert.equal(parsed.fdCount, 38);
    assert.equal(parsed.acctProcs, 6);
    assert.equal(parsed.loadAvg1, 9.84);
    assert.deepEqual(parsed.activeJobs, ["rss-sync"]);
    assert.ok(parsed.rssMB > 0);
  }
});

test("single-timer guard: a second start (hot reload, second module copy) adds no timer and writes nothing", () => {
  const timers = fakeTimers();
  const lines = [];
  const options = {
    env: productionEnv,
    write: (l) => lines.push(l),
    setIntervalFn: timers.setIntervalFn,
    clearIntervalFn: timers.clearIntervalFn,
    createDelayMonitor: noDelayMonitor,
    scanProcesses: noScan,
  };

  const first = startProcResourceLogger(options);
  const second = startProcResourceLogger(options);
  const third = startProcResourceLogger(options);

  assert.ok(first);
  assert.equal(second, null);
  assert.equal(third, null);
  assert.equal(timers.calls.setInterval.length, 2, "exactly one logger: one 5-minute and one 15-second interval");
  assert.equal(lines.length, 1, "exactly one startup line");

  // The guard lives on globalThis under a registry symbol, so another copy of the module sees it too.
  assert.ok(globalThis[Symbol.for("health.procResourceLogger")]);

  // Stopping re-arms it (and clears BOTH intervals).
  first.stop();
  assert.deepEqual(timers.calls.clear, [timers.created[0], timers.created[1]]);
  assert.equal(globalThis[Symbol.for("health.procResourceLogger")], undefined);
  assert.ok(startProcResourceLogger(options));
  assert.equal(timers.calls.setInterval.length, 4);
});

test("both intervals are unref()ed so they can never keep the process alive", () => {
  const timers = fakeTimers();
  startProcResourceLogger({
    env: productionEnv,
    write: () => {},
    setIntervalFn: timers.setIntervalFn,
    createDelayMonitor: noDelayMonitor,
    scanProcesses: noScan,
  });
  assert.equal(timers.calls.setInterval.length, 2);
  assert.equal(timers.calls.unref, 2);
});

test("with the real timers: both intervals are unref'd and the real histogram is enabled then disabled", () => {
  const lines = [];
  const handle = startProcResourceLogger({ env: productionEnv, write: (l) => lines.push(l) });
  assert.ok(handle);
  assert.equal(typeof handle.timer.hasRef, "function");
  assert.equal(handle.timer.hasRef(), false, "unref'd: does not hold the event loop open");
  assert.equal(typeof handle.fastTimer.hasRef, "function");
  assert.equal(handle.fastTimer.hasRef(), false, "the 15-second sampler is unref'd too");

  // The startup line comes from the real readers: whatever the platform, it is valid JSON.
  assert.equal(lines.length, 1);
  const parsed = JSON.parse(lines[0]);
  assert.equal(parsed.event, "proc_resources");
  assert.equal(parsed.pid, process.pid);
  assert.equal(parsed.eventLoopDelayP99Ms, null, "no samples have been collected yet");
  assert.ok(parsed.heapUsedMB > 0);
  assert.doesNotThrow(() => handle.stop());
});

test("a throwing sink, timer API or monitor never makes start() throw", () => {
  const timers = fakeTimers();
  assert.doesNotThrow(() =>
    startProcResourceLogger({
      env: productionEnv,
      write: () => {
        throw new Error("EPIPE");
      },
      setIntervalFn: timers.setIntervalFn,
      createDelayMonitor: () => ({
        enable() {
          throw new Error("no ELD");
        },
        disable() {},
        reset() {},
        max: 0,
        percentile: () => 0,
      }),
    }),
  );
  stopProcResourceLogger();

  assert.doesNotThrow(() =>
    startProcResourceLogger({
      env: productionEnv,
      write: () => {},
      setIntervalFn: () => {
        throw new Error("no timers");
      },
      createDelayMonitor: () => {
        throw new Error("no perf_hooks");
      },
    }),
  );
  assert.doesNotThrow(() => stopProcResourceLogger());
});

test("instrumentation.ts starts the logger from the nodejs runtime branch", () => {
  const source = readFileSync(new URL("../../../instrumentation.ts", import.meta.url), "utf8");
  assert.match(source, /if \(process\.env\.NEXT_RUNTIME === "nodejs"\) \{/);
  assert.match(source, /import\("@\/lib\/server\/logging\/procResourceLogger"\)/);
  assert.match(source, /startProcResourceLogger\(/);
});
