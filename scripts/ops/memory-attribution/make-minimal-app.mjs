#!/usr/bin/env node
/**
 * Creates and builds the "Next baseline" control app (issue #709): the SAME
 * Next / React versions as the repo (read from its package-lock.json), same
 * distDir, but a single page that returns "ok" and no middleware or
 * instrumentation.
 *
 * It installs next/react/react-dom into --dest's OWN node_modules (outside the
 * repo, so nothing is added to the project and the repo's middleware.ts /
 * instrumentation.ts cannot leak into the build - building inside the repo
 * did exactly that).
 *
 * Usage: node make-minimal-app.mjs --repo <repo root (for package-lock.json)>
 *          --dest <new empty dir>
 * Run it with the same Node that will run the baseline.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2);
const opt = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : d;
};
const repo = path.resolve(opt("repo", "."));
const dest = path.resolve(opt("dest", ""));
if (!opt("dest")) {
  console.error("--dest is required");
  process.exit(2);
}
if (fs.existsSync(dest) && fs.readdirSync(dest).length > 0) {
  console.error(`--dest ${dest} is not empty`);
  process.exit(2);
}

const lock = JSON.parse(fs.readFileSync(path.join(repo, "package-lock.json"), "utf8"));
const version = (name) => {
  const v = lock.packages?.[`node_modules/${name}`]?.version;
  if (!v) throw new Error(`${name} not found in package-lock.json`);
  return v;
};
const specs = ["next", "react", "react-dom"].map((n) => `${n}@${version(n)}`);

fs.mkdirSync(path.join(dest, "app"), { recursive: true });
fs.writeFileSync(path.join(dest, "package.json"), JSON.stringify({ name: "minimal-ok", private: true, version: "0.0.0" }, null, 2));
fs.writeFileSync(path.join(dest, "next.config.js"), `module.exports = { distDir: ".next3", reactStrictMode: true };\n`);
fs.writeFileSync(
  path.join(dest, "app", "layout.js"),
  `export default function RootLayout({ children }) {\n  return (\n    <html lang="en">\n      <body>{children}</body>\n    </html>\n  );\n}\n`,
);
fs.writeFileSync(path.join(dest, "app", "page.js"), `export default function Page() {\n  return <p>ok</p>;\n}\n`);

const env = {};
for (const k of ["SystemRoot", "windir", "SystemDrive", "TEMP", "TMP", "COMSPEC", "PATHEXT", "PATH", "APPDATA", "USERPROFILE", "LOCALAPPDATA"]) {
  if (process.env[k] !== undefined) env[k] = process.env[k];
}
const npmCli = path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
const install = spawnSync(process.execPath, [npmCli, "install", "--no-audit", "--no-fund", "--save-exact", ...specs], { cwd: dest, env, stdio: "inherit" });
if (install.status !== 0) process.exit(install.status ?? 1);

delete env.APPDATA;
delete env.USERPROFILE;
delete env.LOCALAPPDATA;
env.NODE_ENV = "production";
env.NEXT_TELEMETRY_DISABLED = "1";
const build = spawnSync(process.execPath, [path.join(dest, "node_modules", "next", "dist", "bin", "next"), "build"], { cwd: dest, env, stdio: "inherit" });
if (build.status !== 0) process.exit(build.status ?? 1);
console.log(`minimal app ready in ${dest} (${specs.join(", ")})`);
