/**
 * Pure connection fallback logic for database operations.
 * Evaluates whether an error indicates unavailable database connection,
 * whether the process is currently in a build phase, and safely falls back
 * only during Next.js build prerendering.
 */

export const isConnectionUnavailableError = (error) => {
  if (!error) return false;
  const message = error instanceof Error ? error.message : String(error);
  return /ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EHOSTUNREACH|ECONNRESET|Connection lost|connect ECONNREFUSED|EACCES/i.test(
    message,
  );
};

export const isBuildPhase = () =>
  process.env.NEXT_PHASE === "phase-production-build" ||
  process.env.npm_lifecycle_event === "build";

export const executeWithConnectionFallback = async (
  withConn,
  fallbackValue,
  runner,
) => {
  try {
    return await withConn(runner);
  } catch (error) {
    if (isConnectionUnavailableError(error)) {
      if (isBuildPhase()) {
        console.warn(
          `[mysql] Falling back to empty data during build phase because the database is unavailable: ${error instanceof Error ? error.message : String(error)}`,
        );
        return fallbackValue;
      }
      console.error(
        `[mysql] Database connection unavailable during runtime; rethrowing to protect ISR cache: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    throw error;
  }
};

