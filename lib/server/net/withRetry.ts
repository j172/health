export interface WithRetryOptions {
  /** Total number of attempts (the first call plus retries). */
  maxAttempts: number;
  /**
   * Delay in ms before the next attempt, given the attempt number that just
   * failed (1-indexed). Linear backoff (`delayMs * attempt`) is the common
   * case, but any function of the attempt number works.
   */
  delayMs: number | ((attempt: number) => number);
  /**
   * Called with a caught error to decide whether another attempt should be
   * made. Defaults to always-retryable. Return false to stop immediately
   * (e.g. a "quota exhausted" error class that will fail identically on
   * every subsequent attempt).
   */
  isRetryable?: (error: unknown) => boolean;
  /** Message used to build the thrown Error if the last caught value wasn't already an Error instance. */
  nonErrorMessage?: string;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Runs `fn`, retrying with a (by default linear) backoff delay between
 * attempts up to `maxAttempts` total tries. Rethrows the last error seen —
 * wrapped in an `Error` if it wasn't already one — once attempts are
 * exhausted or `isRetryable` returns false.
 */
export const withRetry = async <T>(fn: () => Promise<T>, options: WithRetryOptions): Promise<T> => {
  const { maxAttempts, delayMs, isRetryable, nonErrorMessage = "withRetry: operation failed with a non-Error value" } = options;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (isRetryable && !isRetryable(error)) break;
      if (attempt < maxAttempts) {
        const wait = typeof delayMs === "function" ? delayMs(attempt) : delayMs * attempt;
        await sleep(wait);
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(nonErrorMessage);
};
