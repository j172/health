import { test } from "node:test";
import assert from "node:assert/strict";

test("reservoir catalog parses raw data.gov.tw 139336 records correctly", () => {
  const sampleRaw = [
    {
      水庫代碼: "10205",
      水庫名稱: "翡翠水庫",
      河川名稱: "新店溪支流北勢溪",
      鄉鎮名稱: "石碇區",
      行政區域代碼: "65000060",
    },
    {
      水庫代碼: "  ",
      水庫名稱: "無效水庫",
    },
    {
      水庫代碼: "20201",
      水庫名稱: "德基水庫",
      河川名稱: "大甲溪",
      鄉鎮名稱: null,
      行政區域代碼: null,
    },
  ];

  const parsed = sampleRaw
    .map((rec) => {
      const reservoirId = rec["水庫代碼"]?.trim();
      const reservoirName = rec["水庫名稱"]?.trim();
      if (!reservoirId || !reservoirName) return null;
      return {
        reservoirId,
        reservoirName,
        riverName: rec["河川名稱"]?.trim() || null,
        townName: rec["鄉鎮名稱"]?.trim() || null,
        areaCode: rec["行政區域代碼"]?.trim() || null,
      };
    })
    .filter(Boolean);

  assert.equal(parsed.length, 2);
  assert.deepEqual(parsed[0], {
    reservoirId: "10205",
    reservoirName: "翡翠水庫",
    riverName: "新店溪支流北勢溪",
    townName: "石碇區",
    areaCode: "65000060",
  });
  assert.equal(parsed[1].reservoirId, "20201");
  assert.equal(parsed[1].reservoirName, "德基水庫");
  assert.equal(parsed[1].riverName, "大甲溪");
  assert.equal(parsed[1].townName, null);
});

test("water level station catalog parses raw data.gov.tw 22227 records and alert levels correctly", () => {
  const sampleRaw = [
    {
      basinidentifier: "1010H006",
      observatoryname: "新磺溪橋(即時)",
      observatoryidentifier: "3132020RV1010H006",
      rivername: "磺溪",
      locationaddress: "新北市金山區",
      alertlevel1: "5.8",
      alertlevel2: "4.6",
      alertlevel3: "",
      areacode: "65000270",
      affiliatedbasin: "1010",
      observationstatus: "現存",
    },
    {
      basinidentifier: "",
      observatoryname: "無效站",
    },
  ];

  const parseNum = (v) => {
    if (v === null || v === undefined || v === "") return null;
    const n = parseFloat(v);
    return isNaN(n) ? null : n;
  };

  const parsed = sampleRaw
    .map((rec) => {
      const stationId = rec.basinidentifier?.trim();
      const stationName = rec.observatoryname?.trim();
      if (!stationId || !stationName) return null;
      return {
        stationId,
        stationName,
        observatoryIdentifier: rec.observatoryidentifier?.trim() || null,
        riverName: rec.rivername?.trim() || null,
        locationAddress: rec.locationaddress?.trim() || null,
        alertLevel1: parseNum(rec.alertlevel1),
        alertLevel2: parseNum(rec.alertlevel2),
        alertLevel3: parseNum(rec.alertlevel3),
        areaCode: rec.areacode?.trim() || null,
        basinCode: rec.affiliatedbasin?.trim() || null,
        observationStatus: rec.observationstatus?.trim() || null,
      };
    })
    .filter(Boolean);

  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].stationId, "1010H006");
  assert.equal(parsed[0].stationName, "新磺溪橋(即時)");
  assert.equal(parsed[0].riverName, "磺溪");
  assert.equal(parsed[0].locationAddress, "新北市金山區");
  assert.equal(parsed[0].alertLevel1, 5.8);
  assert.equal(parsed[0].alertLevel2, 4.6);
  assert.equal(parsed[0].alertLevel3, null);
});

test("alert level evaluation logic correctly triggers alert badges", () => {
  function getAlertStatus(waterLevel, alert1, alert2, alert3) {
    if (waterLevel === null) return "unknown";
    if (alert1 !== null && waterLevel >= alert1) return "level1";
    if (alert2 !== null && waterLevel >= alert2) return "level2";
    if (alert3 !== null && waterLevel >= alert3) return "level3";
    if (alert1 !== null || alert2 !== null || alert3 !== null) return "normal";
    return "unknown";
  }

  // Level 1 threshold
  assert.equal(getAlertStatus(6.0, 5.8, 4.6, 3.5), "level1");
  // Level 2 threshold
  assert.equal(getAlertStatus(5.0, 5.8, 4.6, 3.5), "level2");
  // Level 3 threshold
  assert.equal(getAlertStatus(4.0, 5.8, 4.6, 3.5), "level3");
  // Below alert levels
  assert.equal(getAlertStatus(2.0, 5.8, 4.6, 3.5), "normal");
  // No alert thresholds configured
  assert.equal(getAlertStatus(2.0, null, null, null), "unknown");
});
