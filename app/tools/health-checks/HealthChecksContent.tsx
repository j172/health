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
}

export default function HealthChecksContent() {
  const location = useGeolocation();
  const [keyword, setKeyword] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [facilities, setFacilities] = useState<FacilityItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (location.loading) return;
    let cancelled = false;
    setLoading(true);
    setError(false);

    const params = new URLSearchParams({ type: "health_check" });
    if (keyword) {
      params.set("keyword", keyword);
    } else {
      params.set("lat", String(location.lat));
      params.set("lng", String(location.lng));
      params.set("radius", "10000");
    }

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
  }, [location.loading, location.lat, location.lng, keyword]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setKeyword(searchInput.trim());
  };

  const geocoded = (facilities ?? []).filter((f): f is FacilityItem & { lat: number; lng: number } => f.lat !== null && f.lng !== null);
  const markers: MapMarker[] = geocoded.map((f) => ({ id: String(f.id), lat: f.lat, lng: f.lng, name: f.name, address: f.address, phone: f.phone }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-2 text-3xl font-bold text-neutral-800 md:text-4xl">🩻 健康檢查機構查詢</h1>
        <p className="text-neutral-600">查詢勞工健康檢查認可醫療機構及職業傷病防治網絡醫院。資料來源：勞動部。</p>
        <p className="mt-1 text-xs text-neutral-500">⚠️ 老人免費健檢機構資料源目前無法連線，暫未收錄。</p>
      </div>

      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="輸入機構名稱或縣市關鍵字"
          className="flex-1 rounded-none border border-neutral-300 bg-white px-4 py-2.5 text-sm text-neutral-800 focus:border-primary focus:outline-none"
        />
        <button type="submit" className="rounded-none bg-primary px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primaryho">
          搜尋
        </button>
        {keyword && (
          <button
            type="button"
            onClick={() => {
              setKeyword("");
              setSearchInput("");
            }}
            className="rounded-none border border-neutral-300 px-4 py-2.5 text-sm text-neutral-600 hover:bg-neutral-50"
          >
            清除
          </button>
        )}
      </form>

      {(loading || location.loading) && (
        <div className="flex justify-center py-8">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )}

      {error && <div className="rounded-none bg-red-50 p-4 text-sm text-red-700">查詢機構資料失敗，請稍後再試。</div>}

      {!loading && !location.loading && !error && facilities && (
        <>
          {markers.length > 0 && (
            <div className="h-[400px] overflow-hidden rounded-none border border-neutral-200">
              <FacilityMap userLocation={location} markers={markers} radiusMeters={10000} showRadius={!keyword} />
            </div>
          )}

          {facilities.length === 0 ? (
            <p className="py-8 text-center text-neutral-500">{keyword ? "查無符合的機構。" : "附近查無已定位的機構，可改用關鍵字搜尋。"}</p>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-neutral-500">共 {facilities.length} 筆</p>
              {facilities.map((f) => (
                <div key={f.id} className="rounded-none border border-neutral-200 p-4">
                  <p className="font-semibold text-neutral-800">{f.name}</p>
                  {f.address && <p className="mt-1 text-sm text-neutral-600">{f.address}</p>}
                  {f.phone && <p className="mt-1 text-xs text-neutral-500">📞 {f.phone}</p>}
                  {f.service_item && <p className="mt-1 text-xs text-neutral-500">認可項目：{f.service_item}</p>}
                  {f.lat === null && <p className="mt-1 text-xs text-neutral-400">（尚未完成地理定位，暫不顯示於地圖）</p>}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
