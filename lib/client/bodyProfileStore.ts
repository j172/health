/**
 * lib/client/bodyProfileStore.ts
 *
 * Pure storage logic behind lib/client/useBodyProfile.ts — the shared,
 * opt-in, device-local "body profile" (height/weight/age/sex) that lets
 * the 12 /tools calculators (bmi, calories, nutrition, water, body-fat,
 * waist-hip, heart-rate, blood-pressure, sleep, stress, lbm, vo2max)
 * pre-fill each other's basic inputs instead of re-asking every time.
 * See GitHub issue #474.
 *
 * Hard privacy/safety constraints baked into this module, not just the UI:
 * - Default OFF: getProfile() returns {} unless the user has explicitly
 *   opted in via setRemembering(true)/saveProfile(), even if a profile
 *   object happens to still be sitting in storage from a prior session.
 * - Scope is capped at exactly height/weight/age/sex. `sanitizeProfile`
 *   strips any other key (e.g. a caller accidentally passing a
 *   blood-pressure reading or a measured heart rate) before it can ever
 *   reach storage or a caller's state — see issue #474's "血壓、心率等醫療
 *   量測數值在任何情況下都不會被記住".
 * - Every storage access is try/catch guarded. Storage is also injectable
 *   so tests don't need a real `localStorage` / can simulate one that
 *   throws — same "inject what touches the real world" pattern as
 *   lib/client/toastStore.ts's injected scheduler and
 *   lib/client/inAppBrowser.ts's injected UA string.
 */

export type Sex = "male" | "female";

/** The ONLY fields this shared profile is allowed to hold. Never add a
 * blood-pressure/heart-rate-measurement-shaped field here. */
export interface BodyProfile {
  height?: number; // cm
  weight?: number; // kg
  age?: number; // years
  sex?: Sex;
}

const PROFILE_KEY = "j172-health-body-profile";
const REMEMBER_KEY = "j172-health-body-profile-remember";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function resolveStorage(storage?: StorageLike): StorageLike | null {
  if (storage) return storage;
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

/** Strips any key other than height/weight/age/sex, and validates each one. */
export function sanitizeProfile(value: unknown): BodyProfile {
  if (!value || typeof value !== "object") return {};
  const v = value as Record<string, unknown>;
  const profile: BodyProfile = {};
  if (typeof v.height === "number" && Number.isFinite(v.height)) profile.height = v.height;
  if (typeof v.weight === "number" && Number.isFinite(v.weight)) profile.weight = v.weight;
  if (typeof v.age === "number" && Number.isFinite(v.age)) profile.age = v.age;
  if (v.sex === "male" || v.sex === "female") profile.sex = v.sex;
  return profile;
}

/** True only after the user has explicitly opted in. */
export function isRemembering(storage?: StorageLike): boolean {
  const s = resolveStorage(storage);
  if (!s) return false;
  try {
    return s.getItem(REMEMBER_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Returns the remembered profile, or `{}` when the user never opted in,
 * nothing has been saved yet, storage is unavailable, or the stored value
 * is corrupt/unparsable. Never throws.
 */
export function getProfile(storage?: StorageLike): BodyProfile {
  const s = resolveStorage(storage);
  if (!s || !isRemembering(storage)) return {};
  try {
    const raw = s.getItem(PROFILE_KEY);
    if (!raw) return {};
    return sanitizeProfile(JSON.parse(raw));
  } catch {
    return {};
  }
}

/**
 * Opts in (idempotent) and merges `partial` into the remembered profile.
 * Silently no-ops if storage throws (full, blocked, private browsing) —
 * callers should gate this behind their own "is the user opted in" check
 * (see useBodyProfile's `save`), but this also sets the opt-in flag itself
 * as a safety net so saved data is never orphaned without it.
 */
export function saveProfile(partial: BodyProfile, storage?: StorageLike): void {
  const s = resolveStorage(storage);
  if (!s) return;
  try {
    s.setItem(REMEMBER_KEY, "1");
    let existing: BodyProfile = {};
    try {
      const raw = s.getItem(PROFILE_KEY);
      existing = raw ? sanitizeProfile(JSON.parse(raw)) : {};
    } catch {
      existing = {};
    }
    const merged = sanitizeProfile({ ...existing, ...sanitizeProfile(partial) });
    s.setItem(PROFILE_KEY, JSON.stringify(merged));
  } catch {
    // storage unavailable/full/blocked — remember-feature is simply inert
  }
}

/** Wipes the remembered profile and turns the opt-in flag off. Never throws. */
export function clearProfile(storage?: StorageLike): void {
  const s = resolveStorage(storage);
  if (!s) return;
  try {
    s.removeItem(PROFILE_KEY);
    s.removeItem(REMEMBER_KEY);
  } catch {
    // ignore — nothing to clear, or storage unavailable
  }
}

/**
 * Turns remembering on/off. Turning it OFF always wipes the stored profile
 * too (same effect as clearProfile()) so no stale data can resurface if the
 * user opts back in later without re-entering anything.
 */
export function setRemembering(value: boolean, storage?: StorageLike): void {
  if (!value) {
    clearProfile(storage);
    return;
  }
  const s = resolveStorage(storage);
  if (!s) return;
  try {
    s.setItem(REMEMBER_KEY, "1");
  } catch {
    // storage unavailable — opt-in silently fails, feature stays inert
  }
}
