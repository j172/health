import { getVersion, setWorkerUrl } from "maplibre-gl";

/**
 * MapLibre GL JS 6 finds its web worker by resolving `./maplibre-gl-worker.mjs`
 * against the URL of the file the library was bundled into. Next puts the library
 * into `/_next/static/chunks/<hash>.js` and never emits the worker beside it, so the
 * default URL 404s ("Worker failed to load") and every globe page crashed.
 *
 * The worker is a self-contained module, so a verbatim copy of
 * `node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs` is served from `public/`
 * and pointed at explicitly. tests/globe-maplibre-worker.test.mjs fails when the copy
 * drifts from the installed package (re-copy after upgrading maplibre-gl).
 */
export const MAPLIBRE_WORKER_PATH = "/maplibre/maplibre-gl-worker.mjs";

/** Call before the first `new Map(...)`; the worker pool is created with the first map. */
export function configureMapLibreWorker(): void {
  setWorkerUrl(`${MAPLIBRE_WORKER_PATH}?v=${getVersion()}`);
}
