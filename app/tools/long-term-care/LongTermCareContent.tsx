"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useGeolocation } from "@/components/Facilities/useGeolocation";
import type { MapMarker } from "@/components/Facilities/FacilityMap";

const FacilityMap = dynamic(() => import("@/components/Facilities/FacilityMap"), { ssr: false });

interface FacilityItem {
  id: number;
  name: string;
  address: string | null;
  phone: string | null;
  lat: number | null;
  lng: number | null;
  service_item: string | null;
  service_time: string | null;
  data_org: string | null;
}

export default function LongTermCareContent() {
  const location = useGeolocation();
  const [facilities, setFacilities] = useState<FacilityItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (location.loading) return;
    let cancelled = false;
    setLoading(true);
    setError(false);

    const params = new URLSearchParams({
      type: "long_term_care",
      lat: String(location.lat),
      lng: String(location.lng),
      radius: "10000",
    });

    fetch(`/api/facilities?${params.toString()}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setFacilities(data.facilities);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [location.loading, location.lat, location.lng]);

  const markers: MapMarker[] = (facilities ?? [])
    .filter((f): f is FacilityItem & { lat: number; lng: number } => f.lat !== null && f.lng !== null)
    .map((f) => ({ id: String(f.id), lat: f.lat, lng: f.lng, name: f.name, address: f.address, phone: f.phone }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-2 text-3xl font-bold text-neutral-800 md:text-4xl">🏡 長照機構查詢</h1>
        <p className="text-neutral-600">依您目前位置查詢附近的居家式長期照顧服務機構（目前僅收錄高雄市資料）。</p>
      </div>

      {location.isDefault && !location.loading && <p className="text-xs text-neutral-500">⚠️ 無法取得您的定位，目前顯示以台北市政府為中心的預設範圍。</p>}

      {(loading || location.loading) && (
        <div className="flex justify-center py-8">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )}

      {error && <div className="rounded-none bg-red-50 p-4 text-sm text-red-700">查詢機構資料失敗，請稍後再試。</div>}

      {!loading && !location.loading && !error && facilities && (
        <>
          <div className="h-[400px] overflow-hidden rounded-none border border-neutral-200">
            <FacilityMap userLocation={location} markers={markers} radiusMeters={10000} />
          </div>

          {facilities.length === 0 ? (
            <p className="py-8 text-center text-neutral-500">附近 10 公里內查無收錄的長照機構。</p>
          ) : (
            <div className="space-y-3">
              {facilities.map((f) => (
                <div key={f.id} className="rounded-none border border-neutral-200 p-4">
                  <p className="font-semibold text-neutral-800">{f.name}</p>
                  {f.address && <p className="mt-1 text-sm text-neutral-600">{f.address}</p>}
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-500">
                    {f.phone && <span>📞 {f.phone}</span>}
                    {f.service_item && <span>服務項目：{f.service_item}</span>}
                    {f.service_time && <span>服務時間：{f.service_time}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <p className="text-xs text-neutral-500">資料來源：高雄市政府社會局開放資料。收錄範圍持續擴充中。</p>
    </div>
  );
}
