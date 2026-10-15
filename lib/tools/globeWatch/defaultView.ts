/**
 * Issue #587 (parent #583): the globe's default camera — "預設中心是台灣，
 * 縮放到看得見整個西太平洋的程度" — and the view the "回到台灣" reset button
 * restores. `zoom: 2.6` on a `projection: "globe"` map keeps Taiwan centered
 * while the viewport still spans the western Pacific (roughly Japan down to
 * the Philippines/Indonesia, mainland China out to past Guam) — exact
 * framing is a visual judgment call left for manual verification (see PR
 * description), but the center/zoom pair itself is a plain exported
 * constant so both the initial mount and the reset button use the exact
 * same value instead of two hand-copied literals drifting apart.
 */

export interface GlobeCameraView {
  /** [longitude, latitude] — MapLibre's `center` order, not [lat, lng]. */
  center: [number, number];
  zoom: number;
  pitch: number;
  bearing: number;
}

export const TAIWAN_DEFAULT_VIEW: GlobeCameraView = {
  center: [121.0, 23.5],
  zoom: 2.6,
  pitch: 0,
  bearing: 0,
};

/** Default "回到台灣" flyTo duration (ms) when motion is not reduced; see lib/tools/globeWatch/motion.ts. */
export const RESET_VIEW_FLY_DURATION_MS = 1600;

/**
 * Issue #588 (parent #583): "點擊清單項目時地球飛到該地震的位置" — flyTo duration
 * (ms) and target zoom for jumping the camera to a single earthquake, kept
 * as their own constants (rather than reusing RESET_VIEW_FLY_DURATION_MS)
 * since flying to one point is a shorter, tighter transition than resetting
 * to the whole-Pacific default view. Also run through
 * lib/tools/globeWatch/motion.ts's resolveFlyDurationMs for reduced-motion.
 */
export const EARTHQUAKE_FLY_DURATION_MS = 1400;
export const EARTHQUAKE_FLY_ZOOM = 5;

/**
 * Issue #594 (parent #583): "點擊清單項目時地球飛到該事件的位置" for the 全球災害
 * (disasters) item — same shape/rationale as the earthquake constants above,
 * kept separate rather than reused since a later item could want its own
 * timing without this one drifting.
 */
export const DISASTER_FLY_DURATION_MS = 1400;
export const DISASTER_FLY_ZOOM = 5;
