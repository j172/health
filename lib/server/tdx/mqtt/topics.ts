export const TDX_MQTT_TOPIC_METRO_ALERT = "v2/Rail/Metro/Alert/#";
export const TDX_MQTT_TOPIC_TRA_ALERT = "v3/Rail/TRA/Alert";
export const TDX_MQTT_TOPIC_THSR_ALERT = "v2/Rail/THSR/AlertInfo";

/** Known Metro & Light-rail system operators mapped to friendly display labels */
export const RAIL_SYSTEM_LABELS: Record<string, string> = {
  TRTC: "臺北捷運",
  NTMC: "新北捷運",
  TYMC: "桃園捷運",
  TMRT: "臺中捷運",
  KRTC: "高雄捷運",
  KLRT: "高雄輕軌",
  NTDLRT: "淡海輕軌",
  NTALRT: "安坑輕軌",
  TRTCMG: "貓空纜車",
  TRA: "臺灣鐵路",
  THSR: "台灣高鐵",
};

export function getRailSystemLabel(code: string): string {
  return RAIL_SYSTEM_LABELS[code] || code;
}

/** Check if an incoming MQTT topic is a Metro/LRT alert topic */
export function isMetroAlertTopic(topic: string): boolean {
  return /^v2\/Rail\/Metro\/Alert(\/.*)?$/i.test(topic);
}

/** Extract rail system code from topic path (e.g. "v2/Rail/Metro/Alert/TRTC" -> "TRTC") */
export function extractSystemFromTopic(topic: string): string | null {
  const match = topic.match(/^v2\/Rail\/Metro\/Alert\/([A-Za-z0-9_-]+)$/i);
  return match ? match[1].toUpperCase() : null;
}
