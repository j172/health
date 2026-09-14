"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import LoadingOrb from "@/components/ui/LoadingOrb";
import type { DengueVillagePoint } from "@/lib/server/dengue/queries";
import { useGeolocation } from "@/components/Facilities/useGeolocation";

const DengueMosquitoMapLeaflet = dynamic(
  () => import("@/components/DengueMosquitoMap/DengueMosquitoMapLeaflet"),
  { ssr: false },
);

interface ApiResponse {
  ok: boolean;
  points?: DengueVillagePoint[];
  updatedAt?: string | null;
  error?: string;
}

const formatUpdatedAt = (iso: string | null): string => {
  if (!iso) return "尚無同步紀錄";
  try {
    return new Intl.DateTimeFormat("zh-TW", {
      timeZone: "Asia/Taipei",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
};

const LEGEND: { lv: string; color: string; label: string }[] = [
  { lv: "0", color: "#16a34a", label: "0 級（未發現陽性）" },
  { lv: "1-2", color: "#65a30d", label: "1-2 級" },
  { lv: "3-4", color: "#d97706", label: "3-4 級" },
  { lv: "5-6", color: "#ea580c", label: "5-6 級" },
  { lv: "7-9", color: "#dc2626", label: "7-9 級" },
];

export default function DengueMosquitoMapContent() {
  const location = useGeolocation();
  const [points, setPoints] = useState<DengueVillagePoint[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [keyword, setKeyword] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res: ApiResponse = await fetch("/api/dengue-map").then((r) => r.json());
        if (cancelled) return;
        if (res.ok) {
          setPoints(res.points ?? []);
          setUpdatedAt(res.updatedAt ?? null);
        } else {
          setError(res.error || "病媒蚊密度資料載入失敗");
        }
      } catch (err: any) {
        if (!cancelled) setError(err?.message || "資料載入失敗");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredPoints = useMemo(() => {
    const kw = keyword.trim();
    if (!kw) return points;
    return points.filter(
      (p) => p.county.includes(kw) || p.town.includes(kw) || p.village.includes(kw),
    );
  }, [points, keyword]);

  const highRiskCount = useMemo(
    () => points.filter((p) => (p.biLv ?? 0) >= 5).length,
    [points],
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="mb-2 text-3xl font-bold text-neutral-800 dark:text-slate-100 md:text-4xl">
          🦟 登革熱病媒蚊密度地圖
        </h1>
        <p className="text-neutral-600 dark:text-slate-300">
          整合衛生福利部疾病管制署「近12個月登革熱病媒蚊調查資料」，於地圖上查詢全台村里級布氏指數
          (BI)、住宅指數 (HI)、容器指數 (CI)、幼蟲指數 (LI) 與成蟲指數 (AI)。
        </p>
      </div>

      {/* Data freshness + disclaimer */}
      <div className="rounded-2xl border border-amber-200/80 bg-amber-50/60 p-4 text-xs leading-relaxed text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
        <p className="font-semibold">
          資料更新時間：{loading ? "載入中…" : formatUpdatedAt(updatedAt)}
        </p>
        <p className="mt-1">
          本頁資料為疾病管制署病媒蚊密度調查之村里最新一筆記錄，非每日全面普查（部分村里可能較久未更新）；實際登革熱疫情與噴藥防治措施，請以地方政府衛生局正式公告為準。
        </p>
      </div>

      {/* Search + legend */}
      <div className="flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
        <input
          type="text"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="搜尋縣市／鄉鎮市區／村里"
          className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-800 focus:border-indigo-400 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 sm:max-w-xs"
        />
        <div className="flex flex-wrap items-center gap-2.5 text-[11px] text-neutral-600 dark:text-slate-300">
          <span className="font-semibold text-neutral-700 dark:text-slate-200">布氏指數(BI)分級：</span>
          {LEGEND.map((l) => (
            <span key={l.lv} className="flex items-center gap-1">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: l.color }}
                aria-hidden="true"
              />
              {l.label}
            </span>
          ))}
        </div>
      </div>

      {highRiskCount > 0 && !loading && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-medium text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          目前全台有 {highRiskCount} 個村里布氏指數達 5 級以上，密度偏高，外出活動請加強防蚊措施。
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Map */}
      <div className="h-[60vh] min-h-[420px] w-full overflow-hidden rounded-2xl border border-neutral-200 dark:border-slate-800">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <LoadingOrb />
          </div>
        ) : (
          <DengueMosquitoMapLeaflet points={filteredPoints} userLocation={location} />
        )}
      </div>
    </div>
  );
}
