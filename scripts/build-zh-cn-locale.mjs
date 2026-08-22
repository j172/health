/**
 * Generates locales/zh-CN.json from locales/zh-TW.json.
 *
 * zh-CN's static UI strings are a mechanical Traditional -> Simplified
 * conversion of the zh-TW ones, so keeping them by hand would guarantee drift:
 * every new zh-TW key would silently fall back to Traditional text for
 * Simplified readers. Regenerate instead:
 *
 *   node scripts/build-zh-cn-locale.mjs
 *
 * Uses the same converter the app uses at runtime for live API strings
 * (OpenCC.Converter({ from: "tw", to: "cn" }), per SPECIFICATION.md 4.3), so the
 * static and dynamic halves of the translation agree.
 *
 * Keys under `catalog` are skipped: that namespace holds English tool titles and
 * is only ever read when the locale is `en`.
 */

import fs from "node:fs";
import path from "node:path";
import * as OpenCC from "opencc-js";

const convert = OpenCC.Converter({ from: "tw", to: "cn" });

const source = path.join(process.cwd(), "locales", "zh-TW.json");
const target = path.join(process.cwd(), "locales", "zh-CN.json");

const convertValue = (value) => {
  if (typeof value === "string") return convert(value);
  if (Array.isArray(value)) return value.map(convertValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, convertValue(nested)]),
    );
  }
  return value;
};

const dictionary = JSON.parse(fs.readFileSync(source, "utf-8"));

const converted = Object.fromEntries(
  Object.entries(dictionary).map(([key, value]) => [
    key,
    key === "catalog" ? value : convertValue(value),
  ]),
);

fs.writeFileSync(target, `${JSON.stringify(converted, null, 2)}\n`, "utf-8");

const countStrings = (value) =>
  typeof value === "string"
    ? 1
    : value && typeof value === "object"
      ? Object.values(value).reduce(
          (sum, nested) => sum + countStrings(nested),
          0,
        )
      : 0;

console.log(
  `Wrote ${target} (${countStrings(converted)} strings from ${Object.keys(converted).length} namespaces).`,
);
