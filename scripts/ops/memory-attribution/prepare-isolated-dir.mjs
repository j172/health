#!/usr/bin/env node
/**
 * Builds a clean, secret-free runtime folder for `next start` memory
 * measurements (issue #709).
 *
 * The folder receives ONLY what the production host runs from:
 *   .next3/            the build output (distDir in next.config.js)
 *   next.config.js, package.json
 *   public/            + public/data/ (the deploy copies data/* there)
 *   data/              runtime fs reads (readSeedJson, culture seeds, ...)
 *   lib/server/news/data/
 *   node_modules       a junction to the repo's node_modules (not copied)
 *
 * It never copies a dotenv file, and finishes by scanning the result: if a
 * file named `.env*` exists anywhere outside node_modules the script fails.
 *
 * Variant B (no cron graph): rewrites ONLY the copied `.next3` output so the
 * `register` function of instrumentation becomes empty. Source files are never
 * touched.
 *
 * Usage:
 *   node prepare-isolated-dir.mjs --repo <repo root that ran `npm run build`>
 *        --dest <new empty dir> [--variant A|B] [--node-modules <dir>]
 *        [--next-config-patch "cacheMaxMemorySize: 0"]   (what-if runs, copy only)
 *        [--stub-json data/child-native-languages-seed.json]   (what-if runs, copy only)
 *   node prepare-isolated-dir.mjs --verify <dir>      (only run the .env scan)
 */
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const opt = (name, fallback = undefined) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};

/** Returns the dotenv-style files found under `root`, skipping node_modules. */
export function findEnvFiles(root) {
  const found = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === "node_modules") continue;
      const full = path.join(dir, entry.name);
      if (/^\.env($|\.)/i.test(entry.name)) found.push(full);
      if (entry.isDirectory()) walk(full);
    }
  };
  walk(root);
  return found;
}

const verifyDir = opt("verify");
if (verifyDir) {
  const found = findEnvFiles(path.resolve(verifyDir));
  if (found.length) {
    console.error(`FAIL: dotenv-style files present:\n${found.join("\n")}`);
    process.exit(1);
  }
  console.log(`OK: no .env* file under ${path.resolve(verifyDir)} (node_modules skipped)`);
  process.exit(0);
}

const repo = path.resolve(opt("repo", "."));
const dest = path.resolve(opt("dest", ""));
const variant = (opt("variant", "A") || "A").toUpperCase();
const nodeModules = path.resolve(opt("node-modules", path.join(repo, "node_modules")));

if (!opt("dest")) {
  console.error("--dest is required");
  process.exit(2);
}
if (!["A", "B"].includes(variant)) {
  console.error("--variant must be A or B");
  process.exit(2);
}
if (fs.existsSync(dest) && fs.readdirSync(dest).length > 0) {
  console.error(`--dest ${dest} exists and is not empty`);
  process.exit(2);
}
if (!fs.existsSync(path.join(repo, ".next3", "BUILD_ID"))) {
  console.error(`${repo}/.next3/BUILD_ID not found: run \`npm run build\` first`);
  process.exit(2);
}

const copyDir = (from, to) => {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.cpSync(from, to, {
    recursive: true,
    filter: (src) => {
      if (/^\.env($|\.)/i.test(path.basename(src))) return false;
      // Turbopack's persistent *build* cache (hundreds of MB). `next start`
      // never reads it, so leaving it out does not change runtime memory.
      if (src.split(path.sep).slice(-3).join("/") === ".next3/cache/turbopack") return false;
      // Turbopack's hashed external aliases (e.g. node-cron-<hash>) are
      // symlinks to absolute build-machine paths; they are re-created below.
      if (src.split(path.sep).slice(-2).join("/") === ".next3/node_modules") return false;
      return true;
    },
  });
};

fs.mkdirSync(dest, { recursive: true });
copyDir(path.join(repo, ".next3"), path.join(dest, ".next3"));
fs.copyFileSync(path.join(repo, "next.config.js"), path.join(dest, "next.config.js"));
fs.copyFileSync(path.join(repo, "package.json"), path.join(dest, "package.json"));
copyDir(path.join(repo, "public"), path.join(dest, "public"));
copyDir(path.join(repo, "data"), path.join(dest, "data"));
// deploy-ftps.yml: `cp -r data/* public/data/` before packaging public/
copyDir(path.join(repo, "data"), path.join(dest, "public", "data"));
copyDir(path.join(repo, "lib", "server", "news", "data"), path.join(dest, "lib", "server", "news", "data"));
fs.symlinkSync(nodeModules, path.join(dest, "node_modules"), "junction");
{
  const srcAliases = path.join(repo, ".next3", "node_modules");
  if (fs.existsSync(srcAliases)) {
    const dstAliases = path.join(dest, ".next3", "node_modules");
    fs.mkdirSync(dstAliases, { recursive: true });
    for (const name of fs.readdirSync(srcAliases)) {
      const target = fs.realpathSync(path.join(srcAliases, name));
      fs.symlinkSync(target, path.join(dstAliases, name), "junction");
      console.log(`alias ${name} -> ${target}`);
    }
  }
}

