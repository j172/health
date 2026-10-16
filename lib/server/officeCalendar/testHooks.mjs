// Test-only module loader setup for the office-calendar tests (issue #691).
// Import this FIRST in a test file, then load the TypeScript modules with
// `await import("./x.ts")`. It is not matched by the `lib/**/*.test.mjs`
// glob, so `npm test` never runs it on its own.
//
// What it does, same as the hooks copied into the repo's other tests:
//  - `server-only` becomes an empty module;
//  - `@/...` resolves against the repo root;
//  - extensionless relative imports (`./queries`, `../water/wraCsvParser`)
//    resolve to .ts / .tsx / .mjs / .js, which Node's TypeScript stripping
//    does not do by itself;
//  - `.json` imports load as JSON (lib/i18n/dictionary.ts imports locale files).
import fs from "node:fs";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";

const REPO_ROOT = new URL("../../../", import.meta.url);

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return { url: "data:text/javascript,", shortCircuit: true };
    }
    let target = specifier;
    let parentURL = context.parentURL;
    if (specifier.startsWith("@/")) {
      target = `./${specifier.slice(2)}`;
      parentURL = REPO_ROOT.href;
    }
    if (target.startsWith(".") && !/\.[cm]?[jt]sx?$|\.json$/.test(target)) {
      for (const extension of [".ts", ".tsx", ".mjs", ".js"]) {
        const candidate = new URL(target + extension, parentURL);
        if (existsSync(fileURLToPath(candidate))) {
          return nextResolve(target + extension, { ...context, parentURL });
        }
      }
    }
    return nextResolve(target, { ...context, parentURL });
  },
  load(url, context, nextLoad) {
    if (url.endsWith(".json")) {
      return { format: "json", source: fs.readFileSync(fileURLToPath(url), "utf8"), shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});

export const REPO_ROOT_URL = REPO_ROOT;

/** Reads a fixture of lib/server/officeCalendar/__fixtures__ as raw bytes. */
export const readFixtureBytes = (name) =>
  fs.readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)));
