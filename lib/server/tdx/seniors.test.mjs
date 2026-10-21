import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const { TDX_SENIORS_API_BASE } = await import("./seniors.ts");

const read = (relative) =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");

test("TDX seniors base URL matches the server + path prefix in TDX's Senior OpenAPI document", () => {
  // servers[0].url = https://tdx.transportdata.tw/api/seniors, paths = /V1/Senior/...
  assert.equal(TDX_SENIORS_API_BASE, "https://tdx.transportdata.tw/api/seniors/V1/Senior");
});

test("Rail and SeniorCard clients derive from the shared base, never the 404ing advanced-tier guess", () => {
  const rail = read("../transit/tdxSeniorClient.ts");
  const card = read("../seniorCard/tdxClient.ts");

  assert.match(rail, /SENIOR_RAIL_BASE = `\$\{TDX_SENIORS_API_BASE\}\/Rail\/Station`/);
  assert.match(card, /SENIOR_CARD_BASE = `\$\{TDX_SENIORS_API_BASE\}\/SeniorCard`/);

  // Comments may still name the old guess for context; only code is checked.
  const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  for (const source of [rail, card]) {
    assert.doesNotMatch(stripComments(source), /api\/(advanced|basic)\/v\d\/Senior/i);
  }
});
