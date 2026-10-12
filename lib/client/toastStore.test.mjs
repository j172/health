// Unit tests for lib/client/toastStore.ts — run with `npm test`.
//
// Same setup as lib/client/inAppBrowser.test.mjs: node:test + node:assert
// only, no framework. The resolve hook lets this .mjs test import the
// TypeScript source directly instead of duplicating its logic. The
// auto-dismiss `schedule` function is injected with a fake scheduler so
// dismissal timing is tested deterministically, without real timers.
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

const { createToastStore, TOAST_DURATIONS } = await import("./toastStore.ts");

/** A fake scheduler that captures callbacks instead of actually waiting, so
 * tests can fire them on demand and assert dismissal happened exactly when
 * expected. */
function createFakeScheduler() {
  const scheduled = [];
  const schedule = (fn, ms) => scheduled.push({ fn, ms });
  const flushAll = () => {
    const toRun = scheduled.splice(0);
    toRun.forEach((s) => s.fn());
  };
  return { schedule, scheduled, flushAll };
}

test("react-hot-toast's prior default durations are preserved (success 2000ms, error 4000ms)", () => {
  assert.equal(TOAST_DURATIONS.success, 2000);
  assert.equal(TOAST_DURATIONS.error, 4000);
});

test("push() shows a toast immediately", () => {
  const { schedule } = createFakeScheduler();
  const store = createToastStore(schedule);
  store.push("success", "已成功複製");
  assert.equal(store.getToasts().length, 1);
  assert.equal(store.getToasts()[0].message, "已成功複製");
  assert.equal(store.getToasts()[0].type, "success");
});

test("push() schedules auto-dismiss using the type's duration, and it fires", () => {
  const { schedule, scheduled, flushAll } = createFakeScheduler();
  const store = createToastStore(schedule);
  store.push("success", "ok");
  store.push("error", "oops");

  assert.equal(scheduled.length, 2);
  assert.equal(scheduled[0].ms, TOAST_DURATIONS.success);
  assert.equal(scheduled[1].ms, TOAST_DURATIONS.error);
  assert.equal(store.getToasts().length, 2);

  flushAll();
  assert.equal(store.getToasts().length, 0, "both toasts auto-dismissed once their timers fired");
});

test("dismiss() lets the user manually close a toast before its auto-dismiss timer fires", () => {
  const { schedule, scheduled } = createFakeScheduler();
  const store = createToastStore(schedule);
  const id = store.push("error", "複製失敗，請手動選取文字");
  assert.equal(store.getToasts().length, 1);

  store.dismiss(id);
  assert.equal(store.getToasts().length, 0, "manual dismiss removes the toast immediately");

  // The stale auto-dismiss timer firing later must not throw or resurrect it.
  scheduled[0].fn();
  assert.equal(store.getToasts().length, 0);
});

test("dismissing an already-gone id is a no-op (no duplicate notifications)", () => {
  const { schedule } = createFakeScheduler();
  const store = createToastStore(schedule);
  let notifyCount = 0;
  store.subscribe(() => notifyCount++);

  const id = store.push("success", "x");
  const countAfterPush = notifyCount;
  store.dismiss(id);
  const countAfterFirstDismiss = notifyCount;
  store.dismiss(id);

  assert.equal(countAfterFirstDismiss, countAfterPush + 1);
  assert.equal(notifyCount, countAfterFirstDismiss, "second dismiss of the same id notified no one");
});

test("subscribe() receives the current toast list on every change, and unsubscribe stops further updates", () => {
  const { schedule } = createFakeScheduler();
  const store = createToastStore(schedule);
  const snapshots = [];
  const unsubscribe = store.subscribe((toasts) => snapshots.push(toasts.length));

  store.push("success", "a");
  unsubscribe();
  store.push("error", "b");

  assert.deepEqual(snapshots, [1], "only the push before unsubscribe was observed");
});

test("multiple toasts queue independently and each keeps its own identity", () => {
  const { schedule } = createFakeScheduler();
  const store = createToastStore(schedule);
  const id1 = store.push("success", "first");
  const id2 = store.push("success", "second");
  assert.notEqual(id1, id2);
  assert.deepEqual(
    store.getToasts().map((t) => t.message),
    ["first", "second"],
  );

  store.dismiss(id1);
  assert.deepEqual(
    store.getToasts().map((t) => t.message),
    ["second"],
  );
});
