import { z } from "zod";
import type { FacilityRecord } from "@/lib/server/facilities/queries";
import { httpRequest } from "@/lib/server/net/httpClient";
import { decodeBig5, normalizeAddress, parseCsv, toHalfwidthDigits } from "@/lib/server/facilities/csv";
import { validateImportRows } from "@/lib/server/validation/importSchema";
import { stripAddressAnnotation, withCountyPrefix } from "@/lib/server/facilities/sources/addictionTreatmentFacilities";

// 衛福部社會及家庭署「全國社福中心福利服務中心通訊錄」(data.gov.tw 160903) — a
// single national Big5 CSV, confirmed live 2026-10-14: exactly 158 rows, 5
// columns (縣市別/機關單位名稱/服務轄區/地址/電話).
const SOURCE_URL =
  "https://www.opendata.mohw.gov.tw/dataset/opendata/sfaa/160903/" +
  encodeURIComponent("全國社福中心通訊錄.csv");

// NOT registered in runSync.ts's SOURCES (see the comment block there) and
// NOT wired into .github/workflows/six-monthly-sync.yml's automated steps.
// Re-confirmed empirically 2026-10-14 via .github/workflows/egress-probe.yml
// (issue #603): a GitHub Actions runner's curl against this exact URL timed
// out after 25s (http_code 000), and a probe from the production host over
// the SSH loopback (scripts/gha-egress-probe-host.mjs) timed out after 20s
// (curl exit 28) — both legs unreachable, joining mohw_disability_welfare/
// mohw_elder_welfare as a manual-only MOHW source. Run
// scripts/import-mohw-social-welfare-centers.mjs by hand from a residential/
// office network instead (same pattern as
// scripts/import-mohw-disability-welfare.mjs).

interface MohwSocialWelfareCenterRow {
  縣市別: string;
  機關單位名稱: string;
  服務轄區: string;
  地址: string;
  電話: string;
}

// Critical-field schema for the raw rows. 縣市別/機關單位名稱/地址 are
// identity-bearing (sourceId and the address-repair logic below both depend
// on them); 服務轄區/電話 are the two fields the page surfaces directly, so a
// silent upstream rename of either should fail loudly too. `.nullable()`
// (not `.optional()`) so a column entirely missing from every row
// (renamed/removed upstream) fails validation, while one row's legitimately
// blank value (confirmed live: 2/158 rows — satellite sub-entries with no
// 機關單位名稱/服務轄區 of their own, see the filter below) still passes.
export const mohwSocialWelfareCenterRawSchema = z.object({
  縣市別: z.string().nullable(),
  機關單位名稱: z.string().nullable(),
  服務轄區: z.string().nullable(),
  地址: z.string().nullable(),
  電話: z.string().nullable(),
});

/**
 * Confirmed live 2026-10-14: 8/158 named rows end their `地址` with a stray
 * literal "?" (0x3F) byte that is already present in the raw upstream bytes
 * (checked against the hex — not a decode artifact of this pipeline).
 * Harmless trailing noise on an otherwise-valid address; dropped rather than
 * geocoded/displayed verbatim.
 */
function stripTrailingArtifact(address: string): string {
  return address.replace(/\?+$/, "").trim();
}

/**
 * Confirmed live 2026-10-14: exactly one row ("桃園巿八德區...") spells the
 * county suffix with "巿" (U+5DFF, a visual twin of "市" U+5E02) instead of
 * the "市" `withCountyPrefix`'s `startsWith` comparison expects. Normalizing
 * it first avoids that row being treated as missing its county prefix and
 * double-prefixed into "桃園市桃園巿八德區...".
 */
function normalizeCountySuffixHomoglyph(s: string): string {
  return s.replace(/巿/g, "市");
}

/**
 * Builds the display/geocodable address for one row. Confirmed live
 * 2026-10-14: 4/158 rows prefix the real address with a "暫時辦公處："
 * (temporary office) annotation before a colon — the same shape
 * `addictionTreatmentFacilities.ts`'s `stripAddressAnnotation` already
 * handles for a different MOHW dataset, reused here rather than
 * reimplemented; 14/158 named rows (including the 4 annotated ones) don't
 * repeat `縣市別` at the start of `地址` at all, handled by the same
 * `withCountyPrefix` that module already exports.
 */
export function buildSocialWelfareCenterAddress(county: string, rawAddress: string): string {
  const deAnnotated = stripAddressAnnotation(normalizeAddress(rawAddress));
  const homoglyphFixed = normalizeCountySuffixHomoglyph(deAnnotated);
  const prefixed = withCountyPrefix(county, homoglyphFixed);
  return stripTrailingArtifact(normalizeAddress(prefixed));
}

/** No stable government-issued ID in this export — same gap as hakkaCommunity.ts. */
export function buildSocialWelfareCenterSourceId(name: string, address: string): string {
  return `${name.trim()}|${address.trim()}`.slice(0, 100);
}

/**
 * Some rows list more than one phone/fax number separated by a literal
 * newline (confirmed live: e.g. "03-8763-913\n03-8763-528",
 * "05-2163-373(兒少組)\n傳真05-2163-378") — collapse those onto one line with
 * a full-width comma separator instead of displaying a raw embedded
 * newline, and convert any fullwidth digits to halfwidth.
 */
export function cleanSocialWelfareCenterPhone(raw: string): string {
  return toHalfwidthDigits(raw.replace(/[\r\n]+/g, "、").replace(/、{2,}/g, "、")).trim();
}

export async function fetchMohwSocialWelfareCenters(): Promise<FacilityRecord[]> {
  // Big5-encoded — deliberately uses httpRequest (raw buffer) instead of
  // httpGetText, which decodes as UTF-8 and would mangle these bytes.
  const res = await httpRequest(SOURCE_URL, { timeoutMs: 20000 });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`MOHW social welfare center directory (160903) request failed: HTTP ${res.status}`);
  }

  const text = decodeBig5(res.buffer);
  const raw = parseCsv(text) as unknown as MohwSocialWelfareCenterRow[];
  validateImportRows("MOHW social welfare centers (160903)", mohwSocialWelfareCenterRawSchema, raw);

  // Confirmed live 2026-10-14: 2/158 rows are satellite-office sub-entries of
  // the row immediately above them (e.g. 望安七美社會福利服務中心's 七美據點,
  // 馬公湖西社會福利服務中心's 湖西據點) with no 機關單位名稱/服務轄區/縣市別 of
  // their own — same "filter on the identity-bearing fields" pattern as
  // hakkaCommunity.ts, dropping the 2 sub-entries rather than guessing how to
  // merge them into their parent row.
  return raw
    .filter((r) => r.機關單位名稱 && r.地址 && r.縣市別)
    .map((r) => {
      const address = buildSocialWelfareCenterAddress(r.縣市別, r.地址);
      return {
        facilityType: "social_welfare_center",
        sourceKey: "mohw_social_welfare_center",
        sourceId: buildSocialWelfareCenterSourceId(r.機關單位名稱, address),
        name: r.機關單位名稱,
        address,
        phone: r.電話 ? cleanSocialWelfareCenterPhone(r.電話) : null,
        lat: null,
        lng: null,
        serviceItem: r.服務轄區 ? r.服務轄區.trim() : null,
        serviceTime: null,
        dataOrg: "衛生福利部社會及家庭署",
      };
    });
}
