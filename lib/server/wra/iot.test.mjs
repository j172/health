import { test } from "node:test";
import assert from "node:assert/strict";

// Mirrors the parsing logic in fetchDamStructureStations.ts / fetchGroundwaterLevelStations.ts /
// fetchInundationRegions.ts (this repo's tests run plain .mjs via `node --test`, no TS
// compilation step — see the sibling catalogs.test.mjs for the same convention). Fixtures below
// are trimmed real payloads captured live from iot.wra.gov.tw on 2026-09-15 (issue #270).

const cleanStr = (v) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
};

const parseNum = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const toMysqlDatetime = (raw) => {
  const s = String(raw ?? "").trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})/);
  return m ? `${m[1]} ${m[2]}` : null;
};

function parseDamStructureStations(rows) {
  return rows
    .map((rec) => {
      const stationId = cleanStr(rec.StationId);
      const name = cleanStr(rec.Name);
      const lat = parseNum(rec.Latitude);
      const lng = parseNum(rec.Longtiude);
      if (!stationId || !name || lat === null || lng === null) return null;

      const rawMeasurements = Array.isArray(rec.Measurements) ? rec.Measurements : [];
      const measurements = rawMeasurements.map((m) => ({
        name: cleanStr(m.Name) ?? "",
        fullName: cleanStr(m.FullName),
        unit: cleanStr(m.SIUnit),
        value: parseNum(m.Value),
        timestamp: toMysqlDatetime(m.TimeStamp),
      }));

      const recordedAt = measurements.reduce((latest, m) => {
        if (!m.timestamp) return latest;
        return !latest || m.timestamp > latest ? m.timestamp : latest;
      }, null);

      return {
        stationId,
        iowStationId: cleanStr(rec.IoWStationId),
        name,
        countyName: cleanStr(rec.CountyName),
        townName: cleanStr(rec.TownName),
        adminName: cleanStr(rec.AdminName),
        lat,
        lng,
        measurements,
        recordedAt,
      };
    })
    .filter(Boolean);
}

function parseGroundwaterStations(rows) {
  return rows
    .map((rec) => {
      const stationId = cleanStr(rec.StationId);
      const name = cleanStr(rec.Name);
      const lat = parseNum(rec.Latitude);
      const lng = parseNum(rec.Longtiude);
      if (!stationId || !name || lat === null || lng === null) return null;

      const rawMeasurements = Array.isArray(rec.Measurements) ? rec.Measurements : [];
      const measurements = rawMeasurements.map((m) => ({
        name: cleanStr(m.Name) ?? "",
        fullName: cleanStr(m.FullName),
        unit: cleanStr(m.SIUnit),
        value: parseNum(m.Value),
        timestamp: toMysqlDatetime(m.TimeStamp),
      }));

      const primary =
        measurements.find((m) => m.name === "地下水位" || (m.fullName ?? "").includes("地下水位")) ??
        measurements[0] ??
        null;

      return {
        stationId,
        name,
        countyName: cleanStr(rec.CountyName),
        townName: cleanStr(rec.TownName),
        lat,
        lng,
        waterLevelM: primary?.value ?? null,
        recordedAt: primary?.timestamp ?? null,
      };
    })
    .filter(Boolean);
}

const REGION_LABELS = {
  changhua: "彰化縣",
  kaohsiung: "高雄市",
  yunlin: "雲林縣",
};

function parseInundationRegions(codes) {
  return codes.filter((c) => typeof c === "string").map((code) => ({ code, label: REGION_LABELS[code] ?? code }));
}

