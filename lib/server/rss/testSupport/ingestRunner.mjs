// Runs the RSS ingestion in a child process against a synthetic world (stubWorld.mjs) hosted by THIS process,
// under a chosen V8 heap cap. Shared by the memory test (ingestMemory.test.mjs) and the measurement CLI
// (scripts/measure-rss-ingestion-memory.mjs（已移除，見 git 歷史）). The world must live in the parent: spawnSync would block its
// event loop, so the child is spawned asynchronously.
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { startStubWorld } from "./stubWorld.mjs";

const CHILD = fileURLToPath(new URL("./ingestChild.mjs", import.meta.url));

/**
 * A throwaway self-signed certificate for the stub world's HTTPS mode (measurement only; needs the `openssl` binary,
 * so nothing that runs in `npm test` uses it). Generated into a temp dir and deleted with it — no key is ever stored.
 */
const makeTestCertificate = (dir) => {
  const key = join(dir, "key.pem");
  const cert = join(dir, "cert.pem");
  const run = spawnSync(
    "openssl",
    ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", key, "-out", cert, "-days", "2", "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1"],
    { encoding: "utf-8", env: { ...process.env, MSYS_NO_PATHCONV: "1" } },
  );
  if (run.status !== 0) throw new Error(`openssl is required for tls mode: ${run.stderr || run.error}`);
  return { key: readFileSync(key, "utf-8"), cert: readFileSync(cert, "utf-8") };
};

/**
 * @param {object} options
 * @param {object} [options.world]    stubWorld overrides (feedItems, articleKB, ...)
 * @param {object} [options.child]    ingestChild config: runs, feedLimit, special, trigger, keepStageLines, keepSeries
 * @param {boolean} [options.tls]     serve the world over HTTPS (self-signed, needs `openssl`) so TLS handshake memory is measured
 * @param {number} [options.heapMb]   --max-old-space-size for the child (default 768, like production)
 * @param {string[]} [options.nodeArgs] extra node flags, e.g. ["--trace-gc"]
 * @param {number} [options.timeoutMs]
 * @returns {Promise<{ result: object|null, status: number|null, signal: string|null, stderr: string, stdout: string, world: object }>}
 */
export const runIngestChild = async (options = {}) => {
  const dir = mkdtempSync(join(tmpdir(), "rss-ingest-child-"));
  const tlsPair = options.tls ? makeTestCertificate(dir) : null;
  const world = await startStubWorld({ ...options.world, ...(tlsPair ? { tls: tlsPair } : {}) });
  try {
    const args = [
      "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
      "--expose-gc",
      `--max-old-space-size=${options.heapMb ?? 768}`,
      ...(options.nodeArgs ?? []),
      CHILD,
    ];
    const child = spawn(process.execPath, args, {
      cwd: dir, // downloaded images land in <dir>/public/images/news/articles, not in the repo
      env: { ...process.env, RSS_INGEST_CHILD_CONFIG: JSON.stringify({ ...options.child, port: world.port, useTls: Boolean(tlsPair) }) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    const timer = setTimeout(() => child.kill("SIGKILL"), options.timeoutMs ?? 300_000);
    const [status, signal] = await new Promise((resolve) => child.on("close", (code, sig) => resolve([code, sig])));
    clearTimeout(timer);
    // `--trace-gc` shares stdout and can leave a partial line in front of ours, so look for the marker, not a line start.
    const markerAt = stdout.lastIndexOf("RESULT:");
    const line = markerAt === -1 ? null : stdout.slice(markerAt).split("\n")[0];
    return {
      result: line ? JSON.parse(line.slice("RESULT:".length)) : null,
      status,
      signal,
      stderr: stderr.slice(-4000),
      // --trace-gc writes to the child's stdout; callers that asked for it get all of it (RESULT line included).
      stdout: options.keepStdout ? stdout : line ? "" : stdout.slice(-4000),
      world: { ...world.stats },
    };
  } finally {
    await world.close();
    rmSync(dir, { recursive: true, force: true });
  }
};
