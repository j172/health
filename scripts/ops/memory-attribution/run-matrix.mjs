#!/usr/bin/env node
/**
 * Prepares one clean folder per instance and runs the whole #709 measurement
 * matrix IN PARALLEL (same wall clock, so cron-driven work lines up).
 *
 * Instances (A = with the 52 cron jobs, B = instrumentation register() emptied):
 *   {A,B}-long  RSS/heap series for --long-sec (default 7200) with a sweep every
 *               180 s from t=45 s and a "crawl every static route" round at
 *               600 s and 3600 s. No snapshots (a snapshot inflates RSS for good).
 *   {A,B}-s5    same schedule, heap snapshot at t=300 s
 *   {A,B}-s30   same schedule, heap snapshot at t=1800 s
 *   {A,B}-idle  no sweeps (only the readiness probe), 1800 s
 *   C           variant B + per-seed cost probes (mode seeds)
 *   M-long / M-s5   "ok" app, same Next version, for the Next baseline
 *
 * Other modes (same flags): `--startup-reps 3` (A, B and the "ok" app side by side, 330 s, repeated,
 * run it on a quiet machine), `--whatif` (A/B with next.config.js cacheMaxMemorySize changed in the
 * copy) and `--boot` (A/B with no sweeps, heap snapshot at 300 s = what a freshly booted server holds).
 *
 * Usage:
 *   node run-matrix.mjs --repo <built repo> --node <node20.exe> --root <empty work dir>
 *        [--minimal <dir built by make-minimal-app.mjs>] [--long-sec 7200] [--only A-s5,B-s5]
 *
 * Folders: <root>/dirs/<name> (runtime copies), <root>/out/<name> (results).
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const opt = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : d;
};
const repo = path.resolve(opt("repo", "."));
const nodeExe = path.resolve(opt("node", process.execPath));
const root = path.resolve(opt("root", ""));
const minimal = opt("minimal") ? path.resolve(opt("minimal")) : null;
const longSec = Number(opt("long-sec", 7200));
const only = opt("only") ? new Set(opt("only").split(",")) : null;
const has = (n) => argv.includes(`--${n}`);
const portBase = Number(opt("port-base", 0)); // add 100 etc. to run beside another matrix
if (!opt("root")) {
  console.error("--root is required");
  process.exit(2);
}

const common = ["--sweep", "--sweep-first-at-sec", "45", "--sweep-every-sec", "180"];
const minimalExtra = ["--sweep", "--sweep-routes", "/", "--ready-path", "/", "--sweep-first-at-sec", "45", "--sweep-every-sec", "180"];
const startupReps = Number(opt("startup-reps", 0));
let portSeed = 0;
const makeAdder = (plan) => (name, variant, extra, dirOverride = null, patch = null, stub = null) => {
  if (only && !only.has(name)) return;
  portSeed += 1;
  plan.push({ name, variant, extra, dirOverride, patch, stub, port: 3900 + portBase + portSeed, ctl: 4900 + portBase + portSeed });
};

/** groups run one after another; the instances inside a group run together */
const groups = [];
if (has("boot")) {
  // Boot composition: no sweeps at all (only the readiness probe), heap snapshot at t=300 s.
  const plan = [];
  const add = makeAdder(plan);
  add("A-boot-s5", "A", ["--duration-sec", "320", "--snapshot-at-sec", "300"]);
  add("B-boot-s5", "B", ["--duration-sec", "320", "--snapshot-at-sec", "300"]);
  groups.push(plan);
} else if (has("whatif")) {
  // What-if: same schedule as {A,B}-s30 (a full crawl at 600 s), but with ONE next.config.js option
  // changed in the folder copy. Compare their series with A-long / B-long over the first 1800 s.
  const plan = [];
  const add = makeAdder(plan);
  const sched = [...common, "--duration-sec", "1830", "--full-sweep-at-sec", "600", "--snapshot-at-sec", "1800"];
  add("W-A-nocache", "A", sched, null, "cacheMaxMemorySize: 0");
  add("W-A-cache10", "A", sched, null, "cacheMaxMemorySize: 10 * 1024 * 1024");
  add("W-B-nocache", "B", sched, null, "cacheMaxMemorySize: 0");
  // Next preloads EVERY page/route module at boot (experimental.preloadEntriesOnStart, default true).
  add("W-A-nopreload", "A", sched, null, "experimental: { preloadEntriesOnStart: false }");
  add("W-A-nopreload-nocache", "A", sched, null, "experimental: { preloadEntriesOnStart: false }, cacheMaxMemorySize: 0");
  add("W-B-nopreload", "B", sched, null, "experimental: { preloadEntriesOnStart: false }");
  // The dictionary seed taken out of the bundle (its JSON literal stubbed in the COPIED chunk), alone and with the cache off.
  const dict = "data/child-native-languages-seed.json";
  add("W-A-nodict", "A", sched, null, null, dict);
  add("W-A-nodict-nocache", "A", sched, null, "cacheMaxMemorySize: 0", dict);
  groups.push(plan);
} else if (startupReps > 0) {
  // Cold-start series: A, B and the "ok" app side by side, repeated, 330 s each, no snapshots.
  // Run this on an otherwise quiet machine (the big matrix inflates the first-minute numbers).
  // --solo runs one instance at a time (the only way to get a trustworthy 3 s / 30 s reading:
  // with several instances booting together, first-request load times stretch from ~2 s to ~25 s).
  const startupSec = String(opt("startup-sec", "330"));
  for (let rep = 1; rep <= startupReps; rep++) {
    const plan = [];
    const add = makeAdder(plan);
    add(`A-start${rep}`, "A", [...common, "--duration-sec", startupSec]);
    add(`B-start${rep}`, "B", [...common, "--duration-sec", startupSec]);
    if (minimal) add(`M-start${rep}`, "M", [...minimalExtra, "--duration-sec", startupSec], minimal);
    if (has("solo")) for (const p of plan) groups.push([p]);
    else groups.push(plan);
  }
} else {
  const plan = [];
  const add = makeAdder(plan);
  for (const v of ["A", "B"]) {
    add(`${v}-long`, v, [...common, "--duration-sec", String(longSec), "--full-sweep-at-sec", "600,3600"]);
    add(`${v}-s5`, v, [...common, "--duration-sec", "320", "--snapshot-at-sec", "300"]);
    add(`${v}-s30`, v, [...common, "--duration-sec", "1830", "--full-sweep-at-sec", "600", "--snapshot-at-sec", "1800"]);
    add(`${v}-idle`, v, ["--duration-sec", "1800"]);
  }
  add("C", "B", ["--mode", "seeds", "--settle-sec", "120"]);
  if (minimal) {
    add("M-long", "M", [...minimalExtra, "--duration-sec", "1800"], minimal);
    add("M-s5", "M", [...minimalExtra, "--duration-sec", "320", "--snapshot-at-sec", "300"], minimal);
  }
  groups.push(plan);
}

