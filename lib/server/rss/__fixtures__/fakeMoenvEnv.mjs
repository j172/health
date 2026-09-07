// Stand-in for @/lib/server/config/env used only by fetchMoenvNews.test.mjs
// (via the module-resolution hook in that file). The real env.ts throws at
// import time if MYSQL_*/RSS_SYNC_ADMIN_SECRET etc. aren't set, which has
// nothing to do with what this test exercises — fetchMoenvNews only ever
// reads env.moenvNewsApiKey.
export const env = {
  moenvNewsApiKey: "test-api-key",
};
