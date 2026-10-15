/**
 * Shared helpers for the 戒菸院所六都覆蓋 family (issue #572, parent #562) — the
 * 6 county-level smoking_cessation sources (臺北/新北/新北牙醫/桃園/臺中/臺南/高雄)
 * that each batch-replace, for their own county, the national baseline rows
 * synced by hpaSmokingCessation.ts (#569, sourceKey "hpa_smoking_cessation_6954").
 */

/** The national baseline source (#569) whose rows get batch-replaced per county by this family. */
export const SMOKING_CESSATION_BASELINE_SOURCE_KEY = "hpa_smoking_cessation_6954";

/**
 * Per-county address-substring match lists, used by runSync.ts's
 * `replaceBaselineForCounty` to delete this county's slice of the national
 * baseline before inserting this county's own rows (issue #572 AC: "六都依
 * 縣市整批替換，不逐筆比對去重"). Each list includes the official 臺/台 spelling
 * variant, AND (where applicable) the pre-merger county name the 2010/2014
 * administrative mergers retired — confirmed live 2026-10-14: the national
 * 6954 dataset still has at least one row addressed under the old "桃園縣"
 * name (pre-2014), so matching only "桃園市" would leave that legacy-named
 * baseline row orphaned alongside the new 桃園市 county source's rows
 * instead of being replaced by them.
 *
 * 新北市's pre-2010 name was 臺北縣/台北縣 — deliberately NOT "臺北"/"台北" alone,
 * which would also match 臺北市's own rows (新北 and 臺北 share the same
 * 2-character city-name prefix; only the full 3-character 市/縣 form
 * disambiguates them).
 */
export const SMOKING_CESSATION_COUNTY_MATCH: Record<string, readonly string[]> = {
  smoking_cessation_taipei_121898: ["臺北市", "台北市"],
  smoking_cessation_ntpc_124244: ["新北市", "臺北縣", "台北縣"],
  smoking_cessation_ntpc_dental_125915: ["新北市", "臺北縣", "台北縣"],
  smoking_cessation_taoyuan_33872: ["桃園市", "桃園縣"],
  smoking_cessation_taichung_81720: ["臺中市", "台中市", "臺中縣", "台中縣"],
  smoking_cessation_tainan_140122: ["臺南市", "台南市", "臺南縣", "台南縣"],
  smoking_cessation_kaohsiung_87259: ["高雄市", "高雄縣"],
};

/** Same `{name}|{address}` compound-key convention as hpaSmokingCessation.ts's `buildHpaSmokingCessationSourceId` — safe to reuse verbatim across every county source here since identity is always scoped within one (facility_type, source_key) pair, and each county has its own distinct source_key. */
export function buildSmokingCessationSourceId(name: string, address?: string | null): string {
  return `${name.trim()}|${(address || "").trim()}`.slice(0, 100);
}

/**
 * `YYYY-MM-DD` this site's own sync captured that county's snapshot — same
 * convention (and same rationale: no county open-data portal here exposes a
 * safe-to-cache-across-syncs "last updated" date of its own) as
 * childcareCenterShared.ts's `todayDataAsOf` and hpaSmokingCessation.ts's
 * inlined copy. Inlined here too rather than importing the childcare one, to
 * avoid an unrelated cross-feature dependency for one line.
 */
export function todayDataAsOf(): string {
  return new Date().toISOString().slice(0, 10);
}

/** 可給藥 flag → extra_json.smokingMedication, or null if the column is absent/blank. Never guessed — a county source with no 給藥 column of its own passes `raw: null` through, not a fabricated guess. */
export function smokingMedicationFlag(raw: string | null | undefined): string | null {
  return raw === "V" ? "可提供戒菸藥品" : null;
}

/** 可衛教 flag → extra_json.smokingEducation. See smokingMedicationFlag's null-guessing note. */
export function smokingEducationFlag(raw: string | null | undefined): string | null {
  return raw === "V" ? "可提供戒菸衛教" : null;
}

/**
 * 僅調劑 flag → extra_json.smokingDispensingOnly. Only 臺北 121898's CSV ships
 * an explicit 僅調劑 column among the 6 county sources (confirmed live
 * 2026-10-14) — every other county source passes `raw: null` through
 * unconditionally rather than inferring "僅調劑" from, say, an empty 給藥+衛教
 * pair, which would be a guess this ticket's "不要瞎猜" instruction rules out.
 */
export function smokingDispensingOnlyFlag(raw: string | null | undefined): string | null {
  return raw === "V" ? "僅能調劑" : null;
}
