import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { PoolConnection, ResultSetHeader } from "mysql2/promise";
import { utcNowSql } from "@/lib/server/db/mysql";

const MAP_UPLOADS_DIR = path.join(process.cwd(), "public", "uploads", "maps");

/**
 * Ensures map upload directory exists.
 */
async function ensureMapDir(): Promise<void> {
  try {
    await fs.mkdir(MAP_UPLOADS_DIR, { recursive: true });
  } catch {
    // Ignore already exists
  }
}

/**
 * Generates an SVG static map illustration with high-contrast cartography styling,
 * location pin, coordinate grid, and location banner.
 */
export function generateStaticMapSvg(lat: number, lng: number, locationName: string): string {
  const safeName = locationName
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  const latStr = `${lat.toFixed(4)}°N`;
  const lngStr = `${lng.toFixed(4)}°E`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450" width="800" height="450">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a" />
      <stop offset="50%" stop-color="#1e293b" />
      <stop offset="100%" stop-color="#0f172a" />
    </linearGradient>
    <linearGradient id="pinGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#10b981" />
      <stop offset="100%" stop-color="#059669" />
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="6" stdDeviation="8" flood-color="#000" flood-opacity="0.5"/>
    </filter>
    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
      <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#334155" stroke-width="0.75" stroke-opacity="0.4"/>
    </pattern>
  </defs>

  <!-- Background Base -->
  <rect width="800" height="450" fill="url(#bg)" />
  <rect width="800" height="450" fill="url(#grid)" />

  <!-- Road & Topo curves decoration -->
  <path d="M -50 280 Q 200 150 400 225 T 850 180" fill="none" stroke="#3b82f6" stroke-width="3" stroke-opacity="0.3" />
  <path d="M -20 380 Q 300 280 550 350 T 820 310" fill="none" stroke="#059669" stroke-width="2" stroke-opacity="0.25" stroke-dasharray="6,6" />
  <path d="M 150 -20 Q 250 200 400 225 T 650 480" fill="none" stroke="#64748b" stroke-width="2" stroke-opacity="0.35" />
  <path d="M 600 -20 Q 500 200 400 225 T 250 480" fill="none" stroke="#475569" stroke-width="1.5" stroke-opacity="0.3" />

  <!-- Radar Pulse Rings -->
  <circle cx="400" cy="225" r="90" fill="none" stroke="#10b981" stroke-width="1.5" stroke-opacity="0.2" stroke-dasharray="4,4"/>
  <circle cx="400" cy="225" r="50" fill="none" stroke="#10b981" stroke-width="1.5" stroke-opacity="0.4" />
  <circle cx="400" cy="225" r="16" fill="#10b981" fill-opacity="0.15" />

  <!-- Location Pin (centered at 400, 225) -->
  <g filter="url(#shadow)" transform="translate(400, 225)">
    <path d="M 0 0 C -16 -24 -24 -40 -24 -56 A 24 24 0 0 1 24 -56 C 24 -40 16 -24 0 0 Z" fill="url(#pinGrad)" />
    <circle cx="0" cy="-56" r="9" fill="#ffffff" />
    <!-- Pulse dot -->
    <circle cx="0" cy="0" r="3.5" fill="#34d399" />
  </g>

  <!-- Location Tag Banner (Top Left) -->
  <g filter="url(#shadow)" transform="translate(36, 36)">
    <rect width="320" height="76" rx="14" fill="#0f172acc" stroke="#334155" stroke-width="1.5" />
    <circle cx="32" cy="38" r="14" fill="#065f46" />
    <text x="32" y="44" fill="#34d399" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="16" font-weight="bold" text-anchor="middle">📍</text>
    <text x="58" y="34" fill="#f8fafc" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="17" font-weight="bold">${safeName}</text>
    <text x="58" y="55" fill="#94a3b8" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="12" font-weight="500">${latStr}, ${lngStr}</text>
  </g>

  <!-- Bottom Brand Watermark -->
  <g transform="translate(764, 414)">
    <text x="0" y="0" fill="#64748b" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="12" font-weight="600" text-anchor="end">OpenStreetMap · j172tw Healthz</text>
  </g>
</svg>`;
}

/**
 * Creates and writes a static map image to disk, then records it in news_card_images.
 */
export async function assignStaticMapImage(
  conn: PoolConnection,
  newsId: number,
  lat: number,
  lng: number,
  locationName: string,
): Promise<boolean> {
  await ensureMapDir();

  const svgContent = generateStaticMapSvg(lat, lng, locationName);
  const fileName = `map_${newsId}_${lat.toFixed(4)}_${lng.toFixed(4)}.svg`;
  const relativePath = `/uploads/maps/${fileName}`;
  const absolutePath = path.join(MAP_UPLOADS_DIR, fileName);

  await fs.writeFile(absolutePath, svgContent, "utf-8");

  const sha256 = crypto.createHash("sha256").update(svgContent).digest("hex");
  const now = utcNowSql();
  const providerImageId = `map_${lat.toFixed(4)}_${lng.toFixed(4)}`;
  const sourcePageUrl = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=15/${lat}/${lng}`;

  const [insertResult] = await conn.execute<ResultSetHeader>(
    `
    INSERT IGNORE INTO news_card_images (
      news_item_id, provider, provider_image_id, pixabay_id, local_path, source_page_url,
      contributor_name, content_sha256, width, height, created_at, updated_at
    )
    SELECT ?, 'static_map', ?, NULL, ?, ?, 'OpenStreetMap Contributors', ?, 800, 450, ?, ?
    WHERE NOT EXISTS (
      SELECT 1 FROM news_card_images c WHERE c.news_item_id = ?
    )
    `,
    [newsId, providerImageId, relativePath, sourcePageUrl, sha256, now, now, newsId],
  );

  return insertResult.affectedRows === 1;
}
