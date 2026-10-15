// Country-name -> ISO 3166-1 alpha-2 resolution for the WHO DON pipeline
// (issue #596, parent #583). Per the issue's own instruction ("國家 ISO
// （沿用國際疫情項目建立的 ISO 對照表）"), this REUSES issue #589's
// EPIDEMIC_COUNTRY_NAMES table (lib/tools/globeWatch/epidemicsCountryNames.ts)
// rather than building a second, separate country list — it just builds the
// *reverse* index (English name -> ISO) that table doesn't need for its own
// job (rendering an already-known ISO code), because WHO's DON titles carry
// a free-text country name, not an ISO code.
import { EPIDEMIC_COUNTRY_NAMES } from "@/lib/tools/globeWatch/epidemicsCountryNames";

const normalize = (name: string): string =>
  name
    .trim()
    .toLowerCase()
    .replace(/^the\s+/, "");

const NAME_TO_ISO = new Map<string, string>();
for (const [iso, entry] of Object.entries(EPIDEMIC_COUNTRY_NAMES)) {
  NAME_TO_ISO.set(normalize(entry.en), iso);
}

/**
 * A small, explicit, hand-checked set of official/alternate English country
 * names that appear in real WHO DON titles but don't match
 * EPIDEMIC_COUNTRY_NAMES' own `en` string exactly — CDC's dataset (#589's
 * source) and WHO's DON titles don't share one canonical naming convention
 * (e.g. CDC's table says "Russia", WHO's titles say "the Russian
 * Federation"). This is a closed list of known variants, not a fuzzy/guessed
 * match — anything not covered here (or in EPIDEMIC_COUNTRY_NAMES itself)
 * resolves to null, same "查不到時… 不猜測" contract #589 established for its
 * own dictionaries.
 */
const ALIASES: Record<string, string> = {
  "russian federation": "RU",
  "united states of america": "US",
  "republic of korea": "KR",
  "democratic people's republic of korea": "KP",
  "lao people's democratic republic": "LA",
  "united republic of tanzania": "TZ",
  "viet nam": "VN",
  "syrian arab republic": "SY",
  "bolivarian republic of venezuela": "VE",
  "iran (islamic republic of)": "IR",
  "republic of moldova": "MD",
  "czechia": "CZ",
  "united kingdom of great britain and northern ireland": "GB",
};
for (const [name, iso] of Object.entries(ALIASES)) {
  NAME_TO_ISO.set(normalize(name), iso);
}

/**
 * Resolves a raw country/location string (as split out of a WHO DON title
 * by parseWhoDonTitle) to an ISO 3166-1 alpha-2 code — or null when it
 * isn't a single resolvable country. That covers two deliberately distinct
 * cases, both treated the same way (no ISO, never a guess):
 *   - A real but unlisted/unaliased name.
 *   - Something that was never one country to begin with: "Global",
 *     "Multi-country", "Multi-locations", a WHO region ("African Region
 *     (AFRO)"), or a multi-country title segment
 *     ("Democratic Republic of the Congo & Uganda").
 */
export function resolveCountryIsoFromName(raw: string): string | null {
  const normalized = normalize(raw);
  return NAME_TO_ISO.get(normalized) ?? null;
}
