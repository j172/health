// Test-only module hooks shared by the garbage-route sync tests and their
// child-process helper. Lets a plain `node --test` / `node` process import the
// repo's TypeScript source directly:
//   - "server-only" becomes an empty module,
//   - "@/..." resolves against the repo root and extension-less relative imports
//     pick up .ts / .tsx,
//   - any specifier in `stubs` is swapped for the given module URL (used to stub
//     the MySQL pool and the HTTP client, which the sync reaches through "@/...").
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const REPO_ROOT = new URL("../../../../", import.meta.url);

/** A data: URL for an inline ES module — the cheapest way to hand registerRepoHooks a stub. */
export const stubModule = (source) => `data:text/javascript,${encodeURIComponent(source)}`;

export function registerRepoHooks(stubs = {}) {
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier === "server-only") {
        return { url: "data:text/javascript,", shortCircuit: true };
      }
      if (Object.hasOwn(stubs, specifier)) {
        return { url: stubs[specifier], shortCircuit: true };
      }
      let target = specifier;
      let parentURL = context.parentURL;
      if (specifier.startsWith("@/")) {
        target = `./${specifier.slice(2)}`;
        parentURL = REPO_ROOT.href;
      }
      if (target.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(target)) {
        for (const extension of [".ts", ".tsx"]) {
          const candidate = new URL(target + extension, parentURL);
          if (existsSync(fileURLToPath(candidate))) {
            return nextResolve(target + extension, { ...context, parentURL });
          }
        }
      }
      return nextResolve(target, { ...context, parentURL });
    },
  });
}

export const repoRootUrl = REPO_ROOT;
