import type {
  CityOutdoorSafetyItem,
  OutdoorSafetyLevel,
  HeatRiskLevel,
  GroupAdvisories,
} from "./types";

export interface RawEnvironmentInput {
  cityCode: string;
  cityName: string;
  temperature?: number | null;
  humidity?: number | null;
  aqi?: number | null;
  pm25?: number | null;
  uv?: number | null;
  dengueRisk?: "low" | "medium" | "high" | null;
  parkName?: string | null;
}

const CITY_DEFAULT_PARKS: Record<string, string> = {
  TPE: "大安森林公園（兒童遊戲區與林蔭步道）",
  NTPC: "新北大都會公園（熊猴森樂園溜滑梯）",
  TYCG: "風禾公園（50米滾輪溜滑梯與大草坪）",
  TCH: "文心森林公園（十二感官遊戲場）",
  TNN: "台南都會公園（奇美博物館旁大草坪）",
  KCG: "衛武營都會公園（林蔭綠地與親水區）",
  KEE: "潮境公園（海景步道與開闊綠地）",
  HSC: "新竹中央公園（沙坑特色遊具）",
  HSH: "竹北水圳森林公園（環湖步道）",
  MLH: "貓裏喵親子公園（章魚溜滑梯）",
  CWH: "八卦山天空步道與大佛綠地",
  NTO: "中興新村兒童公園（林蔭慢活步道）",
  YUL: "斗六膨鼠森林公園（松鼠主題遊戲場）",
  CYI: "嘉義公園（射日塔下百年林蔭）",
  CYH: "民雄金桔農莊休閒步道",
  PTH: "屏東縣民公園（殺蛇溪水岸親水步道）",
  ILA: "羅東運動公園（落羽松林與望天丘）",
  HUA: "花蓮太平洋公園（南濱段海風綠地）",
  TTT: "台東海濱公園（國際地標海風步道）",
  PEN: "澎湖觀音亭海濱遊憩園區",
  KIN: "金門莒光湖共融式公園",
  LIE: "馬祖枕戈待旦景觀步道",
};

