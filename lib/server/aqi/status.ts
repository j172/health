export function getAqiStatusAndColor(aqi: number | null): { status: string; color: string } {
  if (aqi === null) return { status: "–", color: "#9ca3af" };
  if (aqi <= 50) return { status: "良好", color: "#22c55e" };
  if (aqi <= 100) return { status: "普通", color: "#eab308" };
  if (aqi <= 150) return { status: "對敏感族群不健康", color: "#f97316" };
  if (aqi <= 200) return { status: "對所有族群不健康", color: "#ef4444" };
  if (aqi <= 300) return { status: "非常不健康", color: "#8b5cf6" };
  return { status: "危害", color: "#7f1d1d" };
}
