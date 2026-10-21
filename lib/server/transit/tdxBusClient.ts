/**
 * TDX 公車縣市列舉，涵蓋全台 22 縣市。
 *
 * issue #730：每日公車低地板比率同步（Bus/Vehicle + Bus/Schedule，fetchAllTdxBusRoutes）已移除，
 * 這個檔案不再呼叫 TDX，只剩縣市清單，給手動 facilities-sync 的 tdx_parking／tdx_aps 兩個來源
 * 共用同一組 22 縣市的 tdxName（見 lib/server/facilities/sources/tdxParking.ts、tdxAudibleSignals.ts）。
 * 其中 7 個（Keelung/Nantou/Yilan/Hualien/Penghu/Kinmen/Lienchiang）遵循 TDX 標準縣市命名
 * 慣例；各來源對單一縣市的失敗各自隔離，列舉值有誤只會讓該縣市回報錯誤，不影響其餘 21 個。
 */
export const TDX_BUS_CITIES: Record<string, { tdxName: string; label: string }> = {
  TPE: { tdxName: "Taipei", label: "臺北市" },
  NTPC: { tdxName: "NewTaipei", label: "新北市" },
  KEE: { tdxName: "Keelung", label: "基隆市" },
  TYCG: { tdxName: "Taoyuan", label: "桃園市" },
  HSC: { tdxName: "Hsinchu", label: "新竹市" },
  HCH: { tdxName: "HsinchuCounty", label: "新竹縣" },
  MAL: { tdxName: "MiaoliCounty", label: "苗栗縣" },
  TXG: { tdxName: "Taichung", label: "臺中市" },
  CHA: { tdxName: "ChanghuaCounty", label: "彰化縣" },
  NTO: { tdxName: "NantouCounty", label: "南投縣" },
  YUN: { tdxName: "YunlinCounty", label: "雲林縣" },
  CYI: { tdxName: "Chiayi", label: "嘉義市" },
  CYQ: { tdxName: "ChiayiCounty", label: "嘉義縣" },
  TNN: { tdxName: "Tainan", label: "臺南市" },
  KHH: { tdxName: "Kaohsiung", label: "高雄市" },
  PTT: { tdxName: "PingtungCounty", label: "屏東縣" },
  ILN: { tdxName: "YilanCounty", label: "宜蘭縣" },
  HUA: { tdxName: "HualienCounty", label: "花蓮縣" },
  TTT: { tdxName: "TaitungCounty", label: "臺東縣" },
  PEN: { tdxName: "PenghuCounty", label: "澎湖縣" },
  KMN: { tdxName: "KinmenCounty", label: "金門縣" },
  LJK: { tdxName: "LienchiangCounty", label: "連江縣" },
};
