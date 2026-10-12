// Unit tests for lib/client/bodyProfileStore.ts — run with `npm test`.
//
// Same setup as lib/client/toastStore.test.mjs: node:test + node:assert
// only, no framework. The resolve hook lets this .mjs test import the
// TypeScript source directly. Storage is injected via a fake in-memory
// Map-backed implementation (and a throwing one, to test graceful
// degradation) instead of touching real localStorage.
import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

registerHooks({
  resolve(specifier, context, nextResolve) {
    let target = specifier;
    const parentURL = context.parentURL;
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

const { getProfile, saveProfile, clearProfile, isRemembering, setRemembering, sanitizeProfile } = await import("./bodyProfileStore.ts");

/** A fake in-memory localStorage-like object for deterministic tests. */
function createFakeStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    _map: map,
  };
}

/** A storage stub that always throws, simulating private browsing / a
 * blocked localStorage, to verify every path degrades gracefully. */
function createThrowingStorage() {
  return {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
    removeItem: () => {
      throw new Error("blocked");
    },
  };
}

test("default OFF: getProfile() returns {} when the user never opted in, even if a profile object is already sitting in storage", () => {
  const storage = createFakeStorage();
  // Simulate stale/pre-existing data without the opt-in flag ever being set.
  storage.setItem("j172-health-body-profile", JSON.stringify({ height: 170, weight: 65 }));

  assert.equal(isRemembering(storage), false);
  assert.deepEqual(getProfile(storage), {});
});

test("opt-in write/read round-trip: saveProfile() then getProfile() returns exactly what was saved", () => {
  const storage = createFakeStorage();
  assert.deepEqual(getProfile(storage), {}, "nothing remembered before opting in");

  saveProfile({ height: 170, weight: 65 }, storage);
  assert.equal(isRemembering(storage), true, "saveProfile opts in as a safety net");
  assert.deepEqual(getProfile(storage), { height: 170, weight: 65 });

  // A second calculator saving a different subset merges rather than overwrites.
  saveProfile({ age: 30, sex: "female" }, storage);
  assert.deepEqual(getProfile(storage), { height: 170, weight: 65, age: 30, sex: "female" });

  // And updating an existing field overwrites just that field.
  saveProfile({ weight: 68 }, storage);
  assert.deepEqual(getProfile(storage), { height: 170, weight: 68, age: 30, sex: "female" });
});

test("setRemembering(true) opts in without requiring any fields yet", () => {
  const storage = createFakeStorage();
  setRemembering(true, storage);
  assert.equal(isRemembering(storage), true);
  assert.deepEqual(getProfile(storage), {});
});

test("clear-all wipes everything: clearProfile() removes the profile and turns remembering off", () => {
  const storage = createFakeStorage();
  saveProfile({ height: 170, weight: 65, age: 30, sex: "male" }, storage);
  assert.equal(isRemembering(storage), true);

  clearProfile(storage);

  assert.equal(isRemembering(storage), false);
  assert.deepEqual(getProfile(storage), {});
  assert.equal(storage.getItem("j172-health-body-profile"), null, "the raw key itself is gone, not just unreadable");
});

test("setRemembering(false) also wipes the stored profile (toggling the checkbox off clears, same as the explicit clear button)", () => {
  const storage = createFakeStorage();
  saveProfile({ height: 170, weight: 65 }, storage);

  setRemembering(false, storage);

  assert.equal(isRemembering(storage), false);
  assert.deepEqual(getProfile(storage), {});
});

test("graceful degradation: a throwing storage never throws out of getProfile/saveProfile/clearProfile/isRemembering", () => {
  const storage = createThrowingStorage();

  assert.doesNotThrow(() => isRemembering(storage));
  assert.equal(isRemembering(storage), false);

  assert.doesNotThrow(() => getProfile(storage));
  assert.deepEqual(getProfile(storage), {});

  assert.doesNotThrow(() => saveProfile({ height: 170 }, storage));
  assert.doesNotThrow(() => clearProfile(storage));
  assert.doesNotThrow(() => setRemembering(true, storage));
});

test("getProfile() tolerates corrupt JSON in storage and returns {} instead of throwing", () => {
  const storage = createFakeStorage();
  storage.setItem("j172-health-body-profile-remember", "1");
  storage.setItem("j172-health-body-profile", "{not valid json");

  assert.doesNotThrow(() => getProfile(storage));
  assert.deepEqual(getProfile(storage), {});
});

test("sanitizeProfile keeps ONLY height/weight/age/sex and silently drops anything else, including blood-pressure/heart-rate-measurement-shaped fields", () => {
  const dirty = {
    height: 170,
    weight: 65,
    age: 30,
    sex: "male",
    // Measurement/output values that must never be part of this shared shape:
    systolic: 120,
    diastolic: 80,
    pulse: 72,
    restHr: 65,
    maxHr: 190,
    bloodPressureCategory: "正常血壓",
  };

  const clean = sanitizeProfile(dirty);

  assert.deepEqual(Object.keys(clean).sort(), ["age", "height", "sex", "weight"]);
  assert.deepEqual(clean, { height: 170, weight: 65, age: 30, sex: "male" });
});

test("sanitizeProfile rejects invalid types/values for each field (non-numbers, non-finite numbers, invalid sex enum)", () => {
  assert.deepEqual(
    sanitizeProfile({ height: "170", weight: NaN, age: Infinity, sex: "cat" }),
    {},
    "wrong types / NaN / Infinity / an unrecognized sex value are all dropped",
  );
  assert.deepEqual(sanitizeProfile(null), {});
  assert.deepEqual(sanitizeProfile(undefined), {});
  assert.deepEqual(sanitizeProfile("not an object"), {});
  assert.deepEqual(sanitizeProfile(42), {});
});

test("saveProfile() runs its merged result through sanitizeProfile too, so a caller can't sneak a measurement field into storage even by accident", () => {
  const storage = createFakeStorage();
  saveProfile({ height: 170, systolic: 120, restHr: 65 }, storage);

  assert.deepEqual(getProfile(storage), { height: 170 });
  const rawStored = JSON.parse(storage.getItem("j172-health-body-profile"));
  assert.deepEqual(Object.keys(rawStored), ["height"]);
});

test("with no storage argument and no `window` (this test runs under plain Node, not jsdom), every function is a safe no-op", () => {
  assert.equal(typeof window, "undefined", "sanity check: this test file has no DOM/window");
  assert.doesNotThrow(() => isRemembering());
  assert.equal(isRemembering(), false);
  assert.doesNotThrow(() => getProfile());
  assert.deepEqual(getProfile(), {});
  assert.doesNotThrow(() => saveProfile({ height: 170 }));
  assert.doesNotThrow(() => clearProfile());
  assert.doesNotThrow(() => setRemembering(true));
});
