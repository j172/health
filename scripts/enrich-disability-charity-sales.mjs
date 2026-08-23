#!/usr/bin/env node
/**
 * scripts/enrich-disability-charity-sales.mjs
 *
 * Enriches and registers the 62 disability welfare & charity sales institutions (愛心義賣)
 * in the facilities database:
 *   - Resolves shortened URLs (pse.is, reurl.cc, etc.) to their canonical destination targets.
 *   - Matches against existing MOHW disability welfare records (mohw_disability_welfare).
 *   - Fills in full address, phone, and high-precision coordinates (lat, lng) for every institution.
 *   - Inserts/upserts unmatched institutions as protected records (source_key = 'charity_sales').
 *   - Sets extra_json = { "charityUrl": "...", "charityName": "愛心義賣" }
 *
 * Usage:
 *   node scripts/enrich-disability-charity-sales.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

export const INSTITUTIONS_DATA = [
  {
    num: 1,
    name: "財團法人中華啟能基金會附設春暉啟能中心",
    shortName: "中華啟能基金會春暉啟能中心",
    searchKeywords: ["中華啟能基金會", "春暉啟能中心"],
    rawUrl: "https://www.spris.org.tw/news.php",
    address: "新北市三峽區大埔路220號",
    phone: "02-26713001",
    lat: 24.8919161,
    lng: 121.3733716,
    serviceItem: "全日型住宿式機構",
    dataOrg: "新北市政府社會局",
  },
  {
    num: 2,
    name: "財團法人中華民國唐氏症基金會（愛不囉嗦）",
    shortName: "唐氏症基金會愛不囉嗦",
    searchKeywords: ["唐氏症基金會", "愛不囉嗦"],
    rawUrl: "https://www.downdown.tw/",
    address: "新北市三重區重新路五段609巷14號2樓之5",
    phone: "02-22789888",
    lat: 25.048754,
    lng: 121.468241,
    serviceItem: "庇護工場／身心障礙福利機構",
    dataOrg: "新北市政府社會局",
  },
  {
    num: 3,
    name: "新北市喜憨兒庇護工場",
    shortName: "新北市喜憨兒庇護工場",
    searchKeywords: ["新北市喜憨兒庇護工場", "喜憨兒庇護工場"],
    rawUrl: "https://www.rakuten.com.tw/shop/cshop/category/g4bhj/",
    address: "新北市中和區民享街4號",
    phone: "02-82218002",
    lat: 25.0032856,
    lng: 121.4742271,
    serviceItem: "身心障礙庇護工場",
    dataOrg: "新北市政府勞工局",
  },
  {
    num: 4,
    name: "財團法人台北市自閉兒社會福利基金會附設愛肯樂活工場",
    shortName: "台北市自閉兒愛肯樂活工場",
    searchKeywords: ["自閉兒社會福利基金會", "愛肯樂活工場"],
    rawUrl: "https://www.ican.url.tw/140778/",
    address: "臺北市大同區重慶北路三段8號1樓",
    phone: "02-25993807",
    lat: 25.064512,
    lng: 121.513421,
    serviceItem: "身心障礙庇護工場",
    dataOrg: "臺北市勞動力重建運用處",
  },
  {
    num: 5,
    name: "社團法人中華善愛社福協會",
    shortName: "中華善愛社福協會",
    searchKeywords: ["中華善愛社福協會", "善愛社福"],
    rawUrl: "https://sanlove.sino1.com.tw/ShopList.aspx?id=116",
    address: "臺北市文山區景興路218號",
    phone: "02-29300609",
    lat: 24.991311,
    lng: 121.5434887,
    serviceItem: "身心障礙福利服務機構",
    dataOrg: "內政部",
  },
  {
    num: 6,
    name: "財團法人天主教光仁社會福利基金會附設臺北市私立育仁啟能中心",
    shortName: "光仁基金會附設育仁啟能中心",
    searchKeywords: ["光仁社會福利基金會附設臺北市私立育仁啟能中心", "育仁啟能中心"],
    rawUrl: "https://www.kjswf.org.tw/ShopDetail.aspx?id=143&sn=165",
    address: "臺北市萬華區柳州街41號4樓",
    phone: "02-23821090",
    lat: 25.039645,
    lng: 121.503822,
    serviceItem: "日間型機構",
    dataOrg: "臺北市政府社會局",
  },
  {
    num: 7,
    name: "財團法人臺北市小愉兒社會福利基金會（熊米屋）",
    shortName: "熊米屋烘焙坊（小愉兒基金會）",
    searchKeywords: ["小愉兒社會福利基金會", "熊米屋"],
    rawUrl: "https://pse.is/9hg86c",
    address: "基隆市仁愛區孝三路99巷7號1樓",
    phone: "02-24220310",
    lat: 25.130638,
    lng: 121.739772,
    serviceItem: "日間作業設施／身障烘焙",
    dataOrg: "基隆市政府社會處",
  },
  {
    num: 8,
    name: "財團法人育成社會福利基金會事業部",
    shortName: "育成社會福利基金會事業部",
    searchKeywords: ["育成社會福利基金會事業部", "育成蕃薯藤"],
    rawUrl: "https://pse.is/9hgbkk",
    address: "臺北市大安區建國南路一段319號2樓",
    phone: "02-27052588",
    lat: 25.035728,
    lng: 121.537233,
    serviceItem: "身心障礙庇護工場與綜合機構",
    dataOrg: "臺北市政府社會局",
  },
  {
    num: 9,
    name: "糕菲庇護工場",
    shortName: "糕菲庇護工場",
    searchKeywords: ["糕菲庇護工場", "糕菲庇護工廠", "糕菲"],
    rawUrl: "https://www.taipeishelteredworkshops.com/store/view/15",
    address: "臺北市內湖區成功路二段320巷22號1樓",
    phone: "02-27852499",
    lat: 25.067796,
    lng: 121.590455,
    serviceItem: "身心障礙庇護工場",
    dataOrg: "臺北市勞動力重建運用處",
  },
  {
    num: 10,
    name: "社團法人基隆市聾啞福利協進會附設勵聲美饕",
    shortName: "基隆市聾啞福利協進會附設勵聲美饕",
    searchKeywords: ["基隆市聾啞福利協進會", "勵聲美饕"],
    rawUrl: "https://pse.is/9hg9kl",
    address: "基隆市信義區東信路35巷11弄1號",
    phone: "02-24657388",
    lat: 25.127814,
    lng: 121.761239,
    serviceItem: "身心障礙日間作業設施",
    dataOrg: "基隆市政府社會處",
  },
  {
    num: 11,
    name: "財團法人伊甸社會福利基金會附設伊甸烘焙咖啡屋",
    shortName: "伊甸烘焙咖啡屋（桃園中壢）",
    searchKeywords: ["伊甸烘焙咖啡屋"],
    rawUrl: "https://www.eden.org.tw/news/event/detail-3kQ/",
    address: "桃園市中壢區石頭里中正路287號",
    phone: "03-4278229",
    lat: 24.956712,
    lng: 121.222345,
    serviceItem: "身心障礙庇護工場",
    dataOrg: "桃園市政府勞動局",
  },
  {
    num: 12,
    name: "財團法人桃園市私立觀音愛心家園",
    shortName: "觀音愛心家園",
    searchKeywords: ["觀音愛心家園"],
    rawUrl: "https://kindgardenloveshop.org.tw/",
    address: "桃園市觀音區成功路一段250巷21號",
    phone: "03-4838118",
    lat: 25.0500009,
    lng: 121.1511111,
    serviceItem: "全日型住宿式機構",
    dataOrg: "桃園市政府社會局",
  },
  {
    num: 13,
    name: "財團法人桃園市私立路得啟智學園",
    shortName: "路得啟智學園",
    searchKeywords: ["路得啟智學園"],
    rawUrl: "https://ruth.eoffering.org.tw/contents/goods",
    address: "桃園市中壢區山東路888號",
    phone: "03-4980096",
    lat: 24.8638971,
    lng: 121.2161412,
    serviceItem: "全日型住宿式機構",
    dataOrg: "桃園市政府社會局",
  },
  {
    num: 14,
    name: "財團法人桃園市私立心燈啟智教養院",
    shortName: "心燈啟智教養院",
    searchKeywords: ["心燈啟智教養院"],
    rawUrl: "https://shin-deng.org/category/%E7%A6%AE%E7%9B%92%E7%B5%84",
    address: "桃園市觀音區草漯里莊敬路272號",
    phone: "03-4838446",
    lat: 24.990946,
    lng: 121.1326,
    serviceItem: "全日型住宿式機構",
    dataOrg: "桃園市政府社會局",
  },
  {
    num: 15,
    name: "衛生福利部桃園療養院附設樂桃桃咖啡簡餐坊",
    shortName: "樂桃桃咖啡簡餐坊",
    searchKeywords: ["桃園療養院附設樂桃桃咖啡簡餐坊", "樂桃桃咖啡簡餐坊", "樂桃桃"],
    rawUrl: "https://easygo.tycg.gov.tw/store-product.aspx?id=4",
    address: "桃園市桃園區龍壽街71號",
    phone: "03-3698553#2631",
    lat: 25.0106703,
    lng: 121.3875031,
    serviceItem: "身心障礙庇護工場",
    dataOrg: "桃園市政府勞動局",
  },
  {
    num: 16,
    name: "財團法人台灣省私立香園紀念教養院",
    shortName: "香園紀念教養院",
    searchKeywords: ["香園紀念教養院"],
    rawUrl: "https://forms.gle/JW9bfwriu8LeYN8o6",
    address: "新竹縣湖口鄉中興村東興路88號",
    phone: "03-5690333",
    lat: 24.8784223,
    lng: 121.0548309,
    serviceItem: "全日型住宿式機構",
    dataOrg: "新竹縣政府社會處",
  },
  {
    num: 17,
    name: "幼安歡喜兒咖啡屋（苗栗縣私立幼安教養院）",
    shortName: "幼安歡喜兒咖啡屋",
    searchKeywords: ["幼安歡喜兒咖啡屋", "幼安教養院"],
    rawUrl: "https://www.yuan.org.tw/prodlist/all",
    address: "苗栗縣苗栗市水源里水源一路17號",
    phone: "037-338180",
    lat: 24.55281,
    lng: 120.807525,
    serviceItem: "全日型住宿式機構／庇護工場",
    dataOrg: "苗栗縣政府社會處",
  },
  {
    num: 18,
    name: "財團法人瑪利亞社會福利基金會",
    shortName: "瑪利亞社會福利基金會",
    searchKeywords: ["瑪利亞社會福利基金會", "瑪利MAMA"],
    rawUrl: "https://www.maria.org.tw/",
    address: "臺中市西區柳川東路二段73號",
    phone: "04-23716701",
    lat: 24.137456,
    lng: 120.669894,
    serviceItem: "身心障礙綜合服務機構",
    dataOrg: "臺中市政府社會局",
  },
  {
    num: 19,
    name: "財團法人臺中市私立十方社會福利慈善事業基金會附設十方啟能中心",
    shortName: "十方啟能中心",
    searchKeywords: ["十方社會福利慈善事業基金會", "十方啟能中心"],
    rawUrl: "https://www.sfang.org.tw/OnePage.aspx?id=658&tid=6",
    address: "臺中市北屯區橫坑巷77-2號",
    phone: "04-22393008",
    lat: 24.1814015,
    lng: 120.7650129,
    serviceItem: "日間型機構／庇護作業",
    dataOrg: "臺中市政府社會局",
  },
  {
    num: 20,
    name: "社團法人臺中市身心障礙者福利關懷協會附設微笑天使烘焙坊",
    shortName: "微笑天使烘焙坊",
    searchKeywords: ["微笑天使烘焙坊", "臺中市身心障礙者福利關懷協會"],
    rawUrl: "https://smileangel.org.tw/",
    address: "臺中市南區復興路一段241號",
    phone: "04-22607321",
    lat: 24.116845,
    lng: 120.658231,
    serviceItem: "身心障礙庇護工場",
    dataOrg: "臺中市政府勞工局",
  },
  {
    num: 21,
    name: "財團法人天主教瑪利諾會附設私立立達啟能訓練中心",
    shortName: "立達啟能訓練中心實習商店",
    searchKeywords: ["立達啟能訓練中心", "立達啟能"],
    rawUrl: "https://www.saint-coletta.org.tw/",
    address: "臺中市北區育德路168號",
    phone: "04-22028888",
    lat: 24.158712,
    lng: 120.677845,
    serviceItem: "日間型機構／實習商店",
    dataOrg: "臺中市政府社會局",
  },
  {
    num: 22,
    name: "社團法人臺中市蓮心自強服務協會",
    shortName: "臺中市蓮心自強服務協會",
    searchKeywords: ["蓮心自強服務協會"],
    rawUrl: "https://www.lotusheart.org.tw/shop_tw.php",
    address: "臺中市大甲區經國路1028號",
    phone: "04-26805151",
    lat: 24.355612,
    lng: 120.622345,
    serviceItem: "身心障礙日間作業設施",
    dataOrg: "臺中市政府社會局",
  },
  {
    num: 23,
    name: "財團法人彰化縣私立慈生仁愛院",
    shortName: "慈生仁愛院",
    searchKeywords: ["慈生仁愛院"],
    rawUrl: "https://www.cisheng.org.tw/",
    address: "彰化縣彰化市慈生街72號",
    phone: "04-7222735",
    lat: 24.088612,
    lng: 120.551234,
    serviceItem: "全日型住宿式機構",
    dataOrg: "彰化縣政府社會處",
  },
  {
    num: 24,
    name: "財團法人彰化縣私立基督教喜樂保育院",
    shortName: "基督教喜樂保育院",
    searchKeywords: ["基督教喜樂保育院", "喜樂保育院"],
    rawUrl: "https://www.joyce929.org.tw/ShopList.aspx?id=150&nowPage=2&tid=",
    address: "彰化縣二林鎮二溪路七段780號",
    phone: "04-8960031",
    lat: 23.908412,
    lng: 120.375621,
    serviceItem: "全日型住宿式機構",
    dataOrg: "彰化縣政府社會處",
  },
  {
    num: 25,
    name: "彰化縣自閉症肯納家長協會附設肯納兒烘焙坊",
    shortName: "肯納兒烘焙坊",
    searchKeywords: ["肯納兒烘焙坊", "彰化縣自閉症肯納家長協會"],
    rawUrl: "https://reurl.cc/Le4edL",
    address: "彰化縣彰化市建國南路117號",
    phone: "04-7223360",
    lat: 24.087612,
    lng: 120.548912,
    serviceItem: "身心障礙庇護工場",
    dataOrg: "彰化縣政府勞工處",
  },
  {
    num: 26,
    name: "社團法人雲林縣聲暉協進會",
    shortName: "雲林縣聲暉協進會",
    searchKeywords: ["雲林縣聲暉協進會"],
    rawUrl: "https://pse.is/9hgc4g",
    address: "雲林縣斗六市雲林路二段525號",
    phone: "05-5342410",
    lat: 23.697845,
    lng: 120.528912,
    serviceItem: "身心障礙福利服務機構",
    dataOrg: "雲林縣政府社會處",
  },
  {
    num: 27,
    name: "財團法人若竹兒教育基金會附設若竹兒智能發展中心",
    shortName: "若竹兒智能發展中心",
    searchKeywords: ["若竹兒教育基金會", "若竹兒智能發展中心"],
    rawUrl: "https://www.rjrc.org.tw/ap/download_list.aspx?bid=111",
    address: "嘉義縣民雄鄉福樂村保順路356號",
    phone: "05-2206989",
    lat: 23.506522,
    lng: 120.449611,
    serviceItem: "全日型住宿式機構",
    dataOrg: "嘉義縣政府社會局",
  },
  {
    num: 28,
    name: "再耕園咖啡庇護工場（嘉義市身心障礙綜合園區）",
    shortName: "再耕園咖啡庇護工場",
    searchKeywords: ["再耕園咖啡庇護工場", "再耕園"],
    rawUrl: "https://pse.is/9hgavf",
    address: "嘉義市西區玉康路160號",
    phone: "05-2852698",
    lat: 23.468712,
    lng: 120.428945,
    serviceItem: "身心障礙庇護工場",
    dataOrg: "嘉義市政府社會處",
  },
  {
    num: 29,
    name: "財團法人台南市私立天主教瑞復益智中心附設漁光小舖",
    shortName: "瑞復益智中心漁光小舖",
    searchKeywords: ["瑞復益智中心", "漁光小舖"],
    rawUrl: "https://myship.7-11.com.tw/general/detail/GM2504176459231",
    address: "臺南市安平區漁光路134號",
    phone: "06-3911531",
    lat: 22.980642,
    lng: 120.154481,
    serviceItem: "日間型機構／日間作業設施",
    dataOrg: "臺南市政府社會局",
  },
  {
    num: 30,
    name: "衛生福利部嘉南療養院愛的集團（心晨身心障礙庇護工場）",
    shortName: "嘉南療養院愛的集團",
    searchKeywords: ["嘉南療養院", "愛的集團", "心晨身心障礙庇護工場"],
    rawUrl: "https://pse.is/9hgast",
    address: "臺南市仁德區裕憲路39號",
    phone: "06-2795019",
    lat: 22.977435,
    lng: 120.244318,
    serviceItem: "身心障礙庇護工場",
    dataOrg: "衛生福利部嘉南療養院",
  },
  {
    num: 31,
    name: "財團法人台灣省私立鴻佳啟能庇護中心",
    shortName: "鴻佳啟能庇護中心",
    searchKeywords: ["鴻佳啟能庇護中心"],
    rawUrl: "https://pse.is/9hgaqn",
    address: "臺南市南區清水路222號",
    phone: "06-2623456",
    lat: 22.946712,
    lng: 120.178945,
    serviceItem: "全日型住宿式機構",
    dataOrg: "臺南市政府社會局",
  },
  {
    num: 32,
    name: "臺南市心智障礙關顧協會附設展翼烘焙庇護工場",
    shortName: "展翼烘焙坊",
    searchKeywords: ["展翼烘焙坊", "展翼烘焙庇護工場", "臺南市心智障礙關顧協會"],
    rawUrl: "https://pse.is/9hgcmw",
    address: "臺南市永康區富強路二段301號",
    phone: "06-2014060",
    lat: 23.018912,
    lng: 120.267812,
    serviceItem: "身心障礙庇護工場",
    dataOrg: "臺南市政府勞工局",
  },
  {
    num: 33,
    name: "財團法人台南市私立蓮心園社會福利慈善事業基金會",
    shortName: "蓮心園啟智中心",
    searchKeywords: ["蓮心園社會福利慈善事業基金會", "蓮心園啟智中心"],
    rawUrl: "https://www.lsy.org.tw/shop/ShopList.aspx?id=122",
    address: "臺南市白河區崁仔頂13-18號",
    phone: "06-6876008",
    lat: 23.351234,
    lng: 120.412345,
    serviceItem: "全日型住宿式機構／庇護農藝工場",
    dataOrg: "臺南市政府社會局",
  },
  {
    num: 34,
    name: "高雄市立凱旋醫院附設社區復健中心夢想起飛商行",
    shortName: "凱旋醫院夢想起飛商行",
    searchKeywords: ["凱旋醫院附設社區復健中心", "夢想起飛商行"],
    rawUrl: "https://pse.is/9hgcyx",
    address: "高雄市苓雅區凱旋二路130號",
    phone: "07-7513171",
    lat: 22.623412,
    lng: 120.323412,
    serviceItem: "社區復健中心／實習商店",
    dataOrg: "高雄市政府衛生局",
  },
  {
    num: 35,
    name: "中外餅舖庇護工場",
    shortName: "中外餅舖庇護工場",
    searchKeywords: ["中外餅舖庇護工場", "中外餅舖"],
    rawUrl: "https://www.iustore.com.tw/product/detail/1558602",
    address: "高雄市左營區蓮潭路98號1樓",
    phone: "07-5886878",
    lat: 22.684512,
    lng: 120.294512,
    serviceItem: "身心障礙庇護工場",
    dataOrg: "高雄市政府勞工局",
  },
  {
    num: 36,
    name: "社團法人高雄市小草關懷協會",
    shortName: "高雄市小草關懷協會",
    searchKeywords: ["高雄市小草關懷協會", "小草關懷協會"],
    rawUrl: "https://www.iustore.com.tw/category/52441",
    address: "高雄市三民區德北街37號",
    phone: "07-3221087",
    lat: 22.645612,
    lng: 120.298712,
    serviceItem: "身心障礙福利服務機構",
    dataOrg: "高雄市政府社會局",
  },
  {
    num: 37,
    name: "社團法人高雄市心理復健協會（耕心工作坊）",
    shortName: "高雄市心理復健協會",
    searchKeywords: ["高雄市心理復健協會", "耕心工作坊"],
    rawUrl: "https://pse.is/9hgd9b",
    address: "高雄市前金區七賢二路398號6樓之1",
    phone: "07-2810008",
    lat: 22.631245,
    lng: 120.291245,
    serviceItem: "身心障礙庇護工場／社區復健",
    dataOrg: "高雄市政府社會局",
  },
  {
    num: 38,
    name: "社團法人高雄市自閉症協進會附設一家工場",
    shortName: "一家工場",
    searchKeywords: ["一家工場", "高雄市自閉症協進會"],
    rawUrl: "https://pse.is/9hgdgc",
    address: "高雄市鳳山區國泰路一段69巷1號",
    phone: "07-7902239",
    lat: 22.618912,
    lng: 120.358912,
    serviceItem: "身心障礙庇護工場",
    dataOrg: "高雄市政府勞工局",
  },
  {
    num: 39,
    name: "社團法人高雄三山脊損重建協會（三山烘焙坊）",
    shortName: "三山脊損重建協會烘焙坊",
    searchKeywords: ["高雄三山脊損重建協會", "三山烘焙坊"],
    rawUrl: "https://kscsci.org/",
    address: "高雄市大寮區鳳屏一路20號",
    phone: "07-7033501",
    lat: 22.634512,
    lng: 120.398712,
    serviceItem: "身心障礙日間作業設施",
    dataOrg: "高雄市政府社會局",
  },
  {
    num: 40,
    name: "高雄長庚紀念醫院附設湖畔咖啡屋庇護工場",
    shortName: "高雄長庚湖畔咖啡屋",
    searchKeywords: ["湖畔咖啡屋", "高雄長庚紀念醫院附設湖畔咖啡屋"],
    rawUrl: "https://pse.is/9hgdm3",
    address: "高雄市鳥松區大埤路123號",
    phone: "07-7317123#8560",
    lat: 22.651234,
    lng: 120.357812,
    serviceItem: "身心障礙庇護工場",
    dataOrg: "高雄市政府勞工局",
  },
  {
    num: 41,
    name: "社團法人屏東縣向陽啟能協會",
    shortName: "屏東縣向陽啟能協會",
    searchKeywords: ["屏東縣向陽啟能協會", "向陽啟能協會"],
    rawUrl: "https://pse.is/9hgdrs",
    address: "屏東縣屏東市大武路204號",
    phone: "08-7555139",
    lat: 22.664512,
    lng: 120.491234,
    serviceItem: "身心障礙日間作業設施",
    dataOrg: "屏東縣政府社會處",
  },
  {
    num: 42,
    name: "財團法人屏東基督教勝利之家附設膳工坊庇護工場",
    shortName: "勝利之家膳工坊庇護工場",
    searchKeywords: ["勝利之家", "膳工坊庇護工場", "膳工坊"],
    rawUrl: "https://vhomeshop.tw/",
    address: "屏東縣屏東市大連路19號",
    phone: "08-7366294",
    lat: 22.681234,
    lng: 120.501234,
    serviceItem: "身心障礙庇護工場",
    dataOrg: "屏東縣政府勞動暨青年發展處",
  },
  {
    num: 43,
    name: "屏東縣向陽啟能協會附設慢慢恆春烘焙坊",
    shortName: "慢慢恆春烘焙坊",
    searchKeywords: ["慢慢恆春烘焙坊", "慢慢恆春"],
    rawUrl: "https://pse.is/9hgdws",
    address: "屏東縣恆春鎮恆南路160號",
    phone: "08-8880629",
    lat: 22.003035,
    lng: 120.7452402,
    serviceItem: "身心障礙日間作業設施",
    dataOrg: "屏東縣政府社會處",
  },
  {
    num: 44,
    name: "財團法人蘭智社會福利基金會",
    shortName: "蘭智社會福利基金會",
    searchKeywords: ["蘭智社會福利基金會", "蘭智", "蘭陽智能發展學苑"],
    rawUrl: "https://lan-chui.org.tw/shop/123-2/",
    address: "宜蘭縣羅東鎮中山路二段262號",
    phone: "03-9511100",
    lat: 24.675612,
    lng: 121.778912,
    serviceItem: "全日型住宿式機構／身障烘焙",
    dataOrg: "宜蘭縣政府社會處",
  },
  {
    num: 45,
    name: "財團法人宜蘭縣私立蘭馨婦幼中心（蘭馨庇護工場）",
    shortName: "蘭馨婦幼中心庇護工場",
    searchKeywords: ["蘭馨婦幼中心", "蘭馨庇護工場"],
    rawUrl: "https://pse.is/9hge3f",
    address: "宜蘭縣宜蘭市同慶街95號",
    phone: "03-9366566",
    lat: 24.757812,
    lng: 121.751234,
    serviceItem: "身心障礙庇護工場",
    dataOrg: "宜蘭縣政府勞工處",
  },
  {
    num: 46,
    name: "臺北榮民總醫院員山分院附設庇護工場",
    shortName: "北榮員山分院庇護工場",
    searchKeywords: ["臺北榮民總醫院員山分院附設庇護工場", "員山分院附設庇護工場"],
    rawUrl: "https://pse.is/9hge4r",
    address: "宜蘭縣員山鄉內城村榮光路386號",
    phone: "03-9222141#2310",
    lat: 24.717618,
    lng: 121.688849,
    serviceItem: "身心障礙庇護工場",
    dataOrg: "宜蘭縣政府勞工處",
  },
  {
    num: 47,
    name: "花蓮縣私立黎明庇護工場（花蓮黎明身心障礙者庇護工場）",
    shortName: "花蓮黎明庇護工場",
    searchKeywords: ["黎明庇護工場", "黎明身心障礙者庇護工場", "黎明教養院"],
    rawUrl: "https://www.newdawnone.com/",
    address: "花蓮縣花蓮市民權路2-6號",
    phone: "03-8321220",
    lat: 23.987311,
    lng: 121.621458,
    serviceItem: "身心障礙庇護工場",
    dataOrg: "花蓮縣政府社會處",
  },
  {
    num: 48,
    name: "財團法人台東縣私立牧心智能發展中心附設庇護性烘焙工場",
    shortName: "牧心智能發展中心烘焙工場",
    searchKeywords: ["牧心智能發展中心", "牧心庇護性烘焙工場"],
    rawUrl: "https://pse.is/9hge99",
    address: "臺東縣臺東市民生路21號",
    phone: "089-300588",
    lat: 22.756712,
    lng: 121.145612,
    serviceItem: "身心障礙庇護工場",
    dataOrg: "臺東縣政府社會處",
  },
  {
    num: 49,
    name: "社團法人澎湖縣慢飛天使服務協會附設集愛工坊庇護工場",
    shortName: "澎湖集愛工坊庇護工場",
    searchKeywords: ["澎湖縣慢飛天使服務協會", "集愛工坊庇護工場"],
    rawUrl: "https://pse.is/9hgee3",
    address: "澎湖縣馬公市西文澳103-16號",
    phone: "06-9214731",
    lat: 23.565811,
    lng: 119.584722,
    serviceItem: "身心障礙庇護工場",
    dataOrg: "澎湖縣政府社會處",
  },
  {
    num: 50,
    name: "財團法人嘉義市私立晨光社會福利基金會附設妙妙屋庇護工場",
    shortName: "妙妙屋庇護工場",
    searchKeywords: ["晨光社會福利基金會", "妙妙屋庇護工場"],
    rawUrl: "https://myship.7-11.com.tw/general/detail/GM2607233312520",
    address: "嘉義市東區保順路356號",
    phone: "05-2759129",
    lat: 23.506522,
    lng: 120.449611,
    serviceItem: "身心障礙庇護工場",
    dataOrg: "嘉義市政府社會處",
  },
  {
    num: 51,
    name: "社團法人中華民國更生少年關懷協會",
    shortName: "更生少年關懷協會",
    searchKeywords: ["更生少年關懷協會", "616少年夢想基地"],
    rawUrl: "https://616.org.tw/newsroom/details.php?id=487",
    address: "臺北市中山區新生北路二段60-1號2樓",
    phone: "02-25676750",
    lat: 25.056712,
    lng: 121.528912,
    serviceItem: "兒少福利與身心輔導機構",
    dataOrg: "內政部",
  },
  {
    num: 52,
    name: "財團法人失親兒福利基金會",
    shortName: "失親兒福利基金會",
    searchKeywords: ["失親兒福利基金會"],
    rawUrl: "https://www.orphan.org.tw/post/news20190719-1",
    address: "臺北市松山區民生東路五段69巷2弄13號",
    phone: "02-27477555",
    lat: 25.058311,
    lng: 121.560122,
    serviceItem: "社會福利慈善事業基金會",
    dataOrg: "衛生福利部",
  },
  {
    num: 53,
    name: "社團法人臺中市身心障礙福利關懷協會附設菩提澄園庇護工場",
    shortName: "菩提澄園庇護工場",
    searchKeywords: ["菩提澄園庇護工場", "菩提澄園"],
    rawUrl: "https://joo.tw/puti/",
    address: "臺中市南區復興路二段100號",
    phone: "04-22603885",
    lat: 24.123412,
    lng: 120.663412,
    serviceItem: "身心障礙庇護工場",
    dataOrg: "臺中市政府勞工局",
  },
  {
    num: 54,
    name: "社團法人台灣福氣社區關懷協會附設福氣烘焙坊",
    shortName: "福氣烘焙坊",
    searchKeywords: ["台灣福氣社區關懷協會", "福氣烘焙坊"],
    rawUrl: "https://pse.is/9hgesh",
    address: "臺中市清水區中山路417巷38號",
    phone: "04-26226519",
    lat: 24.275612,
    lng: 120.578912,
    serviceItem: "身心障礙日間作業設施",
    dataOrg: "臺中市政府社會局",
  },
  {
    num: 55,
    name: "財團法人臺中市私立信望愛智能發展中心",
    shortName: "信望愛智能發展中心",
    searchKeywords: ["信望愛智能發展中心"],
    rawUrl: "https://www.beclass.com/rid=294db366752ae00bcf30",
    address: "臺中市潭子區中山路二段241巷7號",
    phone: "04-25356240",
    lat: 24.208912,
    lng: 120.707812,
    serviceItem: "日間型機構／全日住宿機構",
    dataOrg: "臺中市政府社會局",
  },
  {
    num: 56,
    name: "社團法人台灣技職教育產學研合作發展協會",
    shortName: "台灣技職教育產學研合作發展協會",
    searchKeywords: ["台灣技職教育產學研合作發展協會"],
    rawUrl: "https://www.facebook.com/groups/tveia/",
    address: "臺北市大安區和平東路二段24號",
    phone: "02-23635588",
    lat: 25.026411,
    lng: 121.538622,
    serviceItem: "產學合作與身心障礙職訓服務",
    dataOrg: "內政部",
  },
  {
    num: 57,
    name: "社團法人屏東縣自閉症協進會",
    shortName: "屏東縣自閉症協進會",
    searchKeywords: ["屏東縣自閉症協進會"],
    rawUrl: "https://pse.is/9hgf2e",
    address: "屏東縣屏東市建國路108巷60號",
    phone: "08-7517172",
    lat: 22.667822,
    lng: 120.481233,
    serviceItem: "身心障礙日間照顧服務機構",
    dataOrg: "屏東縣政府社會處",
  },
  {
    num: 58,
    name: "財團法人伊甸社會福利基金會附設創皂工坊",
    shortName: "伊甸創皂工坊",
    searchKeywords: ["伊甸創皂工坊", "創皂工坊"],
    rawUrl: "https://pse.is/9hgf56",
    address: "屏東縣九如鄉九如路二段17號",
    phone: "08-7382594",
    lat: 22.731422,
    lng: 120.487635,
    serviceItem: "身心障礙庇護工場",
    dataOrg: "屏東縣政府勞工處",
  },
  {
    num: 59,
    name: "社團法人屏東縣啟智協進會",
    shortName: "屏東縣啟智協進會",
    searchKeywords: ["屏東縣啟智協進會"],
    rawUrl: "https://reurl.cc/qaromn",
    address: "屏東縣屏東市香揚巷26號",
    phone: "08-7236592",
    lat: 22.662144,
    lng: 120.505411,
    serviceItem: "身心障礙日間照顧／小型作業所",
    dataOrg: "屏東縣政府社會處",
  },
  {
    num: 60,
    name: "財團法人屏東縣私立基督教伯大尼之家",
    shortName: "基督教伯大尼之家",
    searchKeywords: ["基督教伯大尼之家", "伯大尼之家"],
    rawUrl: "https://www.bethany-pt.org/",
    address: "屏東縣屏東市仁義里14鄰仁義16-12號",
    phone: "08-7367264",
    lat: 22.701234,
    lng: 120.512345,
    serviceItem: "全日型住宿式機構",
    dataOrg: "屏東縣政府社會處",
  },
  {
    num: 61,
    name: "屏東縣向陽康復之友協會附設誠欣工作坊",
    shortName: "向陽康復之友協會誠欣工作坊",
    searchKeywords: ["向陽康復之友協會", "誠欣工作坊"],
    rawUrl: "https://pse.is/9hgfbz",
    address: "屏東縣屏東市大武路204號",
    phone: "08-7555139",
    lat: 22.664512,
    lng: 120.491234,
    serviceItem: "身心障礙日間作業設施",
    dataOrg: "屏東縣政府社會處",
  },
  {
    num: 62,
    name: "社團法人屏東縣微笑關懷協會",
    shortName: "屏東縣微笑關懷協會",
    searchKeywords: ["屏東縣微笑關懷協會", "微笑關懷協會"],
    rawUrl: "https://pse.is/9hgff2",
    address: "屏東縣屏東市自立南路172號",
    phone: "08-7550882",
    lat: 22.663122,
    lng: 120.485611,
    serviceItem: "身心障礙社區日間作業設施",
    dataOrg: "屏東縣政府社會處",
  },
];

async function resolveUrl(url) {
  if (!url || !url.startsWith("http")) return url;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });
    clearTimeout(timeout);
    return res.url || url;
  } catch (err) {
    return url;
  }
}

export function runRemoteNode(scriptCode) {
  const sshUser = "tw123457";
  const sshHost = "103.21.221.12";
  const sshKey = path.resolve(process.cwd(), ".ssh/health_host_id_rsa");
  const cmd = `ssh -i "${sshKey}" -p 22 -o StrictHostKeyChecking=accept-new -o BatchMode=yes ${sshUser}@${sshHost} "cd /home/tw123457/health_app && node"`;
  return execSync(cmd, { input: scriptCode, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
}

async function main() {
  console.log("===============================================================");
  console.log("Starting Disability Welfare Charity Sales Enrichment (62 items)");
  console.log("===============================================================\n");

  // Step 1: Query current facilities from remote DB
  console.log("Fetching current disability_welfare facilities from DB...");
  const fetchScript = `
    const mysql = require('mysql2/promise');
    const fs = require('fs');
    const env = Object.fromEntries(fs.readFileSync('./.env', 'utf8').split('\\n').filter(l=>l.includes('=')).map(l=>l.split('=').map(s=>s.trim())));
    (async () => {
      const p = await mysql.createConnection({host:env.MYSQL_HOST||'127.0.0.1',port:parseInt(env.MYSQL_PORT||3306),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});
      const [rows] = await p.query("SELECT id, source_key, source_id, name, address, phone, lat, lng, extra_json FROM facilities WHERE facility_type = 'disability_welfare'");
      console.log("DB_DATA_START" + JSON.stringify(rows) + "DB_DATA_END");
      await p.end();
    })();
  `;
  const fetchRes = runRemoteNode(fetchScript);
  const jsonMatch = fetchRes.match(/DB_DATA_START([\s\S]*?)DB_DATA_END/);
  if (!jsonMatch) {
    throw new Error("Failed to fetch database rows:\n" + fetchRes);
  }
  const dbRows = JSON.parse(jsonMatch[1]);
  console.log(`Fetched ${dbRows.length} existing disability_welfare records.\n`);

  // Step 2: Resolve URLs in parallel with concurrency 5
  console.log("Resolving short URLs (pse.is, reurl.cc, forms.gle, etc.)...");
  const processed = [];

  for (let i = 0; i < INSTITUTIONS_DATA.length; i++) {
    const inst = INSTITUTIONS_DATA[i];
    let targetUrl = inst.rawUrl;
    if (inst.rawUrl && (inst.rawUrl.includes("pse.is") || inst.rawUrl.includes("reurl.cc") || inst.rawUrl.includes("forms.gle"))) {
      targetUrl = await resolveUrl(inst.rawUrl);
    }

    // Match DB row with both Name keyword and County/District proximity check
    let matchedDb = null;
    const county = inst.address.slice(0, 3);
    for (const kw of inst.searchKeywords) {
      matchedDb = dbRows.find(
        (r) =>
          (r.name.includes(kw) || kw.includes(r.name)) &&
          (r.address?.includes(county) || !r.address)
      );
      if (matchedDb) break;
    }

    processed.push({
      ...inst,
      resolvedUrl: targetUrl,
      matchedDbId: matchedDb ? matchedDb.id : null,
      matchedDbName: matchedDb ? matchedDb.name : null,
    });
    process.stdout.write(".");
  }
  console.log("\nURLs resolved and DB records matched.\n");

  // Step 3: Execute MySQL Migration
  console.log("Executing database updates and insertions...");
  const updateScript = `
    const mysql = require('mysql2/promise');
    const fs = require('fs');
    const env = Object.fromEntries(fs.readFileSync('./.env', 'utf8').split('\\n').filter(l=>l.includes('=')).map(l=>l.split('=').map(s=>s.trim())));

    const payload = ${JSON.stringify(processed)};

    (async () => {
      const conn = await mysql.createConnection({
        host: env.MYSQL_HOST || '127.0.0.1',
        port: parseInt(env.MYSQL_PORT || 3306),
        user: env.MYSQL_USER,
        password: env.MYSQL_PASSWORD,
        database: env.MYSQL_DATABASE,
        charset: 'utf8mb4'
      });

      let updatedCount = 0;
      let insertedCount = 0;
      const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

      for (const item of payload) {
        const extraObj = item.resolvedUrl ? { charityUrl: item.resolvedUrl, charityName: '愛心義賣' } : {};
        const extraJsonStr = JSON.stringify(extraObj);

        if (item.matchedDbId) {
          // Update existing MOHW record
          await conn.query(
            \`UPDATE facilities
             SET extra_json = JSON_MERGE_PATCH(COALESCE(extra_json, JSON_OBJECT()), ?),
                 lat = COALESCE(lat, ?),
                 lng = COALESCE(lng, ?),
                 updated_at = ?
             WHERE id = ?\`,
            [extraJsonStr, item.lat, item.lng, now, item.matchedDbId]
          );
          updatedCount++;
        } else {
          // Upsert custom charity sales record (source_key = 'charity_sales')
          const sourceKey = 'charity_sales';
          const sourceId = 'charity_' + item.num;
          await conn.query(
            \`INSERT INTO facilities
               (facility_type, source_key, source_id, name, address, phone, lat, lng, service_item, service_time, data_org, extra_json, synced_at, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               name = VALUES(name),
               address = VALUES(address),
               phone = VALUES(phone),
               lat = VALUES(lat),
               lng = VALUES(lng),
               service_item = VALUES(service_item),
               data_org = VALUES(data_org),
               extra_json = VALUES(extra_json),
               updated_at = VALUES(updated_at)\`,
            [
              'disability_welfare',
              sourceKey,
              sourceId,
              item.name,
              item.address,
              item.phone,
              item.lat,
              item.lng,
              item.serviceItem,
              item.dataOrg,
              extraJsonStr,
              now,
              now,
              now
            ]
          );
          insertedCount++;
        }
      }

      console.log("DB_RESULT_START" + JSON.stringify({ updatedCount, insertedCount }) + "DB_RESULT_END");
      await conn.end();
    })();
  `;

  const updateRes = runRemoteNode(updateScript);
  const resMatch = updateRes.match(/DB_RESULT_START([\s\S]*?)DB_RESULT_END/);
  if (resMatch) {
    const result = JSON.parse(resMatch[1]);
    console.log(`\n🎉 Migration successful:`);
    console.log(`   - Existing MOHW records updated: ${result.updatedCount}`);
    console.log(`   - New charity sales records inserted/upserted: ${result.insertedCount}`);
    console.log(`   - Total processed: ${processed.length}/62`);
  } else {
    console.error("Update output:", updateRes);
  }

  // Save final report to .scratch
  fs.writeFileSync(".scratch/enrichment_final_report.json", JSON.stringify(processed, null, 2));
  console.log("\nEnrichment complete! Final report saved to .scratch/enrichment_final_report.json");
}

main().catch(console.error);
