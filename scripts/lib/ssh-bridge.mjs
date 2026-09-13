#!/usr/bin/env node
/**
 * scripts/lib/ssh-bridge.mjs
 *
 * Lightweight Application-Layer SSH Loopback Bridge for GitHub Actions runners.
 *
 * Problem: HawkHost disables TCP forwarding (AllowTcpForwarding no), causing
 * `ssh -L 18080:127.0.0.1:3000` to fail with "administratively prohibited".
 * Meanwhile, hitting the public domain https://health.j172.tw from GHA runners
 * is blocked by Cloudflare's bot-detection JS challenge (HTTP 403).
 *
 * Solution: Run this transparent bridge server on 127.0.0.1:18080 on the runner.
 * When local sync scripts (run-six-monthly-sync.sh, import-tfda-*, submitFacilities)
 * send HTTP requests to http://127.0.0.1:18080/..., this bridge forwards the request
 * as a remote curl call to http://127.0.0.1:3000/... over a multiplexed SSH
 * connection (using scripts/lib/ssh-loopback.mjs).
 *
 * Features:
 * - GET /healthz returns 200 OK immediately for runner readiness probing.
 * - Streams request bodies via stdin to avoid command line length limits (ARG_MAX).
 * - Extracts HTTP status code via curl `-w "\n%{http_code}"`.
 * - Transparent error mapping (502 on curl failure, 503 on LVE saturation).
 * - Clean teardown on SIGINT/SIGTERM.
 */
import http from "node:http";
import { fileURLToPath } from "node:url";
import { createSshLoopback, shellQuote } from "./ssh-loopback.mjs";

export function createBridgeServer({ ssh }) {
  const server = http.createServer(async (req, res) => {
    // Immediate local liveness check
    if (req.url === "/healthz") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, bridge: true }));
      return;
    }

    try {
      const chunks = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      const bodyBuffer = Buffer.concat(chunks);
      const hasBody = req.method !== "GET" && req.method !== "HEAD" && bodyBuffer.length > 0;

      const forwardHeaders = [];
      for (const [key, value] of Object.entries(req.headers)) {
        const lowerKey = key.toLowerCase();
        if (lowerKey === "host" || lowerKey === "content-length" || lowerKey === "connection") {
          continue;
        }
        if (Array.isArray(value)) {
          for (const v of value) {
            forwardHeaders.push(`-H ${shellQuote(`${key}: ${v}`)}`);
          }
        } else if (value !== undefined) {
          forwardHeaders.push(`-H ${shellQuote(`${key}: ${value}`)}`);
        }
      }

      const remote = [
        "curl -sS --max-time 180",
        `-X ${req.method}`,
        `http://127.0.0.1:3000${req.url}`,
        ...forwardHeaders,
        ...(hasBody ? ["--data-binary @-"] : []),
        `-w "\\n%{http_code}"`,
      ].join(" ");

      const result = ssh.call(remote, {
        input: hasBody ? bodyBuffer.toString("utf-8") : undefined,
        retries: 2,
        retryDelayMs: 2000,
      });

      if (result.error) {
        throw result.error;
      }

      if (result.status === 255) {
        res.writeHead(503, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "host_lve_saturated_exit_255" }));
        return;
      }

      const out = (result.stdout || "").trimEnd();
      const lastLineBreak = out.lastIndexOf("\n");
      let statusCode = 200;
      let respBody = out;

      if (lastLineBreak !== -1) {
        const potentialCode = out.slice(lastLineBreak + 1).trim();
        if (/^\d{3}$/.test(potentialCode)) {
          statusCode = Number(potentialCode);
          respBody = out.slice(0, lastLineBreak);
        }
      } else if (/^\d{3}$/.test(out.trim())) {
        statusCode = Number(out.trim());
        respBody = "";
      }

      if (result.status !== 0 && statusCode === 200) {
        statusCode = 502;
        respBody = JSON.stringify({
          ok: false,
          error: "remote_curl_failed",
          exitCode: result.status,
          stderr: (result.stderr || "").trim().slice(0, 500),
        });
      }

      if (respBody.startsWith("{") || respBody.startsWith("[")) {
        res.setHeader("content-type", "application/json");
      }
      res.writeHead(statusCode);
      res.end(respBody);
    } catch (err) {
      console.error("[ssh-bridge] Error handling request:", err);
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: err.message }));
    }
  });

  return server;
}

async function main() {
  const PORT = Number(process.env.PORT || 18080);
  const HOST = process.env.HOST || "127.0.0.1";
  const SSH_HOST = process.env.SSH_HOST || "";
  const SSH_PORT = process.env.SSH_PORT || "22";
  const SSH_USER = process.env.SSH_USER || "";
  const SSH_KEY_FILE = process.env.SSH_KEY_FILE || process.env.KEY_FILE || "";

  if (!SSH_HOST || !SSH_USER || !SSH_KEY_FILE) {
    console.error("Missing SSH configuration: SSH_HOST, SSH_USER, and SSH_KEY_FILE are required.");
    process.exit(1);
  }

  console.log(`[ssh-bridge] Initializing SSH loopback to ${SSH_USER}@${SSH_HOST}:${SSH_PORT}...`);
  const ssh = createSshLoopback({
    keyFile: SSH_KEY_FILE,
    host: SSH_HOST,
    port: SSH_PORT,
    user: SSH_USER,
  });

  const server = createBridgeServer({ ssh });

  const cleanup = () => {
    console.log("[ssh-bridge] Shutting down bridge server...");
    server.close();
    ssh.close();
    process.exit(0);
  };

  process.on("SIGTERM", cleanup);
  process.on("SIGINT", cleanup);

  server.listen(PORT, HOST, () => {
    console.log(`[ssh-bridge] Listening on http://${HOST}:${PORT}, forwarding requests to http://127.0.0.1:3000 via SSH multiplexing.`);
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error("[ssh-bridge] Fatal startup error:", err);
    process.exit(1);
  });
}
