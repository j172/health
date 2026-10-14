/**
 * Issue #587 (parent #583): WebGL-unsupported fallback. The acceptance
 * criteria require that an environment without WebGL "顯示退回文字說明，不
 * 嘗試載入地球、不拋出錯誤" — so the detection itself must never throw (a
 * browser with WebGL disabled by policy can throw from `getContext` rather
 * than just returning `null`).
 *
 * `detectWebglSupport` is the testable half: it takes the actual probe as a
 * parameter so a unit test can simulate "probe throws", "probe returns
 * false", "probe returns true" without touching a real `<canvas>` or DOM.
 * `defaultWebglProbe` is the real, DOM-touching probe GlobeWatchClient.tsx
 * uses in the browser — untested here per this repo's convention of not unit
 * testing code that requires an actual browser (see tests/baseMap.test.mjs).
 */

export function detectWebglSupport(probe: () => boolean): boolean {
  try {
    return Boolean(probe());
  } catch {
    return false;
  }
}

/** Real browser probe: tries WebGL2 first, then WebGL1, on a throwaway canvas. */
export function defaultWebglProbe(): boolean {
  if (typeof document === "undefined") return false;
  const canvas = document.createElement("canvas");
  return Boolean(
    canvas.getContext("webgl2") ||
      canvas.getContext("webgl") ||
      canvas.getContext("experimental-webgl"),
  );
}
