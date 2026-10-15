// Small disease-name dictionary for the WHO DON pipeline (issue #596, parent
// #583). WHO's own DON titles are English (original language), so this is
// keyed by a *normalized* English disease-name variant and maps to a
// canonical zh name — the mirror image of issue #589's
// EPIDEMIC_DISEASE_NAMES (lib/tools/globeWatch/epidemicsDiseaseNames.ts),
// which is keyed by zh (CDC's original language) and maps outward to
// en/ja/ko. Where the same disease exists in both, the zh value here matches
// #589's own zh key verbatim, so a future UI ticket that wants to join WHO
// pins against the epidemics item's disease dictionary can do so by the zh
// string without a second translation.
//
// AC: "疾病（原文與字典對應結果）" — resolveDiseaseName() returns null for
// anything not listed here (lib/server/who/sources/who.ts keeps diseaseRaw
// as the original text regardless); this is a closed, hand-checked table,
// never a machine-translated catch-all.
export const WHO_DISEASE_NAME_MAP: Record<string, string> = {
  // Covers both "Ebola virus disease" and the Bundibugyo-virus-specific
  // phrasing WHO's real 2026 DON titles use — both are the same disease
  // family and both map to #589's existing zh key for it.
  "ebola virus disease": "伊波拉病毒感染",
  "ebola disease caused by bundibugyo virus": "伊波拉病毒感染",
  "ebola disease": "伊波拉病毒感染",
  "marburg virus disease": "馬堡病毒出血熱",
  "nipah virus disease": "立百病毒感染症",
  "nipah virus infection": "立百病毒感染症",
  "avian influenza a(h5n1)": "H5N1禽流感",
  "avian influenza a(h5n5)": "H5N5禽流感",
  "avian influenza a(h9n2)": "H9N2禽流感",
  "middle east respiratory syndrome coronavirus": "中東呼吸症候群冠狀病毒感染症",
  "yellow fever": "黃熱病",
  "measles": "麻疹",
  "diphtheria": "白喉",
  "cholera": "霍亂",
  "chikungunya virus disease": "屈公病",
  "rift valley fever": "裂谷熱",
  "seasonal influenza": "季節性流感",
  "mpox": "M痘",
  // WHO's own titles sometimes qualify mpox with clade info — the base
  // phrase still resolves, since diseaseRaw keeps the full original text
  // regardless of which dictionary entry matched.
  "mpox: recombinant virus with genomic elements of clades ib and iib": "M痘",
  "broader transmission of mpox due to clade ib mpxv": "M痘",
};

const normalize = (name: string): string => name.trim().toLowerCase();

/**
 * Resolves a raw (English, original-language) disease-name segment to its
 * dictionary-mapped zh name, or null when it isn't in WHO_DISEASE_NAME_MAP.
 * Tries an exact normalized match first, then falls back to checking
 * whether any dictionary key is a substring of the input — WHO's titles
 * frequently add qualifiers ("... – Global situation" is already stripped
 * by the title parser, but disease segments themselves sometimes carry
 * clade/subtype suffixes the exact-match wouldn't catch).
 */
export function resolveDiseaseName(raw: string): string | null {
  const normalized = normalize(raw);
  if (WHO_DISEASE_NAME_MAP[normalized]) return WHO_DISEASE_NAME_MAP[normalized];
  for (const [key, zh] of Object.entries(WHO_DISEASE_NAME_MAP)) {
    if (normalized.includes(key)) return zh;
  }
  return null;
}
