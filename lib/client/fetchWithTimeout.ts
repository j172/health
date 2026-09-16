/**
 * lib/client/fetchWithTimeout.ts
 *
 * Safe client-side fetch wrapper with configurable timeout (default 5000ms).
 * Prevents UI from hanging indefinitely on slow or stalled network requests.
 */

export interface FetchWithTimeoutOptions extends RequestInit {
  timeoutMs?: number;
}

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  options: FetchWithTimeoutOptions = {},
): Promise<Response> {
  const { timeoutMs = 5000, signal, ...rest } = options;

  const controller = new AbortController();
  let timer: NodeJS.Timeout | null = null;

  // Combine with external signal if provided
  if (signal) {
    signal.addEventListener("abort", () => {
      controller.abort(signal.reason);
      if (timer) clearTimeout(timer);
    });
  }

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort(new Error(`Request timed out after ${timeoutMs}ms`));
      reject(new Error(`Request timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    const fetchPromise = fetch(input, {
      ...rest,
      signal: controller.signal,
    });
    const response = await Promise.race([fetchPromise, timeoutPromise]);
    if (timer) clearTimeout(timer);
    return response;
  } catch (err) {
    if (timer) clearTimeout(timer);
    throw err;
  }
}
