/**
 * Issue #587 (parent #583): `prefers-reduced-motion` handling for the globe.
 * Pure decision logic only — no `matchMedia`, no MapLibre camera calls —
 * so it's unit-testable without a browser. The DOM-touching half (reading
 * `window.matchMedia("(prefers-reduced-motion: reduce)")` and actually
 * calling `map.flyTo`/`map.jumpTo`) lives in GlobeWatchGlobe.tsx and is
 * verified manually (see PR description), matching this repo's established
 * convention for DOM-only glue code (see tests/baseMap.test.mjs's note on
 * BaseMap.tsx itself).
 *
 * Per #583's decision ("預設不自動旋轉。prefers-reduced-motion 開啟時，所有
 * flyTo 改成瞬間跳轉"): the globe never auto-rotates regardless of this
 * setting (there's no idle-auto-rotate feature in this skeleton at all —
 * `AUTO_ROTATE_ENABLED` exists so that invariant is explicit and guarded by
 * a test, not just an absence of code), and camera transitions collapse to
 * an instant jump only when reduced motion is requested.
 */

/** The globe never auto-rotates on its own, independent of motion preference (see module doc comment). */
export const AUTO_ROTATE_ENABLED = false;

export type CameraTransitionMode = "jump" | "fly";

/** Which MapLibre camera method a view change (e.g. the "回到台灣" reset button) should use. */
export function resolveCameraTransition(reducedMotion: boolean): CameraTransitionMode {
  return reducedMotion ? "jump" : "fly";
}

/** Animation duration (ms) a `flyTo`-style transition should use; 0 under reduced motion collapses it to an instant jump. */
export function resolveFlyDurationMs(reducedMotion: boolean, baseDurationMs: number): number {
  return reducedMotion ? 0 : baseDurationMs;
}
