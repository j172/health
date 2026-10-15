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
  "opendata.mohw.gov.tw (160903)":
    "https://www.opendata.mohw.gov.tw/dataset/opendata/sfaa/160903/%E5%85%A8%E5%9C%8B%E7%A4%BE%E7%A6%8F%E4%B8%AD%E5%BF%83%E9%80%9A%E8%A8%8A%E9%8C%84.csv",
  // issue #612: nhplatform.mohw.gov.tw (全國開業護理機構清冊, data.gov.tw
  // 115950) — reachable from this development environment (2026-10-14,
  // HTTP 200, no redirect) but never confirmed from the production host.
  // Run this before relying on the "nhplatform_115950" facilities-sync
  // source's scheduled runs.
  "nhplatform.mohw.gov.tw (115950 CSV)":
    "https://nhplatform.mohw.gov.tw/dl-3820-74883655f255416abc752bef29cbd7aa.html",
  // issue #596 (parent #583): WHO Disease Outbreak News sync. Reachable
  // directly from the sandbox that built lib/server/who/ on 2026-10-15
  // (HTTP 200, real live data) — never confirmed from the production host.
  // Run this before relying on the who-don-cron job's scheduled runs; if
  // it comes back blocked here, lib/server/who/sources/who.ts needs to
  // switch to the runner-fetch + SSH-loopback-POST pattern instead (see
  // this script's own module doc comment).
  "www.who.int api/news DON list":
    "https://www.who.int/api/news/diseaseoutbreaknews?sf_provider=dynamicProvider372&sf_culture=en&$top=1",
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
