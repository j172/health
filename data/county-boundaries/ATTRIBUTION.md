# `tw-counties.geojson`

Source: [`g0v/twgeojson`](https://github.com/g0v/twgeojson) — `json/twCounty2010merge.topo.json`
(TopoJSON), pulled from the project's `master` branch on 2026-10-22, then converted to GeoJSON
with `topojson-client`'s `topo2geo` (a one-off build step, not a runtime dependency of this repo).

The upstream file is itself a simplified derivative of 內政部 (Ministry of the Interior,
via `iot.gov.tw`) county/city boundary survey data — the same government source family as
`data.gov.tw`'s 直轄市、縣(市)界線 dataset — already merged down to the 22 counties/cities that
have existed since the 2010 縣市合併 (`twCounty2010merge`, per the repo's own README TODO list,
which lists "merge subsumed polygons in the 2010 city merge" as the point of this build target).

License: **CC0 1.0 Universal (public domain).** Per the repo's README: "To the extent possible
under law, Chia-liang Kao has waived all copyright and related or neighboring rights to
twgeojson." (<http://creativecommons.org/publicdomain/zero/1.0>)

## Why this file, not a government-direct download

`data.gov.tw`'s own 直轄市、縣(市)界線(TWD97經緯度) dataset (id 7442, 政府資料開放授權條款第1版)
only offers Shapefile/zip downloads via `tgos.tw`, not GeoJSON — converting that would need a
GIS toolchain (GDAL/ogr2ogr or similar) this repo doesn't otherwise depend on. `g0v/twgeojson`
packages the same government-sourced boundaries as ready-to-use (Topo)GeoJSON, is published
public domain, and is the same trust ecosystem this repo already draws from for other
g0v-maintained data (see `docs/2.0/opendata-expansion-research.md`'s §4 g0v survey).

## Used for

`lib/server/facilities/countyGeo.ts`'s `resolveCountyByPoint(lat, lng)` — exact point-in-polygon
county resolution, replacing the old loose-bounding-box nearest-center heuristic in
`lib/server/facilities/countyBounds.ts`'s `resolveNearestCounty`, which had New Taipei City
visitors near the border it shares with (and wraps around) Taipei City misclassified as being in
Taipei City (confirmed for 新莊區, a New Taipei district fully surrounded by Taipei's bounding
box) — see issue filed alongside this file's addition.

## Trimming

The converted GeoJSON carried a `COUNTYSN` id and a duplicate `name`/`COUNTYNAME` property pair
per feature; none of that is used here. Each feature's properties were reduced to a single
`name` field, normalized to this repo's canonical county-name spelling (the 臺-prefixed variant
`lib/server/facilities/countyBounds.ts`'s `BOUNDS` already uses, and `桃園市` — its name since the
2014 直轄市 upgrade — in place of the source's pre-2014 `桃園縣`; the upgrade didn't change the
boundary geometry, only the name/status). No town/village-level detail is included — only the
22 county/city-level polygons. This cut the file from the source TopoJSON's raw size down to
~113 KB as GeoJSON.
