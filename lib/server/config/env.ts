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
  moenvNewsApiKey: process.env.MOENV_NEWS_API_KEY?.trim() || null,
  // 綠色商店基本資料 (gp_p_01) — consumed by scripts/import-moenv-green-shops.mjs,
  // a standalone script (like the MOHW import-*.mjs scripts) rather than an
  // in-app fetch, so this field mainly documents/types the var for
  // consistency; the script itself reads process.env.MOENV_GP_API_KEY
  // directly since it runs outside the Next.js server (no MYSQL_* etc.
  // configured in that context).
  moenvGpApiKey: process.env.MOENV_GP_API_KEY?.trim() || null,
  cloudflare: {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID?.trim() || null,
    apiToken: process.env.CLOUDFLARE_API_TOKEN?.trim() || null,
  },
};