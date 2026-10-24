import { cleanTelUri } from "../utils/phoneUtils.mjs";

export interface TransitHotlinePhone {
  number: string;
  telUri: string;
  label?: string;
  labelEn?: string;
}

export interface TransitEmergencyHotline {
  operator: "TRA" | "THSR" | "TRTC" | "KRTC";
  nameZh: string;
  nameEn: string;
  phones: TransitHotlinePhone[];
  descriptionZh: string;
  descriptionEn: string;
}

export const TRANSIT_EMERGENCY_HOTLINES: TransitEmergencyHotline[] = [
  {
    operator: "TRA",
    nameZh: "臺灣鐵路",
    nameEn: "Taiwan Railway (TRA)",
    phones: [
      {
        number: "0800-765-888",
        telUri: cleanTelUri("0800-765-888") || "tel:0800765888",
        label: "免付費（限市話）",
        labelEn: "Toll-free (landline)",
      },
      {
        number: "02-2191-0096",
        telUri: cleanTelUri("02-2191-0096") || "tel:0221910096",
        label: "行動電話",
        labelEn: "Mobile",
      },
    ],
    descriptionZh: "列車即時動態、颱風地震停駛與退票洽詢",
    descriptionEn: "Live train status, typhoon/earthquake delays & refunds",
  },
  {
    operator: "THSR",
    nameZh: "台灣高鐵",
    nameEn: "Taiwan High Speed Rail (THSR)",
    phones: [
      {
        number: "02-4066-3000",
        telUri: cleanTelUri("02-4066-3000") || "tel:0240663000",
        label: "客服專線",
        labelEn: "Hotline",
      },
    ],
    descriptionZh: "防颱防震運轉變更、降速慢行與票務諮詢",
    descriptionEn: "Severe weather operation changes, speed limits & ticketing",
  },
  {
    operator: "TRTC",
    nameZh: "臺北捷運",
    nameEn: "Taipei Metro (TRTC)",
    phones: [
      {
        number: "02-218-12345",
        telUri: cleanTelUri("02-218-12345") || "tel:0221812345",
        label: "24H 客服",
        labelEn: "24h Customer Service",
      },
    ],
    descriptionZh: "高架段強風停駛通報與各路線營運狀態",
    descriptionEn: "Elevated line wind suspension alerts & network status",
  },
  {
    operator: "KRTC",
    nameZh: "高雄捷運",
    nameEn: "Kaohsiung Metro (KRTC)",
    phones: [
      {
        number: "07-793-8888",
        telUri: cleanTelUri("07-793-8888") || "tel:077938888",
        label: "客服專線",
        labelEn: "Hotline",
      },
    ],
    descriptionZh: "捷運紅橘線與高雄輕軌防颱營運班距通報",
    descriptionEn: "Metro and light rail severe weather headway notices",
  },
];
