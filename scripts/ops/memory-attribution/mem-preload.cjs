/**
 * Memory attribution preload (issue #709 measurement task).
 *
 * Loaded with `NODE_OPTIONS=--require <this file>` into the process under test
 * (`next start`). It does NOT change application behaviour: it only
 *   1. appends one CSV row of process.memoryUsage() + V8 heap/space statistics
 *      every second for the first minute and every 5 seconds afterwards, and
 *   2. opens a tiny loopback-only control server (MEMATTR_CTL_PORT) so the
 *      orchestrator can ask for a forced GC, a marker row or a heap snapshot.
 *
 * Environment (all optional except OUT_DIR):
 *   MEMATTR_OUT_DIR   directory that receives samples.csv / marks.csv / *.heapsnapshot
 *   MEMATTR_CTL_PORT  loopback port for the control server (default: no server)
 *   MEMATTR_LABEL     free text written into meta.json
 *
 * Control endpoints (GET, 127.0.0.1 only):
 *   /mem                 current memoryUsage + heap statistics (no GC)
 *   /gc                  two full GCs, then the post-GC numbers
 *   /mark?label=xxx      append a row to marks.csv (with a current sample)
 *   /snapshot?name=xxx   full GC, then v8.writeHeapSnapshot(OUT_DIR/xxx.heapsnapshot)
 *
 * No secrets are read; nothing outside OUT_DIR is written.
 */
"use strict";

const { isMainThread } = require("node:worker_threads");
if (!isMainThread) return;

const OUT_DIR = process.env.MEMATTR_OUT_DIR;
if (!OUT_DIR) return;

const fs = require("node:fs");
const path = require("node:path");
const v8 = require("node:v8");
const vm = require("node:vm");
const http = require("node:http");

// Only instrument the long-lived server process, not helper children (npm, shell...).
const argvText = process.argv.slice(1).join(" ");
if (!/next[\\/]dist[\\/]bin[\\/]next\s+start/.test(argvText) && process.env.MEMATTR_FORCE !== "1") {
  return;
}

fs.mkdirSync(OUT_DIR, { recursive: true });

const MB = 1024 * 1024;
const startedAt = Date.now();
const CTL_PORT = Number(process.env.MEMATTR_CTL_PORT || 0);

const SPACES = [
  "read_only_space",
  "new_space",
  "old_space",
  "code_space",
  "shared_space",
  "new_large_object_space",
  "large_object_space",
  "code_large_object_space",
  "shared_large_object_space",
];

// `--expose-gc` is not accepted in NODE_OPTIONS, so obtain gc() at runtime.
let gcFn = typeof global.gc === "function" ? global.gc : null;
if (!gcFn) {
  try {
    v8.setFlagsFromString("--expose-gc");
    gcFn = vm.runInNewContext("gc");
  } catch {
    gcFn = null;
  }
}

const fullGc = () => {
  if (!gcFn) return false;
  gcFn();
  gcFn();
  return true;
};

const sample = () => {
  const m = process.memoryUsage();
  const h = v8.getHeapStatistics();
  const spaces = {};
  for (const s of v8.getHeapSpaceStatistics()) spaces[s.space_name] = s;
  let maxRssKb = null;
  try {
    maxRssKb = process.resourceUsage().maxRSS;
  } catch {
    // ignore
  }
  const row = {
    iso: new Date().toISOString(),
    uptime_s: Number(process.uptime().toFixed(2)),
    rss: m.rss,
    heapUsed: m.heapUsed,
    heapTotal: m.heapTotal,
    external: m.external,
    arrayBuffers: m.arrayBuffers,
    maxRssKb,
    total_physical_size: h.total_physical_size,
    malloced_memory: h.malloced_memory,
    peak_malloced_memory: h.peak_malloced_memory,
    total_global_handles_size: h.total_global_handles_size,
    used_global_handles_size: h.used_global_handles_size,
    native_contexts: h.number_of_native_contexts,
    detached_contexts: h.number_of_detached_contexts,
  };
  for (const name of SPACES) {
    const s = spaces[name];
    row[`${name}_used`] = s ? s.space_used_size : 0;
    row[`${name}_size`] = s ? s.space_size : 0;
  }
  return row;
};

