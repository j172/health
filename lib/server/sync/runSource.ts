/**
 * Runs a single sync source's fetch+upsert step, wrapping it in a try/catch
 * and normalizing the result into the `{ sourceKey, ...counts, error }` shape
 * every sync module reports. `zero` supplies the counts to report when `run`
 * throws (its keys/shape must match what `run` resolves to on success), and
 * `fallbackErrorMessage` is used only when the caught value isn't an `Error`.
 */
export const runSource = async <T extends Record<string, unknown>, K extends string = string>(
  sourceKey: K,
  zero: T,
  run: () => Promise<T>,
  fallbackErrorMessage = "Unknown sync error",
): Promise<{ sourceKey: K; error: string | null } & T> => {
  try {
    const result = await run();
    return { sourceKey, ...result, error: null } as { sourceKey: K; error: string | null } & T;
  } catch (error) {
    return {
      sourceKey,
      ...zero,
      error: error instanceof Error ? error.message : fallbackErrorMessage,
    } as { sourceKey: K; error: string | null } & T;
  }
};
