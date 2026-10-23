import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { registerHooks } from "node:module";

const REPO_ROOT = new URL("../../../../", import.meta.url);

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return { url: "data:text/javascript,", shortCircuit: true };
    }
    let target = specifier;
    let parentURL = context.parentURL;
    if (specifier.startsWith("@/")) {
      target = `./${specifier.slice(2)}`;
      parentURL = REPO_ROOT.href;
    }
    if (target.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(target)) {
      for (const extension of [".ts", ".tsx", ".mjs", ".js"]) {
        const candidate = new URL(target + extension, parentURL);
        if (existsSync(fileURLToPath(candidate))) {
          return nextResolve(candidate.href, context);
        }
      }
    }
    return nextResolve(target, context);
  },
});

const { parsePostpartumCareFacilities } = await import("./postpartumCare.ts");

test("parsePostpartumCareFacilities strips BOM and filters only postpartum facilities", () => {
  const sampleCsvWithBom =
    "\uFEFF" +
    "序號,機構代碼,縣市別,機構名稱,一般護理之家-開放床數,產後護理床-開放床數,護理類-嬰兒床-開放床數,機構電話,機構類別,地址,評鑑結果,合格效期,定位地址,WGS84經度,WGS84緯度\n" +
    "1,7111070517,基隆市,衛生福利部基隆醫院附設護理之家,21,0,0,24292525,一般護理之家,基隆市信義區信二路二六八號,合格,118年12月31日,基隆市信義區仁壽里18鄰信二路268號,121.748322,25.130455\n" +
    "2,7311030517,基隆市,煤礦業基金會居家護理,0,0,0,02-24579101,居家護理所,基隆市暖暖區源遠路29號,合格,117年12月31日,基隆市暖暖區源遠路29號,121.733656,25.107398\n" +
    "3,7411041101,基隆市,美好玥灣產後護理之家,0,18,19,02-24280000,產後護理之家,基隆市仁愛區劉銘傳路1之8號9、10樓,合格,117年12月31日,基隆市仁愛區水錦里16鄰劉銘傳路1之8號,121.751037,25.127872\n" +
    "4,7401011388,臺北市,晶英產後護理之家,0,20,22,０２-２７４５８８８０,產後護理之家,臺北市松山區健康路152號,合格,118年12月31日,臺北市松山區安平里24鄰健康路500號,121.568569,25.054281\n" +
    "5,,臺北市,無代碼產後護理之家,0,10,10,02-12345678,產後護理之家,臺北市大安區無名路1號,合格,118年,臺北市大安區無名路1號,121.55,25.03\n";

  const results = parsePostpartumCareFacilities(sampleCsvWithBom);

  // 只有第 3 筆和第 4 筆是合法的產後護理機構
  assert.equal(results.length, 2);

  // 驗證第 1 筆產後護理機構（美好玥灣）
  const r1 = results[0];
  assert.equal(r1.facilityType, "postpartum_care");
  assert.equal(r1.sourceId, "7411041101");
  assert.equal(r1.name, "美好玥灣產後護理之家");
  assert.equal(r1.city, "基隆市");
  assert.equal(r1.address, "基隆市仁愛區水錦里16鄰劉銘傳路1之8號"); // 定位地址優先
  assert.equal(r1.phone, "02-24280000");
  assert.equal(r1.category, "合格");
  assert.equal(r1.serviceItems, "產婦床 18 床 · 嬰兒床 19 床");
  assert.equal(r1.lat, 25.127872);
  assert.equal(r1.lng, 121.751037);
  assert.deepEqual(r1.extraJson, {
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
  assert.equal(r2.extraJson.postpartumBeds, 20);
  assert.equal(r2.extraJson.babyBeds, 22);
});
