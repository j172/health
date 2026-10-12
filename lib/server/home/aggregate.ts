/**
 * Generic per-section failure isolation for the homepage's single
 * aggregation API (issue #472, parent #438 §G: "原本首頁側欄 10 個小工具各自
 * 打一次 API 的做法，改成後端聚合成 1 支 API，單一區塊資料失敗不影響其他區塊
 * 正常顯示").
 *
 * Same philosophy as `lib/server/nearby/aggregate.ts::aggregateNearbyTypes`
 * (issue #466) — this module knows nothing about weather/AQI/UV/earthquakes/
 * alerts specifically; each caller supplies one `() => Promise<T>` task per
 * named section, and this just runs them all through `Promise.allSettled`
 * and turns each outcome into a uniform ok/error result, keyed the same way
 * the tasks were. One section's query failing never throws or drops any
 * other section's result.
 *
 * This is a *separate* module from `aggregateNearbyTypes` (rather than a
 * shared generalization of it) because the homepage's 5 sections are
 * heterogeneous in shape (a single weather reading object, a list of
 * earthquakes, a list of alerts, ...), whereas `aggregateNearbyTypes` is
 * specifically a uniform list-of-`NearbyItem` per type with a `label`/
 * `emoji` pair baked in. A mapped-object shape (section name -> its own
 * result type) fits this ticket's data better than a flat array would.
 */

export type HomeStatusSectionResult<T> =
  | { status: "ok"; data: T; error?: undefined }
  | { status: "error"; data: null; error: string };

export type HomeStatusTasks<R> = { [K in keyof R]: () => Promise<R[K]> };
export type HomeStatusResults<R> = { [K in keyof R]: HomeStatusSectionResult<R[K]> };

const errorMessage = (reason: unknown): string => (reason instanceof Error ? reason.message : String(reason));

/**
 * Runs every named task concurrently; one task rejecting only turns its own
 * entry into `{ status: "error" }` — every other entry's result is
 * unaffected, and this function itself never rejects.
 */
export async function aggregateHomeStatusSections<R extends Record<string, unknown>>(
  tasks: HomeStatusTasks<R>,
): Promise<HomeStatusResults<R>> {
  const keys = Object.keys(tasks) as (keyof R)[];
  const settled = await Promise.allSettled(keys.map((key) => tasks[key]()));

  const results = {} as HomeStatusResults<R>;
  keys.forEach((key, index) => {
    const outcome = settled[index];
    results[key] =
      outcome.status === "fulfilled"
        ? { status: "ok", data: outcome.value }
        : { status: "error", data: null, error: errorMessage(outcome.reason) };
  });
  return results;
}
