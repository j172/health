#!/usr/bin/env node
/**
 * Fetches MOHW's 全國社福中心福利服務中心通訊錄 (data.gov.tw 160903, ~158 rows,
 * a Big5 CSV) and pushes the parsed records to production's
 * /api/admin/facilities-import endpoint.
 *
 * Why this runs locally instead of via the deployed app's own facilities-
 * sync: opendata.mohw.gov.tw is a mohw.gov.tw subdomain, the same apex
 * domain as ltcpap.mohw.gov.tw — confirmed unreachable from both the
 * production host and GitHub Actions runners. Issue #603 re-confirmed this
 * empirically for this exact dataset via .github/workflows/egress-probe.yml
 * on 2026-10-14: a GitHub Actions runner's curl timed out after 25s, and a
 * probe from the production host over the SSH loopback
 * (scripts/gha-egress-probe-host.mjs) timed out after 20s — both legs
 * unreachable. This script (running on a regular residential/office
 * network) confirms the same IP-range block rather than a code bug, same
 * pattern as scripts/import-mohw-disability-welfare.mjs /
 * import-mohw-elder-welfare.mjs.
 *
 * Unlike those two scripts (which duplicate their own small CSV-parsing
 * helpers in scripts/lib/mohw-csv.mjs), this one reuses the real, unit-
 * tested parsing/address-repair logic in
 * lib/server/facilities/sources/mohwSocialWelfareCenter.ts directly — via
 * the same `registerHooks` TS-import shim already used by several other
 * non-test scripts in this repo (e.g. scripts/audit-all-tools-health.mjs,
 * scripts/verify-hospital-search-names.mjs) — rather than reimplementing
 * the address cleanup (annotation-stripping, the "巿"/"市" homoglyph fix,
 * the trailing-"?" artifact strip, county-prefixing) a second time.
 *
 * Usage:
 *   ADMIN_SECRET=<x-rss-sync-admin-secret value> node scripts/import-mohw-social-welfare-centers.mjs
 */
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";
import { submitFacilities } from "./lib/mohw-csv.mjs";

const REPO_ROOT = new URL("../", import.meta.url);

// The fetch module is TypeScript and uses this repo's "@/..." path alias.
// Node >= 22.18 strips the types on its own; this hook only teaches it that
// "@/..." means repo-root-relative, and that an extensionless relative
// import means the .ts file — exactly as lib/**/*.test.mjs do.
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

const { fetchMohwSocialWelfareCenters } = await import(
  "../lib/server/facilities/sources/mohwSocialWelfareCenter.ts"
);

const BASE_URL = process.env.HEALTH_BASE_URL || "https://health.j172.tw";
const ADMIN_SECRET = process.env.ADMIN_SECRET;

if (!ADMIN_SECRET) {
  console.error("Missing ADMIN_SECRET env var (the x-rss-sync-admin-secret value).");
  process.exit(1);
}

async function main() {
  console.log("Fetching MOHW social welfare center directory (160903)...");
  const records = await fetchMohwSocialWelfareCenters();
  console.log(`  ${records.length} records after identity-field filtering`);

  console.log(`Importing ${records.length} social welfare centers...`);
  const result = await submitFacilities(BASE_URL, ADMIN_SECRET, records);
  console.log("Import result:", result);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
