export interface MapNavigationOptions {
  name: string;
  address?: string | null;
  lat?: number | string | null;
  lng?: number | string | null;
}

/**
 * Builds a standardized Google Maps Directions (Turn-by-turn Navigation) URL.
 * Prioritizes address + POI name for accurate landmark display, falling back
 * to exact GPS coordinates or POI name alone.
 */
export function buildGoogleMapsDirUrl({
  name,
  address,
  lat,
  lng,
}: MapNavigationOptions): string {
  const cleanName = (name || "").trim();
  const cleanAddress = (address || "").trim();
  const numLat = lat != null ? Number(lat) : NaN;
  const numLng = lng != null ? Number(lng) : NaN;
  const hasCoords =
    !Number.isNaN(numLat) && !Number.isNaN(numLng) && numLat !== 0 && numLng !== 0;

  let destination = "";
  if (cleanAddress) {
    destination = cleanName ? `${cleanAddress} ${cleanName}` : cleanAddress;
  } else if (hasCoords) {
    destination = `${numLat},${numLng}`;
  } else {
    destination = cleanName;
  }

  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}

/**
 * Returns the multilingual navigation button label.
 */
export function getNavigationButtonLabel(locale?: string): string {
  switch (locale) {
    case "en":
      return "🗺️ Google Maps Navigation";
    case "ja":
      return "🗺️ Google マップでナビ";
    case "ko":
      return "🗺️ Google 지도 길찾기";
    case "zh-TW":
    default:
      return "🗺️ Google 地圖導航";
  }
}
