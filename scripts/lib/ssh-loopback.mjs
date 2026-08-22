/**
 * Shared SSH-loopback transport for GHA scripts that call the app's admin
 * API as remote curl against 127.0.0.1:3000 (HawkHost disables TCP
 * forwarding, so a tunnel isn't an option — see gha-og-external-backfill.mjs
 * and gha-facilities-geocode-batch.mjs headers).
 *
 * Why this exists: both scripts used to open a brand-new SSH connection
 * (fresh TCP handshake + auth + forked sshd/bash/curl on the remote host)
 * for *every* API call — up to ~30 for the geocode batch, ~250 for the OG
 * backfill in a single run. On the shared host that's a fork/connection
 * storm layered on top of its known LVE resource limits (see memory:
 * ops_health_502_watchdog.md), and is the direct cause of the
 * "fork: retry: Resource temporarily unavailable" (exit 7) and
 * "Connection to *** closed by remote host" (exit 255) failures that were
 * flooding the schedule runs on 2026-08-21.
 *
 * Fix: open one SSH ControlMaster connection per job run and multiplex every
 * call over it (one TCP handshake + one auth, N cheap reused sessions
 * instead of N full connections), plus a short retry/backoff for whatever
 * transient contention still gets through. Falls back to a plain per-call
 * connection if the control master can't be established (e.g. multiplexing
 * unsupported in some environment) so behavior degrades gracefully rather
 * than hard-failing.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export const shellQuote = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

/**
 * @param {{keyFile: string, host: string, port?: string|number, user: string}} opts
 * @returns {{call: (remoteCmd: string, opts?: {retries?: number, retryDelayMs?: number}) => import("node:child_process").SpawnSyncReturns<string>, close: () => void}}
 */
export function createSshLoopback({ keyFile, host, port = "22", user }) {
  const sockDir = mkdtempSync(path.join(tmpdir(), "ssh-mux-"));
  const controlPath = path.join(sockDir, "cm.sock");

  const baseArgs = (extra) => [
    "-i",
    keyFile,
    "-p",
    String(port),
    "-o",
    "BatchMode=yes",
    "-o",
    "StrictHostKeyChecking=accept-new",
    "-o",
    "ConnectTimeout=15",
    "-o",
    `ControlPath=${controlPath}`,
    ...extra,
  ];

  const openResult = spawnSync(
    "ssh",
    [
      ...baseArgs(["-M", "-N", "-f", "-o", "ControlPersist=180"]),
      `${user}@${host}`,
    ],
    { encoding: "utf8" },
  );
  const multiplexed = openResult.status === 0;
  if (!multiplexed) {
    console.error(
      `ssh control-master setup failed, falling back to per-call connections: ${(openResult.stderr || "").trim().slice(0, 200)}`,
    );
  }

  const runOnce = (remoteCmd, input) => {
    const args = multiplexed
      ? [
          ...baseArgs(["-o", "ControlMaster=auto"]),
          `${user}@${host}`,
          remoteCmd,
        ]
      : [...baseArgs([]), `${user}@${host}`, remoteCmd];
    return spawnSync("ssh", args, {
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
      // Piped to the remote command's stdin. Anything large — an image payload,
      // say — has to travel this way: putting it in the command string instead
      // blows past ARG_MAX a couple of megabytes in.
      ...(input === undefined ? {} : { input }),
    });
  };

  const call = (
    remoteCmd,
    { retries = 2, retryDelayMs = 3000, input } = {},
  ) => {
    let result;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      result = runOnce(remoteCmd, input);
      if (result.status === 0) return result;
      if (attempt < retries) {
        const reason =
          (result.stderr || result.error?.message || "")
            .trim()
            .split("\n")[0] || `exit=${result.status}`;
        console.error(
          `ssh call failed (attempt ${attempt + 1}/${retries + 1}, ${reason}) — retrying in ${retryDelayMs}ms`,
        );
        spawnSync("sleep", [String(retryDelayMs / 1000)]);
      }
    }
    return result;
  };

  const close = () => {
    if (multiplexed) {
      spawnSync("ssh", [...baseArgs(["-O", "exit"]), `${user}@${host}`], {
        encoding: "utf8",
      });
    }
    try {
      rmSync(sockDir, { recursive: true, force: true });
    } catch {
      /* best-effort cleanup */
    }
  };

  return { call, close };
}
