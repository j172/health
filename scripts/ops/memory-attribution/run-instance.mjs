#!/usr/bin/env node
/**
 * Starts ONE `next start` in a prepared isolated folder, drives a request
 * schedule against it, records memory, and stops it (issue #709).
 *
 * The child gets a scrubbed environment (an allowlist, NOT process.env), so
 * nothing from the caller's shell (MYSQL_*, TDX_*, ADMIN_*, tokens...) leaks in.
 *
 * Modes
 *   series  boot, optional request sweeps on a timer, optional heap snapshots,
 *           stop after --duration-sec           (variants A and B)
 *   seeds   boot, settle, then request each large-seed route one at a time with
 *           a forced GC before/after            (variant C)
 *   idle    series without sweeps (just --mode series without --sweep)
 *
 * Required: --dir <isolated folder> --node <node.exe> --out <result folder>
 * Common:   --port 3999 --ctl-port 4999 --label <text> --max-old-space 768
 *           --db-env placeholder|none   (default placeholder, see README)
 * series:   --duration-sec 1800 [--sweep] --sweep-first-at-sec 45
 *           --sweep-every-sec 180 --snapshot-at-sec 300,1800
 * seeds:    --settle-sec 120
 * extras:   --full-sweep-at-sec 600,3600  (crawl every static route in the build)
 *           --sweep-routes "/,/x"  --ready-path /robots.txt
 *
 * Output (in --out): samples.csv marks.csv meta.json (written by the preload),
 * requests.csv, timeline.jsonl, winproc.jsonl, child.log, *.heapsnapshot.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SWEEP_ROUTES, SEED_PROBES } from "./routes.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const has = (n) => argv.includes(`--${n}`);
const opt = (n, d = undefined) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] !== undefined && !argv[i + 1].startsWith("--") ? argv[i + 1] : d;
};

const dir = path.resolve(opt("dir", ""));
const nodeExe = path.resolve(opt("node", process.execPath));
const out = path.resolve(opt("out", ""));
const mode = opt("mode", "series");
const port = Number(opt("port", 3999));
const ctlPort = Number(opt("ctl-port", 4999));
const label = opt("label", "run");
const maxOld = opt("max-old-space", "768");
const dbEnv = opt("db-env", "placeholder");
const durationSec = Number(opt("duration-sec", 1800));
const sweepFirst = Number(opt("sweep-first-at-sec", 45));
const sweepEvery = Number(opt("sweep-every-sec", 180));
const snapshotAt = (opt("snapshot-at-sec", "") || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)
  .map(Number);
const settleSec = Number(opt("settle-sec", 120));
const doSweep = has("sweep");
// --sweep-routes "/,/x" replaces the default ~50-route list (used by the minimal "ok" app).
const sweepRoutes = opt("sweep-routes") ? opt("sweep-routes").split(",") : SWEEP_ROUTES;
const readyPath = opt("ready-path", "/robots.txt");
// Extra "crawl everything" rounds: every static page/API in the build's route
// manifests (what a bot walking the sitemap for hours would touch).
const fullSweepAt = (opt("full-sweep-at-sec", "") || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)
  .map(Number);

/** Every statically-addressable GET route in the build, minus admin/dynamic. */
const buildFullRoutes = () => {
  const read = (f) => JSON.parse(fs.readFileSync(path.join(dir, ".next3", f), "utf8"));
  const set = new Set();
  for (const url of Object.values(read("app-path-routes-manifest.json"))) if (!url.includes("[")) set.add(url);
  try {
    for (const url of Object.keys(read("prerender-manifest.json").routes)) set.add(url);
  } catch {
    // older layout: the app manifest alone is enough
  }
  return [...set]
    .filter((u) => !/^\/(api\/)?admin(\/|$)/.test(u) && !u.startsWith("/_"))
    .sort();
};

if (!opt("dir") || !opt("out")) {
  console.error("--dir and --out are required");
  process.exit(2);
}
if (!fs.existsSync(path.join(dir, ".next3", "BUILD_ID"))) {
  console.error(`${dir} has no .next3/BUILD_ID (run prepare-isolated-dir.mjs)`);
  process.exit(2);
}
fs.mkdirSync(out, { recursive: true });

