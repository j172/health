"use client";

/**
 * lib/client/useBodyProfile.ts
 *
 * React hook wrapping lib/client/bodyProfileStore.ts for the 12 /tools
 * calculators (bmi, calories, nutrition, water, body-fat, waist-hip,
 * heart-rate, blood-pressure, sleep, stress, lbm, vo2max) that pre-fill
 * each other's height/weight/age/sex inputs. See issue #474.
 *
 * SSR-safe: state starts empty/off and is only populated from storage in a
 * `useEffect` after mount, so server-rendered markup never differs from the
 * pre-hydration client render (no hydration mismatch warning), and nothing
 * is shown as "remembered" until the browser has actually told us so.
 *
 * `isStorageAvailable` is a real write-then-remove probe, not just a
 * `typeof window` check — it also catches a blocked/full/private-mode
 * localStorage. Callers should hide the remember UI entirely when it's
 * false rather than rendering a checkbox that can't do anything (see
 * components/Tools/BodyProfileControls.tsx), matching this repo's
 * established "degrade to inert, don't throw" convention (see
 * lib/client/inAppBrowser.ts / components/Facilities/useGeolocation.ts).
 */

import { useCallback, useEffect, useState } from "react";
import { clearProfile, getProfile, isRemembering, saveProfile, setRemembering, type BodyProfile } from "./bodyProfileStore";

export type { BodyProfile, Sex } from "./bodyProfileStore";

export interface UseBodyProfileResult {
  /** The remembered profile. Always `{}` until opted in (and until after mount). */
  profile: BodyProfile;
  /** Whether the user has opted in to remembering on this device. */
  remember: boolean;
  /** False when localStorage is unavailable/blocked — hide the remember UI in that case. */
  isStorageAvailable: boolean;
  /** Opt in or out. Opting out immediately wipes the remembered profile (same as clearAll()). */
  setRemember: (remember: boolean) => void;
  /** Merge-save fields into the remembered profile. No-ops unless `remember` is true. */
  save: (fields: BodyProfile) => void;
  /** Wipes the remembered profile and turns remembering off, everywhere, immediately. */
  clearAll: () => void;
}

function probeStorage(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const testKey = "__j172_health_storage_probe__";
    window.localStorage.setItem(testKey, "1");
    window.localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

export function useBodyProfile(): UseBodyProfileResult {
  const [profile, setProfile] = useState<BodyProfile>({});
  const [remember, setRememberState] = useState(false);
  const [isStorageAvailable, setIsStorageAvailable] = useState(false);

  useEffect(() => {
    // Deferred via queueMicrotask (see docs/archive/specs/set-state-in-effect-fix.md,
    // issue #121/#122, and lib/hooks/useSharedGeolocation.ts for the same
    // pattern): this reads storage synchronously and would otherwise call
    // setState directly from the effect body, which trips
    // react-hooks/set-state-in-effect. Only changes *when* the update is
    // scheduled relative to React's commit/paint cycle.
    queueMicrotask(() => {
      const available = probeStorage();
      setIsStorageAvailable(available);
      if (!available) return;
      setRememberState(isRemembering());
      setProfile(getProfile());
    });
  }, []);

  const setRemember = useCallback((next: boolean) => {
    setRemembering(next);
    setRememberState(next);
    setProfile(next ? getProfile() : {});
  }, []);

  const save = useCallback(
    (fields: BodyProfile) => {
      if (!remember) return;
      saveProfile(fields);
      setProfile((prev) => ({ ...prev, ...fields }));
    },
    [remember],
  );

  const clearAll = useCallback(() => {
    clearProfile();
    setRememberState(false);
    setProfile({});
  }, []);

  return { profile, remember, isStorageAvailable, setRemember, save, clearAll };
}
