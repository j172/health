const DAYS = ["一", "二", "三", "四", "五", "六", "日"];

export default function WeeklyHoursLine({
  weeklyHours,
  note,
}: {
  weeklyHours?: Record<string, string[]> | null;
  note?: string | null;
}) {
  if ((!weeklyHours || Object.keys(weeklyHours).length === 0) && !note) return null;

  return (
    <div className="mt-2 space-y-1">
      {weeklyHours && Object.keys(weeklyHours).length > 0 && (
        <div className="flex flex-wrap items-center gap-1 text-xs">
          <span className="mr-1 font-medium text-neutral-500">看診時段：</span>
          {DAYS.map((day) => {
            const periods = weeklyHours[day] ?? [];
            const open = periods.length > 0;
            return (
              <span
                key={day}
                title={open ? `${day}：${periods.join("、")}` : `${day}：休診`}
                className={`inline-flex h-5 w-5 items-center justify-center rounded text-[11px] font-semibold ${
                  open
                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                    : "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500"
                }`}
              >
                {day}
              </span>
            );
          })}
        </div>
      )}
      {note && note !== "-" && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          📝 備註：{note}
        </p>
      )}
    </div>
  );
}
