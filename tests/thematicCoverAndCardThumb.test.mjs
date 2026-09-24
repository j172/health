import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

process.env.MYSQL_HOST ??= "localhost";
process.env.MYSQL_USER ??= "test_user";
process.env.MYSQL_PASSWORD ??= "test_pass";
process.env.MYSQL_DATABASE ??= "test_db";
process.env.RSS_SYNC_ADMIN_SECRET ??= "test_secret";

const REPO_ROOT = new URL("../", import.meta.url);

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return { url: "data:text/javascript,", shortCircuit: true };
    }
    if (specifier === "next/cache") {
      return {
        url: "data:text/javascript,export function revalidatePath() {}; export function revalidateTag() {};",
        shortCircuit: true,
      };
    }
    let target = specifier;
    if (target.startsWith("@/")) {
      target = target.slice(2);
      const url = new URL(target, REPO_ROOT);
      for (const ext of [".ts", ".tsx", ".js", ".mjs", "/index.ts", "/index.js"]) {
        const candidate = new URL(target + ext, REPO_ROOT);
        if (existsSync(fileURLToPath(candidate))) {
          return nextResolve(candidate.href, context);
        }
      }
      return nextResolve(url.href, context);
    }
    if (specifier.startsWith("./") || specifier.startsWith("../")) {
      const parentUrl = context.parentURL ? new URL(context.parentURL) : REPO_ROOT;
      if (!parentUrl.pathname.includes("/node_modules/")) {
        for (const ext of [".ts", ".tsx", ".js", ".mjs", "/index.ts", "/index.js"]) {
          const candidate = new URL(specifier + ext, parentUrl);
          if (existsSync(fileURLToPath(candidate))) {
            return nextResolve(candidate.href, context);
          }
        }
      }
    }
    return nextResolve(specifier, context);
  },
});

const { isGovSource } = await import("@/lib/server/news/sourceCategories");

test("isGovSource accurately identifies official agencies", () => {
  assert.equal(isGovSource("cdc"), true);
  assert.equal(isGovSource("tfda"), true);
  assert.equal(isGovSource("nhi"), true);
  assert.equal(isGovSource("mohw"), true);
  assert.equal(isGovSource("moenv"), true);
  assert.equal(isGovSource("cwa"), true);

  // Media and NPO sources are not gov
  assert.equal(isGovSource("ltn"), false);
  assert.equal(isGovSource("edh"), false);
  assert.equal(isGovSource("commonhealth"), false);
  assert.equal(isGovSource("children"), false);
});

test("Smart override logic: gov stock photo overridden, real assets preserved", () => {
  const isStockPhoto = (source) =>
    source === "pixabay" ||
    source === "pexels" ||
    source === "unsplash" ||
    source === "flickr";

  const shouldOverride = (item) => {
    const isGov = isGovSource(item.source_name);
    return !item.card_image_url || (isGov && isStockPhoto(item.card_image_source));
  };

  // Case 1: CDC with Pixabay photo -> OVERRIDDEN with ThematicCover
  assert.equal(
    shouldOverride({
      source_name: "cdc",
      card_image_url: "/images/news/pixabay/doctor.jpg",
      card_image_source: "pixabay",
    }),
    true
  );

  // Case 2: CDC with real epidemic chart from RSS -> PRESERVED
  assert.equal(
    shouldOverride({
      source_name: "cdc",
      card_image_url: "/images/news/articles/chart.png",
      card_image_source: "rss",
    }),
    false
  );

  // Case 3: Media news with Pixabay photo -> PRESERVED (Tier 2 fallback)
  assert.equal(
    shouldOverride({
      source_name: "ltn",
      card_image_url: "/images/news/pixabay/healthy-food.jpg",
      card_image_source: "pixabay",
    }),
    false
  );

  // Case 4: Media news with no photo -> OVERRIDDEN with ThematicCover (Tier 3 fallback)
  assert.equal(
    shouldOverride({
      source_name: "ltn",
      card_image_url: null,
      card_image_source: null,
    }),
    true
  );
});

test("deriveJiebaSearchTerm matches new ESG, digital health, and elder care domains", async () => {
  const { deriveJiebaSearchTerm } = await import("@/lib/server/news/imageSearchTerms");

  assert.equal(
    deriveJiebaSearchTerm("2026台灣淨零轉型與企業永續發展論壇"),
    "sustainability",
  );
  assert.equal(
    deriveJiebaSearchTerm("生醫科技突破：AI技術導入臨床應用"),
    "digital health",
  );
  assert.equal(
    deriveJiebaSearchTerm("衛福部擴大公共托育與托嬰中心補助"),
    "baby care",
  );
  assert.equal(
    deriveJiebaSearchTerm("健保署公布最新罕病新藥給付政策"),
    "healthcare policy",
  );
  assert.equal(
    deriveJiebaSearchTerm("新北市擴大社區長照2.0日間照顧中心"),
    "caregiver",
  );
  assert.equal(
    deriveJiebaSearchTerm("衛福部推動高齡友善城市與銀髮樂活計畫"),
    "elderly",
  );
  assert.equal(
    deriveJiebaSearchTerm("正念冥想課程助現代人身心療癒紓壓"),
    "meditation",
  );
});