test("damstructure/stations parses a real live-captured record (白布帆堤防) with multiple axis-tilt measurements", () => {
  const sampleRaw = [
    {
      IoWStationId: "2114b6bb-eb66-4487-a91d-48b1bcb893ba",
      StationId: "A130613RV017",
      Name: "白布帆堤防",
      CountyCode: "10005",
      CountyName: "臺灣省苗栗縣",
      TownCode: "10005070",
      TownName: "卓蘭鎮",
      Latitude: 24.2953,
      Longtiude: 120.87305,
      AdminName: "經濟部水利署第三河川局",
      Measurements: [
        {
          IoWPhysicalQuantityId: "38137a39-6247-4199-8f6c-8d6f5d06d29a",
          TimeStamp: "2026-09-14T23:07:55+08:00",
          Name: "X軸角度",
          FullName: "白布帆堤防1X軸角度",
          SIUnit: "度",
          Value: 0.0393,
        },
        {
          IoWPhysicalQuantityId: "4ee507cb-1d81-45ef-8438-c4a83d3b92c3",
          TimeStamp: "2026-09-14T23:22:41+08:00",
          Name: "Z軸角度",
          FullName: "白布帆堤防2Z軸角度",
          SIUnit: "度",
          Value: -0.018,
        },
      ],
    },
    { StationId: "", Name: "無效站", Latitude: 24, Longtiude: 121, Measurements: [] },
  ];

  const parsed = parseDamStructureStations(sampleRaw);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].stationId, "A130613RV017");
  assert.equal(parsed[0].name, "白布帆堤防");
  assert.equal(parsed[0].countyName, "臺灣省苗栗縣");
  assert.equal(parsed[0].lat, 24.2953);
  assert.equal(parsed[0].lng, 120.87305);
  assert.equal(parsed[0].measurements.length, 2);
  // recordedAt picks the MAX timestamp across measurements, not the first one.
  assert.equal(parsed[0].recordedAt, "2026-09-14 23:22:41");
});

test("groundwaterlevel/stations parses a real live-captured record (金門高中) and flattens 地下水位 to waterLevelM", () => {
  const sampleRaw = [
    {
      IoWStationId: "774cc41f-8fe9-4a67-a5a1-45cb67fc4930",
      StationId: "A130600GW0703",
      Name: "金門高中",
      CountyCode: "09020",
      CountyName: "福建省金門縣",
      TownCode: "09020010",
      TownName: "金城鎮",
      Latitude: 24.435572,
      Longtiude: 118.31309,
      AdminName: "經濟部水利署水文技術組",
      Measurements: [
        {
          IoWPhysicalQuantityId: "9e174a7c-00a8-4f13-893a-390e64029bb9",
          TimeStamp: "2026-09-15T02:40:00+08:00",
          Name: "地下水位",
          FullName: "即時地下水位-金門高中",
          SIUnit: "m",
          Value: 3.997,
        },
      ],
    },
    { StationId: "", Name: "無效站", Latitude: 24, Longtiude: 121, Measurements: [] },
  ];

  const parsed = parseGroundwaterStations(sampleRaw);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].stationId, "A130600GW0703");
  assert.equal(parsed[0].name, "金門高中");
  assert.equal(parsed[0].waterLevelM, 3.997);
  assert.equal(parsed[0].recordedAt, "2026-09-15 02:40:00");
});

test("rasterMap/inundation/regions maps county-code slugs to Chinese labels, falling back to the raw slug", () => {
  const parsed = parseInundationRegions(["changhua", "kaohsiung", "yunlin", "someNewCounty", 42]);
  assert.deepEqual(parsed, [
    { code: "changhua", label: "彰化縣" },
    { code: "kaohsiung", label: "高雄市" },
    { code: "yunlin", label: "雲林縣" },
    { code: "someNewCounty", label: "someNewCounty" },
  ]);
});

test("toMysqlDatetime strips the +08:00 offset from iot.wra.gov.tw's ISO timestamps", () => {
  assert.equal(toMysqlDatetime("2026-09-14T23:07:55+08:00"), "2026-09-14 23:07:55");
  assert.equal(toMysqlDatetime(""), null);
  assert.equal(toMysqlDatetime(undefined), null);
});