fs.mkdirSync(path.join(root, "dirs"), { recursive: true });
fs.mkdirSync(path.join(root, "out"), { recursive: true });

let anyFailed = false;
for (const plan of groups) {
  // 1. prepare folders (sequential: they copy ~340 MB each)
  for (const p of plan) {
    p.dir = path.join(root, "dirs", p.name);
    if (p.dirOverride) {
      // The minimal app is built once; each instance gets its own cwd copy so logs/cache do not collide.
      fs.cpSync(p.dirOverride, p.dir, { recursive: true, dereference: false });
      continue;
    }
    const prepArgs = [path.join(here, "prepare-isolated-dir.mjs"), "--repo", repo, "--dest", p.dir, "--variant", p.variant];
    if (p.patch) prepArgs.push("--next-config-patch", p.patch);
    if (p.stub) prepArgs.push("--stub-json", p.stub);
    const r = spawnSync(process.execPath, prepArgs, { stdio: "inherit" });
    if (r.status !== 0) process.exit(r.status ?? 1);
  }

  // 2. launch the group at once and wait for all of it
  const children = plan.map((p) => {
    const out = path.join(root, "out", p.name);
    fs.mkdirSync(out, { recursive: true });
    const log = fs.openSync(path.join(out, "run-instance.log"), "a");
    const args = [path.join(here, "run-instance.mjs"), "--dir", p.dir, "--node", nodeExe, "--out", out, "--port", String(p.port), "--ctl-port", String(p.ctl), "--label", p.name, ...p.extra];
    const child = spawn(nodeExe, args, { stdio: ["ignore", log, log], windowsHide: true });
    console.log(`${new Date().toISOString()} started ${p.name} pid=${child.pid} port=${p.port}`);
    return new Promise((resolve) => child.on("exit", (code) => resolve({ name: p.name, code })));
  });
  const results = await Promise.all(children);
  for (const r of results) console.log(`${new Date().toISOString()} finished ${r.name} exit=${r.code}`);
  if (results.some((r) => r.code !== 0)) anyFailed = true;
}
process.exitCode = anyFailed ? 1 : 0;
