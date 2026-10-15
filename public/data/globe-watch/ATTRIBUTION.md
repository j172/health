# `ne-110m-admin0-countries-twn-pov.geojson`

Source: [Natural Earth](https://www.naturalearthdata.com/) — Admin 0 – Countries,
1:110m scale, pulled from the project's own public GitHub mirror
(`nvkelso/natural-earth-vector`, `geojson/ne_110m_admin_0_countries.geojson`) on
2026-10-14.

License: **Public domain.** Per Natural Earth's
[Terms of Use](https://www.naturalearthdata.com/about/terms-of-use/): "No
permission is needed to use Natural Earth. Crediting the authors is not
required, but is appreciated."

## Why this file is "Taiwan point-of-view" (台灣觀點版)

The raw Natural Earth dataset already plots Taiwan (`ADM0_A3: "TWN"`) as its
own, fully independent feature/geometry from mainland China
(`ADM0_A3: "CHN"`) — the same shape this project renders in
`GlobeWatchEpidemicsGlobe.tsx` for the 國際疫情 (epidemics) item's
country-level choropleth (issue #589, parent #583). The dataset additionally
carries an explicit `ADM0_A3_TW` column (Taiwan's own point of view on every
other country's boundary), confirming "TWN as its own country" is the
upstream data's documented Taiwan-perspective variant, not something altered
here.

## Trimming

The upstream file ships ~90 properties per feature (population, GDP, 8
different map-coloring schemes, per-country disputed-boundary point-of-view
codes, etc.) — none of which this feature reads. It's been stripped down to
exactly the 3 properties `GlobeWatchEpidemicsGlobe.tsx` actually joins
against or displays:

- `ISO_A2_EH` — ISO 3166-1 alpha-2 code (Taiwan-friendly variant: `"TW"`,
  not `"CN-TW"`). This is the join key against `cdc_travel_alerts.iso`.
- `NAME` — short English name, used only as a last-resort label when the
  `EPIDEMIC_COUNTRY_NAMES` dictionary (`lib/tools/globeWatch/
  epidemicsCountryNames.ts`) has no entry for a code.
- `ADM0_A3` — kept for debugging/attribution only.

This cut the file from ~820 KB to ~250 KB. It is fetched at runtime only by
the 國際疫情 item (`GlobeWatchEpidemicsGlobe.tsx`'s own `fetch()`, never a
static `import`), so it never ships in `global-watch`'s shared JS bundle or
affects any other item's load size.

At 1:110m scale several small countries/territories that do appear in
`cdc_travel_alerts` (e.g. Singapore, Hong Kong SAR, the Maldives, Seychelles,
Kiribati, French Guiana, Réunion, Mayotte) are too small to carry their own
polygon. Rows whose ISO code has no matching boundary feature in this file
fall back to being plotted as a point — the same fallback used for rows with
no ISO at all (see `buildEpidemicsGlobeData` in
`lib/tools/globeWatch/epidemicsTransform.ts`).
