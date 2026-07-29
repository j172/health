const DAYS = ["一", "二", "三", "四", "五", "六", "日"];

/** Groups consecutive days sharing the exact same open periods, e.g. {一:[上午,下午], 二:[上午,下午], 六:[上午]} → "一至二 上午、下午｜六 上午". */
function formatWeeklyHours(weeklyHours: Record<string, string[]>): string {
  const groups: { days: string[]; periods: string }[] = [];

  for (const day of DAYS) {
    const periods = (weeklyHours[day] ?? []).join("、");
    if (!periods) continue;
    const last = groups[groups.length - 1];
    if (last && last.periods === periods) {
      last.days.push(day);
    } else {
      groups.push({ days: [day], periods });
    }
  }

  return groups.map((g) => `${g.days.length > 1 ? `${g.days[0]}至${g.days[g.days.length - 1]}` : g.days[0]} ${g.periods}`).join("｜");
}

export default function WeeklyHoursLine({ weeklyHours }: { weeklyHours?: Record<string, string[]> | null }) {
  if (!weeklyHours || Object.keys(weeklyHours).length === 0) return null;
  return <p className="mt-1 text-xs text-neutral-500">🕒 {formatWeeklyHours(weeklyHours)}</p>;
}