const COLUMNS = Object.keys(sample());
const samplesPath = path.join(OUT_DIR, "samples.csv");
const marksPath = path.join(OUT_DIR, "marks.csv");
fs.writeFileSync(samplesPath, COLUMNS.join(",") + "\n");
fs.writeFileSync(marksPath, "iso,uptime_s,label,rss,heapUsed,heapTotal,external,arrayBuffers\n");
fs.writeFileSync(
  path.join(OUT_DIR, "meta.json"),
  JSON.stringify(
    {
      label: process.env.MEMATTR_LABEL || null,
      pid: process.pid,
      node: process.version,
      v8: process.versions.v8,
      platform: process.platform,
      arch: process.arch,
      argv: process.argv,
      execArgv: process.execArgv,
      nodeOptions: process.env.NODE_OPTIONS || null,
      heapSizeLimitMb: Math.round(v8.getHeapStatistics().heap_size_limit / MB),
      gcAvailable: Boolean(gcFn),
      startedAt: new Date(startedAt).toISOString(),
    },
    null,
    2,
  ),
);

const writeSample = () => {
  try {
    const row = sample();
    fs.appendFileSync(samplesPath, COLUMNS.map((c) => row[c]).join(",") + "\n");
  } catch {
    // measurement must never break the process under test
  }
};

const scheduleNext = () => {
  const interval = process.uptime() < 60 ? 1000 : 5000;
  const t = setTimeout(() => {
    writeSample();
    scheduleNext();
  }, interval);
  t.unref();
};
writeSample();
scheduleNext();

const mb = (n) => Number((n / MB).toFixed(1));
const brief = () => {
  const m = process.memoryUsage();
  return {
    rssMB: mb(m.rss),
    heapUsedMB: mb(m.heapUsed),
    heapTotalMB: mb(m.heapTotal),
    externalMB: mb(m.external),
    arrayBuffersMB: mb(m.arrayBuffers),
  };
};

const safeName = (s) => String(s || "snap").replace(/[^A-Za-z0-9._-]/g, "_");

if (CTL_PORT > 0) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    const send = (obj, code = 200) => {
      res.writeHead(code, { "content-type": "application/json" });
      res.end(JSON.stringify(obj));
    };
    try {
      if (url.pathname === "/mem") {
        return send({ uptimeS: process.uptime(), ...brief() });
      }
      if (url.pathname === "/gc") {
        const before = brief();
        const ok = fullGc();
        return send({ gc: ok, before, after: brief() });
      }
      if (url.pathname === "/mark") {
        const label = (url.searchParams.get("label") || "").replace(/[",\r\n]/g, "_");
        const m = process.memoryUsage();
        fs.appendFileSync(
          marksPath,
          [new Date().toISOString(), process.uptime().toFixed(2), label, m.rss, m.heapUsed, m.heapTotal, m.external, m.arrayBuffers].join(",") + "\n",
        );
        return send({ ok: true, ...brief() });
      }
      if (url.pathname === "/snapshot") {
        const name = safeName(url.searchParams.get("name"));
        const before = brief();
        const ok = fullGc();
        const afterGc = brief();
        const file = path.join(OUT_DIR, `${name}.heapsnapshot`);
        const t0 = Date.now();
        v8.writeHeapSnapshot(file);
        const bytes = fs.statSync(file).size;
        return send({ gc: ok, before, afterGc, afterSnapshot: brief(), file, bytes, tookMs: Date.now() - t0 });
      }
      return send({ error: "unknown endpoint" }, 404);
    } catch (e) {
      return send({ error: String(e && e.message ? e.message : e) }, 500);
    }
  });
  server.on("error", () => {
    // port in use (a second node process under the same NODE_OPTIONS): stay silent
  });
  server.listen(CTL_PORT, "127.0.0.1");
  server.unref();
}
