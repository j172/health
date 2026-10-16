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
  // #571 (parent #562): facilities-sync for both these sources came back
  // with zero rows in production on 2026-10-15 (two separate runs, incl. a
  // standalone retry) despite the fetchers themselves producing the exact
  // documented row counts (65, 22) when run locally against the same live
  // URLs. data.taipei itself isn't broadly blocked (addiction_treatment_133353,
  // a sibling data.taipei resource, wrote 216 rows the same run) — this
  // checks whether it's this specific resource, or antidrug.moj.gov.tw as a
  // central .gov.tw domain, that's blocked from the host's IP specifically.
  "data.taipei 133345 (methadone_cross_district, control: sibling 133353 OK)":
    "https://data.taipei/api/dataset/2e4dcb8a-af96-4170-a5dc-32b5dc7e9247/resource/dc82ccb5-1138-4c91-b948-56f53ab3d243/download",
  "antidrug.moj.gov.tw (anti_drug_center_moj)": "https://antidrug.moj.gov.tw/lp-33-1-1-60.html",

  // ------------------------------------------------------------------
  // issue #669 (B-0, parent: docs/2.0/track-b-opendata-phase2-3-spec.md):
  // every Track B upstream host that spec §3 marks 未驗證, each probed with
  // the exact resource the ticket that depends on it will fetch. The
  // coordinating session runs this once after the PR merges and back-fills
  // spec §3 from the output. (The runner-side half of the same list lives in
  // egress-probe.yml; tests/egress-probe-track-b-669.test.mjs keeps the two
  // in sync.) Values may be `{ url, range }` for large files: only the status
  // line matters here, so those ask for the first KiB (a server that ignores
  // Range is still cut off by the 20s curl cap).
  // ------------------------------------------------------------------

  // B-9: 派出所 5958. The ZIP's file name carries a publish date, so the sync
  // resolves the current URL from the data.gov.tw API first — probe both.
  "data.gov.tw api 5958 (URL resolver)": "https://data.gov.tw/api/v2/rest/dataset/5958",
  "www.tgos.tw 5958 ZIP (B-9)":
    "https://www.tgos.tw/tgos/VirtualDir/Product/9927eb8a-efed-40c0-8bc4-83121ad6834a/1150930.zip",

  // B-16: 臺北 路線 136515 (558 KB CSV) — the one B-16 source never probed; the first
  // production sync hung for 12+ minutes with zero Taipei rows written.
  "data.taipei 136515 routes (B-16)":
    "https://data.taipei/api/dataset/6bb3304b-4f46-4bb0-8cd1-60c66dcd1cae/resource/a6e90031-7ec4-4089-afb5-361a4efe7202/download",

  // B-16 / B-17: 新北 路線 125664 (3.6 MB CSV, daily import) + 即時位置 122972.
  "data.ntpc.gov.tw 125664 routes (B-16)": {
    url: "https://data.ntpc.gov.tw/api/datasets/edc3ad26-8ae7-4916-a00b-bc6048d19bf8/csv/file",
    range: "0-1023",
  },
  "data.ntpc.gov.tw 122972 live (B-17)":
    "https://data.ntpc.gov.tw/api/datasets/28ab4122-60e1-4065-98e5-abccb69aaca6/csv/file",

  // B-18: 臺中 83558, 臺南 136310, 高雄 138256 即時位置.
  "newdatacenter.taichung.gov.tw 83558 (B-18)":
    "https://newdatacenter.taichung.gov.tw/api/v1/no-auth/resource.download?rid=c923ad20-2ec6-43b9-b3ab-54527e99f7bc",
  "soa.tainan.gov.tw 136310 (B-18)":
    "https://soa.tainan.gov.tw/Api/Service/Get/2c8a70d5-06f2-4353-9e92-c40d33bcd969",
  "openapi.kcg.gov.tw 138256 (B-18)":
    "https://openapi.kcg.gov.tw/Api/Service/Get/aaf4ce4b-4ca8-43de-bfaf-6dc97e89cac0",

  // opdadm.moi.gov.tw: a resource the site already uses in production
  // (176455) as the control, then 7317 失物招領's own path (spec §8 item 1;
  // 28.9 MB, hence the range; D3 has since cancelled the 失物招領 tool, so
  // that row is informational only). The A1/A2 事故 resource URLs aren't
  // recorded anywhere in the repo (the spec elides them) and D2 cancelled
  // that feature, so they are deliberately not probed.
  "opdadm.moi.gov.tw 176455 (live control)":
    "https://opdadm.moi.gov.tw/api/v1/no-auth/resource/api/dataset/29E8E643-88ED-4952-B21E-BD42A3B7108C/resource/81B3145B-8134-4B01-9FAE-1D62638B4E78/download",
  "opdadm.moi.gov.tw 7317 (spec §8)": {
    url: "https://opdadm.moi.gov.tw/api/v1/no-auth/resource/api/dataset/E1060AE4-ACCE-4960-9EDC-EF52681B9570/resource/82770E4D-D01D-441F-9FD4-FBE1E7B086F6/download",
    range: "0-1023",
  },

  // data.moa.gov.tw is already used in production, but through the older
  // Service/OpenData/TransService.aspx path; spec §3 says the /api/v1/ path
  // that B-12 林火 will use was never probed individually.
  "data.moa.gov.tw ForestFireAlertWCF (B-12)":
    "https://data.moa.gov.tw/api/v1/ForestFireAlertWCF/?CreateDate=2026-10-15",

  // issue #691 (今天要上班上課嗎？): www.dgpa.gov.tw has never been probed from
  // either vantage point, and both halves of that tool depend on it — the
  // office-calendar CSVs that data.gov.tw 14718 points at are served from
  // www.dgpa.gov.tw/FileConversion (the weekly sync fetches them from this
  // host; if it is blocked the page keeps running from the committed seed),
  // and nds.html is the closure-announcement page the tool links to. The CSV
  // is the 116 (2027) file; the metadata API is the resolver the sync uses.
  "data.gov.tw api 14718 (URL resolver)": "https://data.gov.tw/api/v2/rest/dataset/14718",
  "www.dgpa.gov.tw 14718 calendar CSV (#691)":
    "https://www.dgpa.gov.tw/FileConversion?filename=dgpa/files/202607/f538b1ff-ba60-4c63-9477-10db8e6612d1.csv&nfix=&name=116%e5%b9%b4%e4%b8%ad%e8%8f%af%e6%b0%91%e5%9c%8b%e6%94%bf%e5%ba%9c%e8%a1%8c%e6%94%bf%e6%a9%9f%e9%97%9c%e8%be%a6%e5%85%ac%e6%97%a5%e6%9b%86%e8%a1%a8_utf8bom.csv",
  "www.dgpa.gov.tw nds.html (closure page)": "https://www.dgpa.gov.tw/typh/daily/nds.html",
};

const main = () => {
  try {
    for (const [label, target] of Object.entries(targets)) {
      const { url, range } = typeof target === "string" ? { url: target } : target;
      const remote = [
        "curl -sS -o /dev/null --max-time 20",
        ...(range ? ["-r", shellQuote(range)] : []),
        "-w",
        shellQuote("http_code=%{http_code} time=%{time_total} size=%{size_download}"),
        shellQuote(url),
      ].join(" ");
      const result = ssh.call(remote, { retries: 0 });
      const out = (result.stdout || "").trim();
      const err = (result.stderr || "").trim().split("\n")[0] || "";
      console.log(`${label.padEnd(46)} exit=${result.status} ${out} ${err}`);
    }
  } finally {
    ssh.close();
  }
};

main();
