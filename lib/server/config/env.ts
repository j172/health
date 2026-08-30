const mustGet = (key: string): string => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required env: ${key}`);
  }
  return value;
};

const parseBool = (value: string | undefined, fallback: boolean): boolean => {
  if (!value) return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
};

export const env = {
  mysql: {
    host: mustGet("MYSQL_HOST"),
    port: Number(process.env.MYSQL_PORT || 3306),
    user: mustGet("MYSQL_USER"),
    password: mustGet("MYSQL_PASSWORD"),
    database: mustGet("MYSQL_DATABASE"),
    ssl: parseBool(process.env.MYSQL_SSL, false),
  },
  rssSyncAdminSecret: mustGet("RSS_SYNC_ADMIN_SECRET"),
  pixabayApiKey: process.env.PIXABAY_API_KEY?.trim() || null,
  pexelsApiKey: process.env.PEXELS_API_KEY?.trim() || null,
  // Unsplash issues three related credentials per registered app; only
  // accessKey is used for API calls (Client-ID auth on every request incl.
  // the required "trigger download" ping — see lib/server/unsplash/download.ts).
  // secretKey/applicationId aren't needed for the read-only demo-tier usage
  // this feature makes, but are captured here for parity with what's already
  // in .env and in case OAuth-flow usage is ever added later.
  unsplash: {
    accessKey: process.env.UNSPLASH_ACCESS_KEY?.trim() || null,
    secretKey: process.env.UNSPLASH_SECRET_KEY?.trim() || null,
    applicationId: process.env.UNSPLASH_APPLICATION_ID?.trim() || null,
  },
  // data.moenv.gov.tw issues ONE API key per account that works across every
  // dataset — verified live: the PM25 key returns HTTP 200 with real articles
  // from mnews_p_01. This codebase happens to hold that same value under three
  // names for historical reasons (news / general-purpose / pm25).
  //
  // The fallback is not tidiness, it is the fix: MOENV_NEWS_API_KEY was never
  // plumbed into deploy-ftps.yml, so Phase 6 threw "MOENV_NEWS_API_KEY is not
  // configured" on every ingestion run since it shipped, while a working key for
  // the very same account sat in the host's .env under a different name.
  moenvNewsApiKey:
    process.env.MOENV_NEWS_API_KEY?.trim() ||
    process.env.MOENV_GP_API_KEY?.trim() ||
    process.env.MOENV_PM25_API_KEY?.trim() ||
    null,
  // 綠色商店基本資料 (gp_p_01) — consumed by scripts/import-moenv-green-shops.mjs,
  // a standalone script (like the MOHW import-*.mjs scripts) rather than an
  // in-app fetch, so this field mainly documents/types the var for
  // consistency; the script itself reads process.env.MOENV_GP_API_KEY
  // directly since it runs outside the Next.js server (no MYSQL_* etc.
  // configured in that context).
  moenvGpApiKey:
    process.env.MOENV_GP_API_KEY?.trim() ||
    process.env.MOENV_AQI_API_KEY?.trim() ||
    process.env.MOENV_PM25_API_KEY?.trim() ||
    null,
  cloudflare: {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID?.trim() || null,
    apiToken: process.env.CLOUDFLARE_API_TOKEN?.trim() || null,
  },
};
