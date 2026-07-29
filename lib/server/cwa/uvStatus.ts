// Taiwan EPA UV index categories (低量級/中量級/高量級/過量級/危險量級).
export function getUvCategory(uv: number): { label: string; color: string } {
  if (uv >= 11) return { label: "危險", color: "#9333ea" };
  if (uv >= 8) return { label: "過量", color: "#dc2626" };
  if (uv >= 6) return { label: "高量", color: "#ea580c" };
  if (uv >= 3) return { label: "中量", color: "#ca8a04" };
  return { label: "低量", color: "#16a34a" };
}
