#!/usr/bin/env node
/**
 * One-off diagnostic: probes upstream URLs directly from the production
 * host's own network (over the same SSH loopback transport the sync jobs
 * use), to tell apart "the host's IP is blocked" from "the site itself is
 * flaky" — companion to .github/workflows/egress-probe.yml, which only
 * covers the GitHub Actions runner side. Not wired into any schedule; run
 * via workflow_dispatch only.
 *
 * Env: SSH_HOST SSH_PORT SSH_USER SSH_KEY_FILE
 */
import { createSshLoopback, shellQuote } from "./lib/ssh-loopback.mjs";

const SSH_HOST = process.env.SSH_HOST || "";
const SSH_PORT = process.env.SSH_PORT || "22";
const SSH_USER = process.env.SSH_USER || "";
const SSH_KEY_FILE = process.env.SSH_KEY_FILE || "";

if (!SSH_HOST || !SSH_USER || !SSH_KEY_FILE) {
  console.error("Missing SSH_HOST, SSH_USER, or SSH_KEY_FILE");
  process.exit(1);
}

const ssh = createSshLoopback({
  keyFile: SSH_KEY_FILE,
  host: SSH_HOST,
  port: SSH_PORT,
  user: SSH_USER,
});

const targets = {
  "od.cdc.gov.tw dengue csv": "https://od.cdc.gov.tw/eic/MosIndex_All_last12m.csv",
  "od.cdc.gov.tw root": "https://od.cdc.gov.tw/",
  "data.gov.tw (control)": "https://data.gov.tw/dataset/24161",
};

const main = () => {
  try {
    for (const [label, url] of Object.entries(targets)) {
      const remote = [
        "curl -sS -o /dev/null --max-time 20",
        "-w",
        shellQuote("http_code=%{http_code} time=%{time_total}"),
        shellQuote(url),
      ].join(" ");
      const result = ssh.call(remote, { retries: 0 });
      const out = (result.stdout || "").trim();
      const err = (result.stderr || "").trim().split("\n")[0] || "";
      console.log(`${label.padEnd(28)} exit=${result.status} ${out} ${err}`);
    }
  } finally {
    ssh.close();
  }
};

main();
