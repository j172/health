import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const REPO_ROOT = new URL("../", import.meta.url);

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return { url: "data:text/javascript,", shortCircuit: true };
    }
    let target = specifier;
    if (target.startsWith("@/")) {
      target = target.slice(2);
      const url = new URL(target, REPO_ROOT);
      for (const ext of [".ts", ".tsx", ".js", ".mjs", "/index.ts", "/index.js"]) {
        const candidate = new URL(target + ext, REPO_ROOT);
        if (existsSync(fileURLToPath(candidate))) {
          return nextResolve(candidate.href, context);
        }
      }
      return nextResolve(url.href, context);
    }
    return nextResolve(specifier, context);
  },
});

const { isGovSource } = await import("@/lib/server/news/sourceCategories");

test("isGovSource accurately identifies official agencies", () => {
  assert.equal(isGovSource("cdc"), true);
  assert.equal(isGovSource("tfda"), true);
  assert.equal(isGovSource("nhi"), true);
  assert.equal(isGovSource("mohw"), true);
  assert.equal(isGovSource("moenv"), true);
  assert.equal(isGovSource("cwa"), true);

  // Media and NPO sources are not gov
  assert.equal(isGovSource("ltn"), false);
  assert.equal(isGovSource("edh"), false);
  assert.equal(isGovSource("commonhealth"), false);
  assert.equal(isGovSource("children"), false);
});

test("Smart override logic: gov stock photo overridden, real assets preserved", () => {
  const isStockPhoto = (source) =>
    source === "pixabay" ||
    source === "pexels" ||
    source === "unsplash" ||
    source === "flickr";

  const shouldOverride = (item) => {
    const isGov = isGovSource(item.source_name);
    return !item.card_image_url || (isGov && isStockPhoto(item.card_image_source));
  };

  // Case 1: CDC with Pixabay photo -> OVERRIDDEN with ThematicCover
  assert.equal(
    shouldOverride({
      source_name: "cdc",
      card_image_url: "/images/news/pixabay/doctor.jpg",
      card_image_source: "pixabay",
    }),
    true
  );

  // Case 2: CDC with real epidemic chart from RSS -> PRESERVED
  assert.equal(
    shouldOverride({
      source_name: "cdc",
      card_image_url: "/images/news/articles/chart.png",
      card_image_source: "rss",
    }),
    false
  );

  // Case 3: Media news with Pixabay photo -> PRESERVED (Tier 2 fallback)
  assert.equal(
    shouldOverride({
      source_name: "ltn",
      card_image_url: "/images/news/pixabay/healthy-food.jpg",
      card_image_source: "pixabay",
    }),
    false
  );

  // Case 4: Media news with no photo -> OVERRIDDEN with ThematicCover (Tier 3 fallback)
  assert.equal(
    shouldOverride({
      source_name: "ltn",
      card_image_url: null,
      card_image_source: null,
    }),
    true
  );
});