// Refuse to start if the folder holds a dotenv file (secrets would be loaded by next start).
const envHit = fs.readdirSync(dir).filter((n) => /^\.env($|\.)/i.test(n));
if (envHit.length) {
  console.error(`refusing to start: ${dir} contains ${envHit.join(", ")}`);
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const logLine = (obj) => fs.appendFileSync(path.join(out, "timeline.jsonl"), JSON.stringify({ at: new Date().toISOString(), ...obj }) + "\n");

// ---- scrubbed environment -------------------------------------------------
const keep = ["SystemRoot", "windir", "SystemDrive", "TEMP", "TMP", "COMSPEC", "PATHEXT", "NUMBER_OF_PROCESSORS", "PROCESSOR_ARCHITECTURE", "OS"];
const env = {};
for (const k of keep) if (process.env[k] !== undefined) env[k] = process.env[k];
env.PATH = [path.dirname(nodeExe), path.join(process.env.SystemRoot || "C:\\Windows", "System32"), process.env.SystemRoot || "C:\\Windows"].join(path.delimiter);
env.NODE_ENV = "production";
env.PORT = String(port);
env.NEXT_TELEMETRY_DISABLED = "1";
env.NODE_OPTIONS = `--require ${path.join(here, "mem-preload.cjs").replace(/\\/g, "/")}`;
env.MEMATTR_OUT_DIR = out;
env.MEMATTR_CTL_PORT = String(ctlPort);
env.MEMATTR_LABEL = label;
if (dbEnv === "placeholder") {
  // Mirrors deploy-ftps.yml's non-secret fallbacks. lib/server/config/env.ts
  // throws at import time without these; port 1 is closed -> ECONNREFUSED,
  // i.e. "database unreachable", the same degraded path the CI build takes.
  Object.assign(env, {
    MYSQL_HOST: "127.0.0.1",
    MYSQL_PORT: "1",
    MYSQL_USER: "placeholder",
    MYSQL_PASSWORD: "placeholder",
    MYSQL_DATABASE: "placeholder",
    MYSQL_SSL: "false",
    RSS_SYNC_SECRET: "placeholder",
    RSS_SYNC_ADMIN_SECRET: "placeholder",
  });
}
fs.writeFileSync(
  path.join(out, "child-env-keys.txt"),
  Object.keys(env).sort().map((k) => (/PASSWORD|SECRET/.test(k) ? `${k}=<placeholder>` : `${k}=${k === "NODE_OPTIONS" || k === "PATH" ? env[k] : /^(MYSQL_|PORT|NODE_ENV|MEMATTR_|NEXT_)/.test(k) ? env[k] : "<set>"}`)).join("\n") + "\n",
);

const nextBin = path.join(dir, "node_modules", "next", "dist", "bin", "next");
const childArgs = [`--max-old-space-size=${maxOld}`, nextBin, "start", "-p", String(port), "-H", "127.0.0.1"];
const childLog = fs.openSync(path.join(out, "child.log"), "a");
const spawnedAt = Date.now();
const child = spawn(nodeExe, childArgs, { cwd: dir, env, stdio: ["ignore", childLog, childLog], windowsHide: true });
logLine({ event: "spawn", pid: child.pid, node: nodeExe, args: childArgs, cwd: dir, mode, label });
let exited = null;
child.on("exit", (code, sig) => {
  exited = { code, sig };
  logLine({ event: "child-exit", code, sig });
});

const base = `http://127.0.0.1:${port}`;
const ctl = async (p) => {
  try {
    const res = await fetch(`http://127.0.0.1:${ctlPort}${p}`, { signal: AbortSignal.timeout(600_000) });
    return await res.json();
  } catch (e) {
    return { error: String(e?.message || e) };
  }
};

const winProc = () => {
  if (process.platform !== "win32") return null;
  const ps = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", `$p=Get-Process -Id ${child.pid}; @{ws=$p.WorkingSet64;priv=$p.PrivateMemorySize64;peakws=$p.PeakWorkingSet64;vsz=$p.VirtualMemorySize64;paged=$p.PagedMemorySize64;threads=$p.Threads.Count;handles=$p.HandleCount} | ConvertTo-Json -Compress`],
    { encoding: "utf8", windowsHide: true, timeout: 20_000 },
  );
  try {
    return JSON.parse(ps.stdout.trim());
  } catch {
    return null;
  }
};
const recordWin = (tag) => {
  const w = winProc();
  if (w) fs.appendFileSync(path.join(out, "winproc.jsonl"), JSON.stringify({ at: new Date().toISOString(), tag, uptimeS: (Date.now() - spawnedAt) / 1000, ...w }) + "\n");
  return w;
};

const nowSec = () => (Date.now() - spawnedAt) / 1000;
const waitUntilSec = async (t) => {
  while (nowSec() < t) await sleep(Math.min(1000, Math.max(5, (t - nowSec()) * 1000)));
};

// ---- wait for ready -------------------------------------------------------
const waitReady = async () => {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (exited) throw new Error(`child exited early: ${JSON.stringify(exited)}`);
    try {
      // generous timeout: the first request after boot can be slow (cold disk / antivirus scan)
      const r = await fetch(`${base}${readyPath}`, { signal: AbortSignal.timeout(90_000) });
      if (r.status < 600) return nowSec();
    } catch {
      // not up yet
    }
    await sleep(250);
  }
  throw new Error("server did not become ready in 120 s");
};

const reqFile = path.join(out, "requests.csv");
if (!fs.existsSync(reqFile)) fs.writeFileSync(reqFile, "round,path,status,bytes,ms,at_sec\n");
const hit = async (round, p) => {
  const t0 = Date.now();
  let status = -1;
  let bytes = 0;
  try {
    const r = await fetch(base + p, {
      redirect: "manual",
      headers: { "user-agent": "Mozilla/5.0 (memory-attribution)", accept: "text/html,application/json,*/*" },
      signal: AbortSignal.timeout(90_000),
    });
    status = r.status;
    bytes = (await r.arrayBuffer()).byteLength;
  } catch (e) {
    status = -1;
    logLine({ event: "request-error", path: p, error: String(e?.message || e) });
  }
  fs.appendFileSync(reqFile, `${round},${p},${status},${bytes},${Date.now() - t0},${nowSec().toFixed(1)}\n`);
  return { status, bytes, ms: Date.now() - t0 };
};