test("ThematicCover and CardThumb integration in HeroPost and SearchModal", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");

  const heroPostContent = fs.readFileSync(
    path.join(process.cwd(), "components/News/HeroPost.tsx"),
    "utf8"
  );
  assert.ok(
    heroPostContent.includes("<CardThumb item={item}"),
    "HeroPost secondary cards must use CardThumb to ensure thumbnail visualization"
  );
  assert.ok(
    heroPostContent.includes("<ThematicCover") && heroPostContent.includes("heroMode"),
    "HeroPost primary hero must fall back to ThematicCover with heroMode"
  );

  const searchModalContent = fs.readFileSync(
    path.join(process.cwd(), "components/Search/SearchModal.tsx"),
    "utf8"
  );
  assert.ok(
    searchModalContent.includes("<CardThumb item={item} sizes=\"80px\" />"),
    "SearchModal must use CardThumb instead of plain img or Health text box"
  );
  assert.ok(
    !searchModalContent.includes(">Health</div>"),
    "SearchModal must eliminate the crude 'Health' text box fallback"
  );
});

test("Tier 3 archived stock image reuse and 100-article recency guard", async () => {
  const { RECENCY_COLLISION_WINDOW, tryAssignArchivedStockImage } =
    await import("@/lib/server/news/cardImages");

  assert.equal(
    RECENCY_COLLISION_WINDOW,
    100,
    "Recency anti-collision window must be set to 100 articles"
  );

  // Mock database connection
  const executedInserts = [];
  const fakeCandidates = [
    {
      provider: "pixabay",
      provider_image_id: "998811",
      pixabay_id: 998811,
      local_path: "/images/news/pixabay/elderly-care.webp",
      source_page_url: "https://pixabay.com/photos/998811/",
      contributor_name: "PhotographerA",
      content_sha256: "deadbeef01",
      width: 1200,
      height: 800,
    },
    {
      provider: "pexels",
      provider_image_id: "554422",
      pixabay_id: null,
      local_path: "/images/news/pexels/recent-care.webp",
      source_page_url: "https://pexels.com/photos/554422/",
      contributor_name: "PhotographerB",
      content_sha256: "deadbeef02",
      width: 1200,
      height: 800,
    },
  ];

  // Case 1: Candidate is in recentUsedPaths (collision prevention) -> Should be skipped
  const recentUsedPaths = new Set(["/images/news/pexels/recent-care.webp"]);
  const mockConnCollided = {
    query: async () => [
      [
        {
          ...fakeCandidates[1], // /images/news/pexels/recent-care.webp
        },
      ],
    ],
    execute: async () => {
      throw new Error("Should not execute insert for collided recent image");
    },
  };

  const fakeNews = {
    id: 9999,
    title: "長期照顧與高齡長者健康福祉政策推展",
    lat: null,
    lng: null,
    location_name: null,
    facility_id: null,
    description_text: null,
    detail_text: null,
  };

  const assignedCollided = await tryAssignArchivedStockImage(
    mockConnCollided,
    fakeNews,
    ["caregiver", "elderly"],
    recentUsedPaths
  );
  assert.equal(
    assignedCollided,
    false,
    "Images within recent 100 articles must be rejected by recency anti-collision window"
  );

  // Case 2: Candidate not in recentUsedPaths, and physical file exists
  // We use an existing image in public/ directory (e.g. /images/news/pixabay or favicon or a dummy that exists)
  const fs = await import("node:fs");
  const path = await import("node:path");
  // Find an actual existing file in public/ to satisfy existsSync
  let existingPublicFile = null;
  const publicImagesDir = path.join(process.cwd(), "public", "images");
  if (fs.existsSync(publicImagesDir)) {
    const findFile = (dir) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isFile()) return full;
        if (entry.isDirectory()) {
          const res = findFile(full);
          if (res) return res;
        }
      }
      return null;
    };
    const found = findFile(publicImagesDir);
    if (found) {
      existingPublicFile = "/" + path.relative(path.join(process.cwd(), "public"), found).replace(/\\/g, "/");
    }
  }

  if (existingPublicFile) {
    const validCandidate = {
      ...fakeCandidates[0],
      local_path: existingPublicFile,
    };

    const mockConnSuccess = {
      query: async () => [[validCandidate]],
      execute: async (sql, params) => {
        executedInserts.push({ sql, params });
        return [{ affectedRows: 1 }];
      },
    };

    const cleanRecentPaths = new Set();
    const assignedSuccess = await tryAssignArchivedStockImage(
      mockConnSuccess,
      fakeNews,
      ["caregiver", "elderly"],
      cleanRecentPaths
    );

    assert.equal(assignedSuccess, true, "Archived stock image must be assigned when valid and not in recent window");
    assert.equal(executedInserts.length, 1, "Must insert news_card_images record for reused image");
    assert.ok(
      cleanRecentPaths.has(existingPublicFile),
      "Assigned image must be added to recentUsedPaths to protect subsequent articles"
    );
  }
});

