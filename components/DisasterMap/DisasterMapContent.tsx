"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import LoadingOrb from "@/components/ui/LoadingOrb";
import type { DisasterLayer } from "@/lib/server/disaster/ingestDisasterPoints";
import type { DisasterPoint } from "@/lib/server/disaster/queries";

const DisasterMapLeaflet = dynamic(() => import("@/components/DisasterMap/DisasterMapLeaflet"), { ssr: false });

interface LayerConfig {
  layer: DisasterLayer;
  label: string;
  emoji: string;
  color: string;
  defaultOn: boolean;
}

const LAYERS: LayerConfig[] = [
  { layer: "shelter", label: "避難收容處所", emoji: "🏫", color: "#16a34a", defaultOn: true },
  { layer: "rescue_unit", label: "消防救援單位", emoji: "🚒", color: "#dc2626", defaultOn: false },
  { layer: "eoc_center", label: "應變中心", emoji: "🏢", color: "#2563eb", defaultOn: false },
];

interface ApiResponse {
  ok: boolean;
  points?: DisasterPoint[];
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

export default function DisasterMapContent() {
  const [points, setPoints] = useState<DisasterPoint[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visibleLayers, setVisibleLayers] = useState<Record<DisasterLayer, boolean>>(() =>
    Object.fromEntries(LAYERS.map((l) => [l.layer, l.defaultOn])) as Record<DisasterLayer, boolean>,
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/disaster-map");
        const json: ApiResponse = await res.json();
        if (cancelled) return;
        if (!json.ok) {
          setError(json.error || "資料載入失敗");
        } else {
          setPoints(json.points ?? []);
          setUpdatedAt(json.updatedAt ?? null);
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

  const countsByLayer = useMemo(() => {
    const counts: Record<DisasterLayer, number> = { shelter: 0, rescue_unit: 0, eoc_center: 0 };
    for (const p of points) counts[p.layer] += 1;
    return counts;
  }, [points]);

  const visiblePoints = useMemo(
    () => points.filter((p) => visibleLayers[p.layer]),
    [points, visibleLayers],
  );

  const toggleLayer = (layer: DisasterLayer) =>
    setVisibleLayers((prev) => ({ ...prev, [layer]: !prev[layer] }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="mb-2 text-3xl font-bold text-neutral-800 dark:text-slate-100 md:text-4xl">
          🆘 防災地圖
        </h1>
        <p className="text-neutral-600 dark:text-slate-300">
          整合內政部開放資料：避難收容處所、消防救援單位與縣市應變中心點位，可切換圖層查詢地點詳細資訊。
        </p>
      </div>

      {/* Data freshness + disclaimer — required prominently at the top of the page (issue #168) */}
      <div className="rounded-2xl border border-amber-200/80 bg-amber-50/60 p-4 text-xs leading-relaxed text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
        <p className="font-semibold">
          資料更新時間：{loading ? "載入中…" : formatUpdatedAt(updatedAt)}
        </p>
        <p className="mt-1">
          本頁資料非即時，僅供平時查詢參考；災害發生時之避難收容所開設狀態，請以地方政府（消防局／區公所）正式公告為準。
        </p>
      </div>

      {/* Layer toggles */}
      <div className="flex flex-wrap gap-3 rounded-2xl border border-neutral-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
        {LAYERS.map((l) => (
          <label
            key={l.layer}
            className="flex cursor-pointer items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <input
              type="checkbox"
              checked={visibleLayers[l.layer]}
              onChange={() => toggleLayer(l.layer)}
              className="h-4 w-4 rounded border-neutral-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span aria-hidden="true">{l.emoji}</span>
            <span>{l.label}</span>
            <span
              className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold text-white"
              style={{ backgroundColor: l.color }}
            >
              {countsByLayer[l.layer]}
            </span>
          </label>
        ))}
      </div>

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
          <DisasterMapLeaflet points={visiblePoints} />
        )}
      </div>
    </div>
  );
}
