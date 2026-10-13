import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// lib/server/db/schema.ts and mysql.ts both have `import "server-only"`
// upstream in their dependency chain in a Next.js build, so this scans the
// source text directly — same approach tests/no-server-fetch.test.mjs and
// tests/httpclient-shared-tls-agent-401.test.mjs use.
const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));
const schemaSource = fs.readFileSync(
  path.join(REPO_ROOT, "lib", "server", "db", "schema.ts"),
  "utf-8",
);
const mysqlSource = fs.readFileSync(
  path.join(REPO_ROOT, "lib", "server", "db", "mysql.ts"),
  "utf-8",
);
const ingestSource = fs.readFileSync(
  path.join(REPO_ROOT, "lib", "server", "culture", "ingestPublicArt.ts"),
  "utf-8",
);

test("public_arts' CREATE TABLE declares extra_json, so a fresh database has it from the start", () => {
  const tableStart = schemaSource.indexOf("CREATE TABLE IF NOT EXISTS public_arts");
  assert.ok(tableStart !== -1, "expected to find public_arts' CREATE TABLE");
  const tableEnd = schemaSource.indexOf(";", tableStart);
  const tableDdl = schemaSource.slice(tableStart, tableEnd);
  assert.match(tableDdl, /extra_json\s+JSON\s+NULL/i);
});

test("ensureSchema() migrates an existing public_arts table to add extra_json (issue found 2026-10-13: ingestPublicArt.ts's INSERT always referenced it, but no CREATE or ALTER ever declared it)", () => {
  assert.match(
    mysqlSource,
    /ALTER TABLE public_arts\s*\n\s*ADD COLUMN IF NOT EXISTS extra_json JSON NULL/,
  );
});

test("ingestPublicArt.ts's INSERT still references extra_json (sanity: the column this migration adds is actually used)", () => {
  assert.match(ingestSource, /extra_json/);
});
