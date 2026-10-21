import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// MapLibre GL JS 6 resolves its worker as `./maplibre-gl-worker.mjs` next to the bundled
// chunk. Next never emits it there, so every /tools/global-watch/* page died with
// "Worker failed to load" and then "Style is not done loading" (setProjection too early).
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const GLOBES = ["Globe", "EpidemicsGlobe", "TyphoonsGlobe", "AirQualityGlobe"].map((n) => `components/Tools/GlobeWatch/GlobeWatch${n}.tsx`);

test("the self-hosted worker is byte-identical to the installed maplibre-gl worker", () => {
  const vendored = fs.readFileSync(new URL("../public/maplibre/maplibre-gl-worker.mjs", import.meta.url));
  const installed = fs.readFileSync(new URL("../node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url));
  assert.ok(vendored.equals(installed), "public/maplibre/maplibre-gl-worker.mjs is stale: re-copy it from node_modules/maplibre-gl/dist/");
});

test("the worker URL helper points at the self-hosted copy and carries the library version", () => {
  const src = read("lib/tools/globeWatch/mapWorker.ts");
  assert.match(src, /MAPLIBRE_WORKER_PATH = "\/maplibre\/maplibre-gl-worker\.mjs"/);
  assert.match(src, /setWorkerUrl\(`\$\{MAPLIBRE_WORKER_PATH\}\?v=\$\{getVersion\(\)\}`\)/);
});

for (const file of GLOBES) {
  test(`${file}: configures the worker before the map and defers setProjection to style.load`, () => {
    const src = read(file);
    const configure = src.indexOf("configureMapLibreWorker();");
    const construct = src.indexOf("new MapLibreMap({");
    assert.ok(configure > 0 && construct > configure, "configureMapLibreWorker() must run before new MapLibreMap");
    assert.match(src, /map\.on\("style\.load", \(\) => map\.setProjection\(\{ type: "globe" \}\)\)/);
    assert.doesNotMatch(src, /^\s*map\.setProjection\(/m, "setProjection must not be called synchronously after construction");
  });
}