if (variant === "B") {
  const chunkDir = path.join(dest, ".next3", "server", "chunks");
  // The instrumentation entry points at one chunk that defines `register`.
  const entry = fs.readFileSync(path.join(dest, ".next3", "server", "instrumentation.js"), "utf8");
  const chunkRel = /R\.c\("(server\/chunks\/[^"]+)"\)/.exec(entry)?.[1];
  if (!chunkRel) throw new Error("cannot find the instrumentation chunk in instrumentation.js");
  const chunkPath = path.join(dest, ".next3", chunkRel.replace(/^server\//, "server/"));
  let code = fs.readFileSync(chunkPath, "utf8");
  // `async function r(){ ... registerCronJobs ... }e.s(["register",0,r])`
  const pattern = /async function (\w+)\(\)\{[\s\S]*?registerCronJobs[\s\S]*?\}e\.s\(\["register",0,\1\]\)/;
  if (!pattern.test(code)) throw new Error(`register() shape not recognised in ${chunkRel}`);
  code = code.replace(pattern, (_all, fn) => `async function ${fn}(){}e.s(["register",0,${fn}])`);
  fs.writeFileSync(chunkPath, code);
  fs.writeFileSync(path.join(dest, "VARIANT_B_PATCH.txt"), `register() emptied in ${chunkRel}\n`);
  console.log(`variant B: emptied register() in ${chunkRel}`);
  void chunkDir;
}

// What-if runs only: --stub-json <data/x.json> replaces that bundled JSON's `JSON.parse('...')` literal
// (in the COPIED .next3 chunks) with a tiny object, to measure the memory a bundled seed costs.
// The stub keeps the shape {version, generatedAt, languages:{twblg,hakka:{count,entries}}} that
// lib/server/dictionary/service.ts expects; only meant for data/child-native-languages-seed.json.
const stubJson = opt("stub-json");
if (stubJson) {
  const chunkDir = path.join(dest, ".next3", "server", "chunks");
  const stub = '{"version":"stub","generatedAt":"stub","languages":{"twblg":{"count":0,"entries":[]},"hakka":{"count":0,"entries":[]}}}';
  let patched = 0;
  for (const f of fs.readdirSync(chunkDir)) {
    if (!f.endsWith(".js")) continue;
    const mapPath = path.join(chunkDir, `${f}.map`);
    if (!fs.existsSync(mapPath)) continue;
    const mapText = fs.readFileSync(mapPath, "utf8");
    if (!mapText.includes(stubJson.replace(/^\.?\/?/, ""))) continue;
    const jsPath = path.join(chunkDir, f);
    let js = fs.readFileSync(jsPath, "utf8");
    const start = js.indexOf("JSON.parse('");
    if (start < 0) continue;
    let p = start + "JSON.parse('".length;
    const litStart = p;
    while (p < js.length) {
      if (js[p] === "\\") p += 2;
      else if (js[p] === "'") break;
      else p++;
    }
    if (p - litStart < 1_000_000) continue; // only the big literal
    js = js.slice(0, litStart) + stub + js.slice(p);
    fs.writeFileSync(jsPath, js);
    patched++;
    console.log(`stubbed ${stubJson} in ${f} (${((p - litStart) / 1048576).toFixed(1)} M chars -> ${stub.length})`);
  }
  if (!patched) throw new Error(`no chunk contains a big JSON.parse literal for ${stubJson}`);
  fs.writeFileSync(path.join(dest, "STUB_JSON.txt"), `${stubJson}\n`);
}

// What-if runs only: add one top-level next.config.js option to the COPY (never to the repo),
// e.g. --next-config-patch "cacheMaxMemorySize: 0". `next start` reads next.config.js fresh from cwd.
const configPatch = opt("next-config-patch");
if (configPatch) {
  const cfgPath = path.join(dest, "next.config.js");
  const cfg = fs.readFileSync(cfgPath, "utf8");
  if (!cfg.includes("reactStrictMode: true,")) throw new Error("next.config.js anchor `reactStrictMode: true,` not found");
  fs.writeFileSync(cfgPath, cfg.replace("reactStrictMode: true,", `reactStrictMode: true,\n  ${configPatch},`));
  fs.writeFileSync(path.join(dest, "NEXT_CONFIG_PATCH.txt"), `${configPatch}\n`);
  console.log(`next.config.js (copy) patched with: ${configPatch}`);
}

fs.writeFileSync(path.join(dest, "VARIANT.txt"), `${variant}\n`);

const envFiles = findEnvFiles(dest);
if (envFiles.length) {
  console.error(`FAIL: dotenv-style files present:\n${envFiles.join("\n")}`);
  process.exit(1);
}
console.log(`prepared ${dest} (variant ${variant}); no .env* file found outside node_modules`);
