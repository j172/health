import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
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

const { z } = await import("zod");
const { validateImportRows } = await import("./importSchema.ts");

const schema = z.object({
  name: z.string().nullable(),
  address: z.string().nullable(),
});

test("validateImportRows: accepts well-formed rows", () => {
  assert.doesNotThrow(() =>
    validateImportRows("test-source", schema, [
      { name: "醫院A", address: "台北市中正區" },
      { name: "醫院B", address: "台中市西區" },
    ]),
  );
});

test("validateImportRows: tolerates a row's legitimately null/empty critical field (not a schema change)", () => {
  assert.doesNotThrow(() =>
    validateImportRows("test-source", schema, [
      { name: "醫院A", address: null },
      { name: "醫院B", address: "" },
    ]),
  );
});

test("validateImportRows: tolerates unrelated extra fields upstream may have added", () => {
  assert.doesNotThrow(() =>
    validateImportRows("test-source", schema, [
      { name: "醫院A", address: "台北市中正區", newUnrelatedField: 123 },
    ]),
  );
});

test("validateImportRows: throws a descriptive error when a critical field is renamed/removed upstream", () => {
  assert.throws(
    () =>
      validateImportRows("test-source", schema, [
        // "name" renamed to "orgName" upstream — every row now lacks "name".
        { orgName: "醫院A", address: "台北市中正區" },
        { orgName: "醫院B", address: "台中市西區" },
      ]),
    (err) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /test-source schema validation failed/);
      assert.match(err.message, /2\/2 row\(s\)/);
      assert.match(err.message, /field "name"/);
      return true;
    },
  );
});

test("validateImportRows: throws when a critical field changes type upstream", () => {
  assert.throws(
    () =>
      validateImportRows("test-source", schema, [{ name: 12345, address: "台北市中正區" }]),
    /field "name"/,
  );
});

test("validateImportRows: throws when the upstream response is not an array at all", () => {
  assert.throws(
    () => validateImportRows("test-source", schema, { error: "rate limited" }),
    /expected an array/,
  );
});

test("validateImportRows: does not throw on an empty array (row-count checks are a separate concern)", () => {
  assert.doesNotThrow(() => validateImportRows("test-source", schema, []));
});
