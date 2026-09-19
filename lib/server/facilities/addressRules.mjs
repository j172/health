/**
 * lib/server/facilities/addressRules.mjs
 *
 * Core address normalization and geocoding eligibility rules.
 */

export function normalizeFacilityAddress(raw) {
  if (!raw) return "";
  let s = String(raw).trim();

  // Full-width space to half-width
  s = s.replace(/　/g, " ");

  // Full-width digits ０-９ to half-width 0-9
  s = s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xff10 + 0x30));

  // Multi-address split on comma or 及 - keep first address
  s = s.split(/[,，]|及/)[0].trim();

  // Strip parenthetical notes like (1樓), （代表）, 【舊址】, [備註]
  s = s.replace(/[（(【\[][^）)】\]]*[）)】\]]/g, " ");

  // Strip quotes to avoid CSV delimiter collisions
  s = s.replace(/["']/g, "");

  // Deduplicate repeated county/district prefixes
  s = dedupeAddressPrefix(s.trim());

  // Collapse whitespaces and strip dangling punctuation
  s = s.replace(/\s+/g, " ").trim();
  s = s.replace(/^[，,、\-_]+|[，,、\-_]+$/g, "").trim();

  return s;
}

export function dedupeAddressPrefix(address) {
  // Exact whole-prefix doubling (county+district repeated in full).
  for (let len = 12; len >= 4; len--) {
    if (address.length >= len * 2 && address.slice(0, len) === address.slice(len, len * 2)) {
      return address.slice(len);
    }
  }
  // Shorter unit duplicated just past the start (e.g. 臺中市中市北屯區)
  for (let len = 2; len <= 4; len++) {
    for (let start = 0; start <= 4; start++) {
      const unit = address.slice(start, start + len);
      if (unit.length === len && unit === address.slice(start + len, start + len * 2)) {
        return address.slice(0, start + len) + address.slice(start + len * 2);
      }
    }
  }
  return address;
}

// Whitelist of authoritative GPS sources from government open data
export const OFFICIAL_GPS_SOURCES = new Set([
  // MOHW & NHI
  "nhi_hospital",
  "nhi_pharmacy",
  "mohw_ltc_contracted",
  "mohw_ltc_full",
  "mohw_hpa_facility",
  "nhi_home_healthcare",
  // MOE
  "moe_kindergarten",
  // MOENV
  "moenv_public_toilet",
  "moenv_cool_spot",
  "moenv_green_restaurant",
  "moenv_green_hotel",
]);

export function shouldResetCoordinates(sourceKey, lat) {
  // If it doesn't have coordinates, it MUST be re-geocoded regardless of source
  if (lat === null || lat === undefined || lat === "") {
    return true;
  }
  // If it's an official GPS source, NEVER reset its coordinates
  if (OFFICIAL_GPS_SOURCES.has(sourceKey)) {
    return false;
  }
  // Pure address / estimated sources get reset for TGOS re-geocoding
  return true;
}
