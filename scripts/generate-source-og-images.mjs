#!/usr/bin/env node
/**
 * Generates one og:image PNG per news source_name (plus a generic
 * _default.png for anything unmapped) into public/images/og/source/ —
 * a build-time replacement for the request-time /api/og/news/[sourceName]
 * route that crash-looped production (next/og's ImageResponse renders via
 * WASM, and this host's V8 heap is capped at 768MB; see
 * ops_health_502_watchdog memory, 2026-08-21 incident).
 *
 * Runs on the GitHub Actions runner during deploy (ample RAM, not the
 * fragile production host), between "Build app" and "Package public
 * assets" in deploy-ftps.yml — the output ships as plain static files, no
 * WASM ever touches the production process. Not committed to git (see
 * .gitignore) — regenerated fresh on every deploy from this script, the
 * single source of truth.
 *
 * SOURCE_LABELS/GOV_SOURCE_NAMES below mirror lib/server/news/sourceLabels.ts
 * and sourceCategories.ts's gov category — duplicated rather than imported
 * because this is a plain standalone Node script (this repo's convention
 * for scripts/, see e.g. build-cedict-terms.mjs) with no TS/path-alias
 * loader, while those are TS modules consumed by the Next.js app itself.
 * Keep in sync by hand if either list changes.
 */
import { ImageResponse } from "next/og.js";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const SOURCE_LABELS = {
  mohw: "衛生福利部",
  google_news: "Google 新聞",
  ltn: "自由時報",
  nhi: "中央健康保險署",
  cdc: "疾病管制署",
  tfda: "食品藥物管理署",
  hpa: "國民健康署",
  top1health: "華人健康網",
  mamaclub: "媽媽經",
  twstreetcorner: "巷仔口社會學",
  cna: "中央社",
  cwa: "中央氣象署",
  csr_cw: "CSR@天下",
  esg_gvm: "ESG遠見",
  esg_businesstoday: "ESG今周刊",
  ubrand_udn: "倡議家",
  commonhealth: "康健雜誌",
  healthforall: "大家健康雜誌",
  ttvc: "常春月刊",
  twhealth: "好健康（全民健康基金會）",
  heho: "Heho健康",
  mirrormedia_healthnews: "鏡週刊健康醫療網",
  udn_health: "元氣網（聯合報健康）",
  moenv: "環境部",
  setn: "祝你健康",
  ettoday: "ETtoday健康雲",
  healthnews: "健康醫療網",
  fiftyplus: "50+（橘世代）",
  yahoo_health: "Yahoo奇摩新聞健康",
};

const GOV_SOURCE_NAMES = new Set(["mohw", "hpa", "cdc", "tfda", "nhi", "moenv", "cwa"]);

const PLACEHOLDER_HEX_COLORS = {
  gov: { bgFrom: "#ecfdf5", bgTo: "#f1f5f9", accent: "#059669" },
  media: { bgFrom: "#eef2ff", bgTo: "#f1f5f9", accent: "#4f46e5" },
};

const OUT_DIR = path.join(process.cwd(), "public", "images", "og", "source");

const renderCard = (label, isGov, showSubtitle) => {
  const colors = isGov ? PLACEHOLDER_HEX_COLORS.gov : PLACEHOLDER_HEX_COLORS.media;
  const children = [
    { type: "div", props: { style: { display: "flex", fontSize: 56, fontWeight: 700, color: colors.accent, letterSpacing: -1 }, children: label } },
  ];
  if (showSubtitle) {
    children.push({
      type: "div",
      props: { style: { display: "flex", marginTop: 20, fontSize: 24, fontWeight: 500, color: "#94a3b8", letterSpacing: 2 }, children: "j172tw Healthz" },
    });
  }
  return new ImageResponse(
    {
      type: "div",
      props: {
        style: {
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: `linear-gradient(to bottom right, ${colors.bgFrom}, ${colors.bgTo})`,
        },
        children,
      },
    },
    { width: 1200, height: 630 },
  );
};

const main = async () => {
  await mkdir(OUT_DIR, { recursive: true });

  let written = 0;
  for (const [sourceName, label] of Object.entries(SOURCE_LABELS)) {
    const res = renderCard(label, GOV_SOURCE_NAMES.has(sourceName), true);
    const buffer = Buffer.from(await res.arrayBuffer());
    await writeFile(path.join(OUT_DIR, `${sourceName}.png`), buffer);
    written += 1;
  }

  // Generic fallback for any source_name not in SOURCE_LABELS — no subtitle
  // (it would just duplicate the title, since there's no per-source label to show).
  const defaultRes = renderCard("j172tw Healthz", false, false);
  await writeFile(path.join(OUT_DIR, "_default.png"), Buffer.from(await defaultRes.arrayBuffer()));
  written += 1;

  console.log(`Generated ${written} source og:image placeholders in ${OUT_DIR}`);
};

main().catch((err) => {
  console.error("generate-source-og-images failed:", err);
  process.exit(1);
});
