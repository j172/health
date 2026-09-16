"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import LoadingOrb from "@/components/ui/LoadingOrb";
import type { DisasterLayer } from "@/lib/server/disaster/ingestDisasterPoints";
import type { DisasterPoint } from "@/lib/server/disaster/queries";

import { useGeolocation } from "@/components/Facilities/useGeolocation";
import type { InundationPoint } from "@/lib/server/wra/inundation";
import type { DamStructureMapPoint } from "@/lib/server/wra/damStructureQueries";
import type { GroundwaterMapPoint } from "@/lib/server/wra/groundwaterQueries";
import type { InundationRegion } from "@/lib/server/wra/fetchInundationRegions";

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
  const location = useGeolocation();
  const [points, setPoints] = useState<DisasterPoint[]>([]);
  const [inundationPoints, setInundationPoints] = useState<InundationPoint[]>([]);
  const [showInundation, setShowInundation] = useState(true);
  const [damStructurePoints, setDamStructurePoints] = useState<DamStructureMapPoint[]>([]);
  const [groundwaterPoints, setGroundwaterPoints] = useState<GroundwaterMapPoint[]>([]);
  const [inundationRegions, setInundationRegions] = useState<InundationRegion[]>([]);
  const [showDamStructure, setShowDamStructure] = useState(false);
  const [showGroundwater, setShowGroundwater] = useState(false);
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
        const [disasterRes, inundationRes, wraIotRes] = await Promise.allSettled([
          fetch("/api/disaster-map").then((r) => r.json()),
          fetch("/api/disaster/inundation").then((r) => r.json()),
          fetch("/api/disaster/wra-iot").then((r) => r.json()),
        ]);

        if (cancelled) return;

        if (disasterRes.status === "fulfilled" && disasterRes.value.ok) {
          setPoints(disasterRes.value.points ?? []);
          setUpdatedAt(disasterRes.value.updatedAt ?? null);
        } else if (disasterRes.status === "fulfilled" && !disasterRes.value.ok) {
          setError(disasterRes.value.error || "防災點位資料載入失敗");
        }

        if (inundationRes.status === "fulfilled" && inundationRes.value.ok) {
          setInundationPoints(inundationRes.value.points ?? []);
        }

        if (wraIotRes.status === "fulfilled" && wraIotRes.value.ok) {
          setDamStructurePoints(wraIotRes.value.damStructurePoints ?? []);
          setGroundwaterPoints(wraIotRes.value.groundwaterPoints ?? []);
          setInundationRegions(wraIotRes.value.inundationRegions ?? []);
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
          整合內政部開放資料（避難收容處所、消防救援單位、縣市應變中心）與經濟部水利署即時水情／水資源物聯網（河川水位警戒、堤防安全監測、地下水位），可切換圖層查詢地點詳細資訊。
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

      {/* 導流至全台積淹水即時感測地圖 */}
      <div className="rounded-xl bg-gradient-to-r from-sky-50 to-blue-50 dark:from-slate-800 dark:to-blue-950/40 p-4 border border-sky-100 dark:border-slate-700 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="text-xl">🌊</span>
          <div>
            <div className="text-xs font-bold text-sky-950 dark:text-sky-300">需要查詢地下道與道路積水即時深度？</div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">水利署 IoT 即時路面感測地圖已上線，提供全台易積水路口公分級水深與防汛警戒</div>
          </div>
        </div>
        <Link
          href="/tools/inundation-map"
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold whitespace-nowrap transition shadow-sm"
        >
          <span>查看淹水感測地圖</span>
          <span>→</span>
        </Link>
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

        <label
          className="flex cursor-pointer items-center gap-2 rounded-lg border border-sky-200 bg-sky-50/50 px-3 py-2 text-sm font-medium text-sky-800 transition-colors hover:bg-sky-100/60 dark:border-sky-800/60 dark:bg-sky-950/30 dark:text-sky-200 dark:hover:bg-sky-900/40"
        >
          <input
            type="checkbox"
            checked={showInundation}
            onChange={() => setShowInundation(!showInundation)}
            className="h-4 w-4 rounded border-sky-300 text-sky-600 focus:ring-sky-500"
          />
          <span aria-hidden="true">🌊</span>
          <span>即時路面積淹水警戒</span>
          <span className="rounded-full bg-sky-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
            {inundationPoints.length}
          </span>
        </label>

        {/* 水利署水資源物聯網 (iot.wra.gov.tw) 即時圖層 — 堤防安全監測、地下水位 (issue #270) */}
        <label
          className="flex cursor-pointer items-center gap-2 rounded-lg border border-amber-200 bg-amber-50/50 px-3 py-2 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-100/60 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-200 dark:hover:bg-amber-900/40"
        >
          <input
            type="checkbox"
            checked={showDamStructure}
            onChange={() => setShowDamStructure(!showDamStructure)}
            className="h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
          />
          <span aria-hidden="true">🧱</span>
          <span>堤防安全監測</span>
          <span className="rounded-full bg-amber-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
            {damStructurePoints.length}
          </span>
        </label>

        <label
          className="flex cursor-pointer items-center gap-2 rounded-lg border border-teal-200 bg-teal-50/50 px-3 py-2 text-sm font-medium text-teal-800 transition-colors hover:bg-teal-100/60 dark:border-teal-800/60 dark:bg-teal-950/30 dark:text-teal-200 dark:hover:bg-teal-900/40"
        >
          <input
            type="checkbox"
            checked={showGroundwater}
            onChange={() => setShowGroundwater(!showGroundwater)}
            className="h-4 w-4 rounded border-teal-300 text-teal-600 focus:ring-teal-500"
          />
          <span aria-hidden="true">💧</span>
          <span>地下水位</span>
          <span className="rounded-full bg-teal-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
            {groundwaterPoints.length}
          </span>
        </label>
      </div>

      {inundationRegions.length > 0 && (
        <p className="text-xs text-neutral-500 dark:text-slate-400">
          即時淹水範圍圖（水利署水資源物聯網）目前有資料的縣市：
          {inundationRegions.map((r) => r.label).join("、")}
          　— 尚未提供地圖疊圖，僅供參考是否有範圍圖可查。
        </p>
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
          <DisasterMapLeaflet
            points={visiblePoints}
            inundationPoints={showInundation ? inundationPoints : []}
            damStructurePoints={showDamStructure ? damStructurePoints : []}
            groundwaterPoints={showGroundwater ? groundwaterPoints : []}
            userLocation={location}
          />
        )}
      </div>
    </div>
  );
}