const stop = async () => {
  if (!exited) {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true });
    for (let i = 0; i < 50 && !exited; i++) await sleep(100);
    if (!exited) child.kill("SIGKILL");
  }
};

process.on("SIGINT", async () => {
  await stop();
  process.exit(130);
});

try {
  const readyAt = await waitReady();
  logLine({ event: "ready", readySec: readyAt });
  recordWin("ready");

  if (mode === "series") {
    const events = [];
    if (doSweep) for (let t = sweepFirst, n = 1; t < durationSec; t += sweepEvery, n++) events.push({ t, type: "sweep", n });
    fullSweepAt.forEach((t, i) => events.push({ t, type: "fullsweep", n: i + 1 }));
    snapshotAt.forEach((t) => events.push({ t, type: "snapshot", name: `${label}-t${t}s` }));
    events.push({ t: durationSec, type: "end" });
    events.sort((a, b) => a.t - b.t);
    // timed checkpoints with a Windows view of the process (working set / private bytes)
    for (const t of [3, 30, 300, 1800]) if (t < durationSec) events.push({ t, type: "winproc" });
    events.sort((a, b) => a.t - b.t);

    for (const ev of events) {
      await waitUntilSec(ev.t);
      if (exited) throw new Error(`child exited: ${JSON.stringify(exited)}`);
      if (ev.type === "winproc") {
        recordWin(`t${ev.t}s`);
        await ctl(`/mark?label=${encodeURIComponent(`t${ev.t}s`)}`);
      } else if (ev.type === "sweep") {
        logLine({ event: "sweep-start", n: ev.n, atSec: nowSec() });
        await ctl(`/mark?label=sweep${ev.n}-start`);
        for (const p of sweepRoutes) await hit(ev.n, p);
        const m = await ctl(`/mark?label=sweep${ev.n}-done`);
        recordWin(`sweep${ev.n}-done`);
        logLine({ event: "sweep-done", n: ev.n, atSec: nowSec(), mem: m });
      } else if (ev.type === "fullsweep") {
        const routes = buildFullRoutes();
        logLine({ event: "fullsweep-start", n: ev.n, atSec: nowSec(), routes: routes.length });
        await ctl(`/mark?label=fullsweep${ev.n}-start`);
        for (const p of routes) await hit(`F${ev.n}`, p);
        const m = await ctl(`/mark?label=fullsweep${ev.n}-done`);
        recordWin(`fullsweep${ev.n}-done`);
        logLine({ event: "fullsweep-done", n: ev.n, atSec: nowSec(), mem: m });
      } else if (ev.type === "snapshot") {
        logLine({ event: "snapshot-start", name: ev.name, atSec: nowSec() });
        await ctl(`/mark?label=snapshot-${ev.t}s-pre-gc`);
        const r = await ctl(`/snapshot?name=${encodeURIComponent(ev.name)}`);
        logLine({ event: "snapshot-done", name: ev.name, atSec: nowSec(), result: r });
      } else if (ev.type === "end") {
        const g = await ctl("/gc");
        logLine({ event: "final-gc", result: g });
        recordWin("end");
        break; // nothing after "end" may run
      }
    }
  } else if (mode === "seeds") {
    await waitUntilSec(settleSec);
    // one cheap request so the framework path (router, RSC renderer) is initialised
    await hit(0, "/robots.txt");
    await sleep(2000);
    const rows = [];
    const snap = async () => {
      const g = await ctl("/gc");
      await sleep(300);
      const m = await ctl("/mem");
      const w = recordWin("seed-probe");
      return { mem: m, gc: g.after, win: w };
    };
    const first = await snap();
    rows.push({ probe: "(baseline after settle)", ...first });
    for (const probe of SEED_PROBES) {
      const before = await snap();
      const r1 = await hit(1, probe.path);
      await sleep(1500);
      const after1 = await snap();
      const r2 = await hit(2, probe.path);
      await sleep(1500);
      const after2 = await snap();
      rows.push({ probe: probe.name, path: probe.path, note: probe.note, before, request1: r1, after1, request2: r2, after2 });
      logLine({ event: "seed-probe", probe: probe.name, path: probe.path, status1: r1.status, bytes1: r1.bytes, heapBeforeMB: before.gc?.heapUsedMB, heapAfterMB: after1.gc?.heapUsedMB });
    }
    fs.writeFileSync(path.join(out, "seed-probes.json"), JSON.stringify(rows, null, 2));
  } else {
    throw new Error(`unknown --mode ${mode}`);
  }
} catch (e) {
  logLine({ event: "error", error: String(e?.stack || e) });
  console.error(e);
  process.exitCode = 1;
} finally {
  await stop();
  logLine({ event: "stopped" });
}
