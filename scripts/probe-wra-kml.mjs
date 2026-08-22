/**
 * Reports what is actually inside WRA's three warning "map layer" datasets.
 *
 * Each of those opendata resources returns a single catalogue row — 檔案描述,
 * 檔案格式, 資源網址 — rather than data. The question this answers is whether the
 * file behind 資源網址 carries any usable *text* (warning location names, levels,
 * timestamps) or only geometry. If it is only geometry, they cannot become text
 * bulletins and would need a map-overlay subsystem instead.
 *
 * Runs on a GitHub runner because opendata.wra.gov.tw answers everything else
 * with an F5 Shape bot challenge.
 */

const RESOURCES = {
  "301c0b62 淹水警戒": "301c0b62-8736-4e03-95ef-55309c1a5e74",
  "eecf1c46 水庫警戒": "eecf1c46-9676-43a0-936e-13b78a69213b",
  "64d907be 水位警戒": "64d907be-342b-4e3d-ab7e-89f7aa5d776e",
};

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const get = async (url, timeoutMs = 40000) =>
  fetch(url, {
    headers: { "User-Agent": UA },
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
  });

const countTag = (body, tag) => {
  const re = new RegExp("<" + tag + "[ >]", "g");
  return (body.match(re) || []).length;
};

const sampleTag = (body, tag, limit) => {
  const re = new RegExp("<" + tag + ">([^<]{1,80})</" + tag + ">", "g");
  const out = [];
  for (const m of body.matchAll(re)) {
    const value = m[1].trim();
    if (value) out.push(value);
    if (out.length >= limit) break;
  }
  return out;
};

const main = async () => {
  for (const [label, id] of Object.entries(RESOURCES)) {
    console.log("\n=== " + label + " ===");
    try {
      const catalogue = await get(
        `https://opendata.wra.gov.tw/api/v2/${id}?sort=_importdate%20asc&format=JSON`,
        30000,
      );
      const catalogueBody = await catalogue.text();
      if (/^\s*<(!doctype|html)/i.test(catalogueBody)) {
        console.log("  bot challenge on the catalogue request");
        continue;
      }
      const parsed = JSON.parse(catalogueBody);
      const row = Array.isArray(parsed) ? parsed[0] : null;
      if (!row) {
        console.log("  catalogue row missing");
        continue;
      }

      const format = row["檔案格式"];
      const target = row["資源網址"];
      console.log("  format:", format);
      console.log("  url:", String(target || "").slice(0, 140));
      if (!target) {
        console.log("  no 資源網址 to follow");
        continue;
      }

      const res = await get(target);
      const body = await res.text();
      console.log(
        "  fetched:",
        res.status,
        res.headers.get("content-type"),
        body.length,
        "bytes",
      );

      // Does it carry human-readable labels, or only coordinates?
      console.log("  <Placemark> count:", countTag(body, "Placemark"));
      console.log("  <name> samples:", JSON.stringify(sampleTag(body, "name", 10)));
      console.log(
        "  <description> present:",
        countTag(body, "description"),
        "| <coordinates> present:",
        countTag(body, "coordinates"),
      );
      console.log("  head:", body.slice(0, 240).replace(/\s+/g, " "));
    } catch (error) {
      console.log("  ERROR:", error instanceof Error ? error.message : error);
    }
  }
};

main().catch((error) => {
  console.error("probe failed:", error);
  process.exit(1);
});