export function computeCityOutdoorSafety(
  input: RawEnvironmentInput
): CityOutdoorSafetyItem {
  const temp = input.temperature ?? 26.5;
  const humidity = input.humidity ?? 65;
  const aqi = input.aqi ?? 45;
  const pm25 = input.pm25 ?? 12.0;
  const uv = input.uv ?? 6.0;
  const dengue = input.dengueRisk ?? "low";

  // 1. 計算中暑危險熱指數係數
  const heatIndex = Number((temp + (humidity - 50) * 0.1).toFixed(1));
  let heatRisk: HeatRiskLevel = "safe";
  if (heatIndex >= 41) heatRisk = "danger";
  else if (heatIndex >= 37) heatRisk = "warning";
  else if (heatIndex >= 32) heatRisk = "caution";

  // 2. 扣分計算綜合安全評分
  let penalties = 0;

  // 空品扣分 (最高 40)
  if (aqi > 150) penalties += 40;
  else if (aqi > 100) penalties += 25;
  else if (aqi > 50) penalties += 10;

  // 熱指數 / 低溫扣分 (最高 30)
  if (heatRisk === "danger") penalties += 30;
  else if (heatRisk === "warning") penalties += 18;
  else if (heatRisk === "caution") penalties += 8;
  if (temp <= 14) penalties += 12; // 低溫心血管風險

  // 紫外線扣分 (最高 20)
  if (uv >= 11) penalties += 20;
  else if (uv >= 8) penalties += 12;
  else if (uv >= 6) penalties += 6;

  // 蚊媒扣分 (最高 10)
  if (dengue === "high") penalties += 10;
  else if (dengue === "medium") penalties += 5;

  const overallScore = Math.max(10, Math.min(100, 100 - penalties));

  let safetyLevel: OutdoorSafetyLevel = "good";
  if (overallScore >= 85) safetyLevel = "excellent";
  else if (overallScore >= 65) safetyLevel = "good";
  else if (overallScore >= 45) safetyLevel = "caution";
  else safetyLevel = "hazardous";

  // 3. 族群專屬建議
  const runnerBestWindow =
    uv >= 8 || heatRisk === "warning" || heatRisk === "danger"
      ? "05:30 - 07:30 / 18:30 - 20:30"
      : "06:00 - 09:00 / 17:00 - 19:30";

  const runnerStatusText =
    safetyLevel === "hazardous"
      ? "空污或酷熱警戒，強烈建議改採室內跑步機訓練。"
      : heatRisk !== "safe"
      ? "高溫熱指數偏高，晨跑請嚴格避開陽光直射並每 15 分鐘補水 150ml。"
      : "氣溫與空品適宜，清晨與傍晚為黃金練跑窗口。";

  const parkRec =
    input.parkName ||
    CITY_DEFAULT_PARKS[input.cityCode] ||
    `${input.cityName}市立都會公園`;

  const uvCaution =
    uv >= 11
      ? "危險級 UV！正午 10:00~14:00 嚴格禁止無遮蔽放電，務必穿著防曬衣帽。"
      : uv >= 8
      ? "過量級 UV，戶外遊玩超過 20 分鐘易曬傷，請隨時補擦兒童防曬乳。"
      : uv >= 6
      ? "高量級 UV，林蔭遊戲區或下午 4 點後放電最舒適。"
      : "紫外線溫和，適合草坪野餐與戶外遊樂。";

  const tips: string[] = [];
  if (aqi <= 50) tips.push("空氣品質優良，盡情享受戶外運動與深呼吸。");
  else if (aqi <= 100) tips.push("空品普通，過敏體質孩童運動後建議清洗口鼻。");
  else tips.push("空氣品質達敏感橘燈，避免沿著交通繁忙幹道跑步。");

  if (heatRisk === "warning" || heatRisk === "danger") {
    tips.push("熱指數偏高，防範熱衰竭，適時補充含電解質飲品。");
  }

  const advisories: GroupAdvisories = {
    runner: {
      score: Math.max(10, overallScore - (aqi > 100 ? 15 : 0)),
      bestWindow: runnerBestWindow,
      statusText: runnerStatusText,
      tips: aqi > 50 ? "建議配速放慢，避免午後臭氧濃度尖峰時段。" : "心率與體感皆佳，適合長距離慢跑 (LSD)。",
    },
    family: {
      score: Math.max(10, overallScore - (uv > 8 ? 10 : 0)),
      statusText: uv >= 8 ? "午後陽光猛烈，建議下午 16:00 後再帶孩子出門放電。" : "氣候舒爽，適合全家出遊放電！",
      parkRecommendation: parkRec,
      uvCaution,
      diseaseNote: "公共遊具觸碰後請確實洗手，防範腸病毒與流感傳播。",
    },
    elderly: {
      score: Math.max(10, overallScore - (temp <= 16 || heatRisk !== "safe" ? 15 : 0)),
      statusText:
        temp <= 16
          ? "清晨溫差大，長輩出門散步務必做好頭頸部保暖，防範心血管突發狀況。"
          : heatRisk !== "safe"
          ? "注意高溫脫水，散步時請隨身攜帶溫開水並多於樹蔭下歇息。"
          : "平順舒適，早晨沿著公園步道散步 30 分鐘有益心肺機能。",
      heatIndexWarning: `目前中暑危險係數為 ${heatIndex}（${heatRisk === "safe" ? "安全" : heatRisk === "caution" ? "注意" : "警戒"}）`,
      cardioCaution: temp <= 16 ? "早晚溫差超過 8°C，出入室內外請放慢動作。" : "心血管負荷正常，適量伸展運動。",
    },
    mosquito: {
      riskText: dengue === "high" ? "登革熱警戒熱區，戶外活動務必穿著淺色長袖長褲。" : "病媒蚊風險平穩，水溝積水處請避免久留。",
      repellentAdvice: "建議挑選衛福部核可之敵避 (DEET) 或派卡瑞丁 (Picaridin) 防蚊液，防護更持久。",
    },
  };

  return {
    cityCode: input.cityCode,
    cityName: input.cityName,
    overallScore,
    safetyLevel,
    heatRiskLevel: heatRisk,
    heatIndex,
    aqiValue: aqi,
    pm25Value: pm25,
    uvIndex: uv,
    temperature: temp,
    humidity,
    advisories,
    tips,
    updatedAt: new Date().toISOString(),
  };
}
