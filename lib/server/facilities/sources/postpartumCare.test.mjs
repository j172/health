import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePostpartumCareFacilities } from "./postpartumCare.ts";

const CSV_FIXTURE = `\uFEFF"機構代碼","縣市別","機構名稱","一般護理之家-開放床數","產後護理床-開放床數","護理類-嬰兒床-開放床數","機構電話","機構類別","地址","評鑑結果","合格效期","定位地址","WGS84經度","WGS84緯度"
"7401011111","臺北市","某某一般護理之家","49","0","0","02-23456789","一般護理之家","臺北市中正區某路1號","合格","116年12月31日","臺北市中正區某路1號","121.512345","25.034567"
"7401012222","新北市","某某居家護理所","0","0","0","02-87654321","居家護理所","新北市板橋區某路2號","尚未評鑑","","新北市板橋區某路2號","121.467890","25.012345"
"7411041101","基隆市","美好玥灣產後護理之家","0","18","19","02-24280000","產後護理之家","基隆市仁愛區劉銘傳路1之8號9、10樓","合格","117年12月31日","基隆市仁愛區水錦里16鄰劉銘傳路1之8號","121.751037","25.127872"
"7401011388","臺北市","晶英產後護理之家","0","20","22","０２－２７４５８８８０","產後護理之家","臺北市松山區健康路156號6樓","尚未評鑑","","臺北市松山區自強里13鄰健康路156號6樓","121.557451","25.051939"
`;

test("parsePostpartumCareFacilities strips BOM and filters only postpartum facilities", () => {
  const results = parsePostpartumCareFacilities(CSV_FIXTURE);

  // 只有第 3 筆和第 4 筆是合法的產後護理機構
  assert.equal(results.length, 2);

  // 驗證第 1 筆產後護理機構（美好玥灣）
  const r1 = results[0];
  assert.equal(r1.facilityType, "postpartum_care");
  assert.equal(r1.sourceId, "7411041101");
  assert.equal(r1.name, "美好玥灣產後護理之家");
  assert.equal(r1.address, "基隆市仁愛區水錦里16鄰劉銘傳路1之8號"); // 定位地址優先
  assert.equal(r1.phone, "02-24280000");
  assert.equal(r1.serviceItem, "產婦床 18 床 · 嬰兒床 19 床");
  assert.equal(r1.lat, 25.127872);
  assert.equal(r1.lng, 121.751037);
  assert.deepEqual(r1.extra, {
    category: "合格",
    city: "基隆市",
    postpartumBeds: 18,
    babyBeds: 19,
    evaluationResult: "合格",
    evaluationExpiry: "117年12月31日",
    registeredAddress: "基隆市仁愛區劉銘傳路1之8號9、10樓",
  });

  // 驗證第 2 筆（晶英，包含全形電話轉半形）
  const r2 = results[1];
  assert.equal(r2.sourceId, "7401011388");
  assert.equal(r2.phone, "02-27458880"); // 全形電話正確轉換
  assert.equal(r2.extra.postpartumBeds, 20);
  assert.equal(r2.extra.babyBeds, 22);
});
