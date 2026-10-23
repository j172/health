import type { PoolConnection } from "mysql2/promise";

export declare const isConnectionUnavailableError: (error: unknown) => boolean;

export declare const isBuildPhase: () => boolean;

export declare const executeWithConnectionFallback: <T>(
  withConn: <R>(runner: (conn: PoolConnection) => Promise<R>) => Promise<R>,
  fallbackValue: T,
  runner: (conn: PoolConnection) => Promise<T>,
) => Promise<T>;

