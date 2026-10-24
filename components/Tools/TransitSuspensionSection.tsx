import Link from "next/link";
import { TRANSIT_EMERGENCY_HOTLINES } from "@/lib/transit/disasterHotlines";

interface TransitSuspensionSectionProps {
  locale?: string;
  pushMode?: string;
}

export default function TransitSuspensionSection({ locale = "zh", pushMode = "mqtt_live" }: TransitSuspensionSectionProps) {
  const isEn = locale === "en";
  const isJa = locale === "ja";
  const isKo = locale === "ko";

  const title = isEn
    ? "Railway & Transit Suspensions & Emergency Hotlines"
    : isJa
    ? "鉄道と公共交通機関の運行停止と緊急連絡先"
    : isKo
    ? "철도 및 대중교통 운행 중단과 긴급 고객센터"
    : "查詢鐵路與大眾運輸停駛與緊急專線";

  const description = isEn
    ? "During severe weather or earthquakes, Taiwan Railway, High Speed Rail, and metro systems may suspend or reduce service. Verify live transit disruption notices and contact official hotlines for ticket refund assistance."
    : isJa
    ? "台風や強い地震の際、台湾鉄道、高鉄、各地下鉄は減便・徐行・運休を実施することがあります。リアルタイムの運行通報を確認し、公式ホットラインで払い戻し手続きを確認できます。"
    : isKo
    ? "태풍이나 강진 발생 시 대만철도, 고속철도, 각 지하철 시스템은 감차, 서행, 운행 중단을 시행할 수 있습니다. 실시간 운행 지연 및 중단 공고를 확인하고 공식 고객센터를 통해 환불 절차를 안내받으세요."
    : "颱風豪雨或地震災防期間，臺鐵、高鐵與各都會捷運常依風雨級別或巡軌檢修啟動減班、慢行或全線停駛。即時掌握雙鐵與捷運營運通報，避免外出受困滯留車站；緊急諮詢可利用官方客服專線確認退票與接駁措施。";

  const isFallback = pushMode === "rest_fallback";

  const badgeLive = isFallback
    ? isEn
      ? "Scheduled Polling Fallback"
      : isJa
      ? "定期同期 (排程備援)"
      : isKo
      ? "정기 동기화 (예비)"
      : "🟡 官方定時同步 (排程備援)"
    : isEn
    ? "Live Push (MQTTS)"
    : isJa
    ? "即時配信 (MQTTS)"
    : isKo
    ? "실시간 푸시 (MQTTS)"
    : "🟢 即時推播 (MQTTS)";

  const badgeScope = isEn
    ? "TRA / THSR / Metro Disruption Alerts"
    : isJa
    ? "台鉄・高鉄・地下鉄 運行通報"
    : isKo
    ? "대만철도 / 고속철도 / 지하철 운행 공고"
    : "雙鐵與捷運營運通報";

  const actionText = isEn
    ? "View Live Transit Disruption Dashboard →"
    : isJa
    ? "交通機関の即時運行通報看板を見る →"
    : isKo
    ? "대중교통 실시간 운행 통보 대시보드 바로가기 →"
    : "前往全台無障礙交通即時通阻看板 →";

  const transitHref = locale === "zh" || !locale ? "/tools/accessible-transit" : `/${locale}/tools/accessible-transit`;

  return (
    <section
      className="my-8 rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/70 via-white to-slate-50 p-6 shadow-xs dark:border-indigo-900/40 dark:from-slate-900 dark:via-slate-900 dark:to-indigo-950/20"
      aria-labelledby="transit-suspension-heading"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xl" aria-hidden="true">🚆</span>
          <h2
            id="transit-suspension-heading"
            className="text-base font-bold text-slate-900 dark:text-slate-100"
          >
            {title}
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {isFallback ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
              <span>{badgeLive}</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>{badgeLive}</span>
            </span>
          )}
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 font-medium">
            {badgeScope}
          </span>
        </div>
      </div>

      <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400 mb-5">
        {description}
      </p>

      {/* Emergency Hotlines Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
        {TRANSIT_EMERGENCY_HOTLINES.map((hotline) => (
          <div
            key={hotline.operator}
            className="rounded-xl border border-slate-200/80 bg-white/90 p-3.5 shadow-2xs dark:border-slate-800 dark:bg-slate-850"
          >
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="font-bold text-xs text-slate-900 dark:text-slate-100">
                {isEn ? hotline.nameEn : hotline.nameZh}
              </span>
              <span className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400">
                {hotline.operator}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-2.5">
              {isEn ? hotline.descriptionEn : hotline.descriptionZh}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {hotline.phones.map((phone) => (
                <a
                  key={phone.number}
                  href={phone.telUri}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-100 hover:bg-indigo-50 text-slate-800 hover:text-indigo-700 dark:bg-slate-800 dark:hover:bg-indigo-950 dark:text-slate-200 dark:hover:text-indigo-300 text-xs font-semibold transition border border-slate-200/80 dark:border-slate-700"
                  aria-label={`撥打 ${isEn ? hotline.nameEn : hotline.nameZh} 客服電話 ${phone.number}`}
                >
                  <span aria-hidden="true">📞</span>
                  <span>{phone.number}</span>
                  {phone.label && (
                    <span className="text-[10px] font-normal text-slate-500 dark:text-slate-400">
                      ({isEn ? phone.labelEn || phone.label : phone.label})
                    </span>
                  )}
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-slate-200/70 dark:border-slate-800 pt-3 flex items-center justify-between">
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {isEn ? "Data Source: MOTC TDX" : "資料來源：交通部 TDX"}
        </span>
        <Link
          href={transitHref}
          className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 transition"
        >
          <span>{actionText}</span>
        </Link>
      </div>
    </section>
  );
}
