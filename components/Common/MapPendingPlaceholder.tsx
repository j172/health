"use client";

import LoadingOrb from "@/components/ui/LoadingOrb";
import type { SharedGeolocationResult } from "@/lib/hooks/useSharedGeolocation";
import { useLanguage } from "@/app/context/LanguageContext";

/**
 * issue #478（母票 #438 §K）：地圖區塊在還沒有任何可用座標時顯示的佔位畫面
 * ——取代過去「直接用臺北101畫地圖」的做法。`needsManualSelection` 為 true
 * 時（拒絕/逾時/不支援）顯示引導文字（上方 `MapLocationBanner` 已有完整的
 * 手動選擇縣市 UI），其餘情況（idle/locating/awaiting-permission）顯示一般
 * 的讀取中動畫。
 */
export default function MapPendingPlaceholder({
  geolocation,
  className = "",
}: {
  geolocation: SharedGeolocationResult;
  className?: string;
}) {
  const { t } = useLanguage();
  return (
    <div
      className={`flex h-full flex-col items-center justify-center gap-2 bg-slate-50 text-center text-sm text-slate-400 dark:bg-slate-900 dark:text-slate-500 ${className}`}
    >
      {geolocation.needsManualSelection ? (
        <p className="px-6">{t("mapPendingPlaceholder.manualSelectionHint", "請於上方選擇所在縣市，即可顯示地圖")}</p>
      ) : (
        <LoadingOrb />
      )}
    </div>
  );
}
