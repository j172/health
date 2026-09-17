"use client";

import React from "react";
import { useLanguage } from "@/app/context/LanguageContext";
import { appendOutboundUtm } from "@/lib/format/outboundLink";

export interface CivicPartnerItem {
  id: string;
  name: string;
  url: string;
  icon: string;
  badge: string;
  badgeColor: string;
  tag: string;
  description: string;
}

export const CIVIC_PARTNERS: CivicPartnerItem[] = [
  {
    id: "g0v",
    name: "g0v 零時政府",
    url: "https://g0v.tw/intl/zh-TW/",
    icon: "🌐",
    badge: "開源協作",
    badgeColor: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800",
    tag: "公民科技 ‧ 開源參與",
    description: "台灣開源公民科技社群，推動資訊透明、跨界協作黑客松與數位公共治理。",
  },
  {
    id: "kuma",
    name: "黑熊學院",
    url: "https://kuma-academy.org/",
    icon: "🐻",
    badge: "防災守護",
    badgeColor: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800",
    tag: "全社會防衛 ‧ 民防教育",
    description: "推廣普及全民防衛知識、急救訓練與防災應變技能，強化全社會韌性。",
  },
  {
    id: "anti-cw",
    name: "反認知作戰教育網",
    url: "https://cw.yueyuknows.com/",
    icon: "🛡️",
    badge: "媒體素養",
    badgeColor: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800",
    tag: "資訊防衛 ‧ 假訊息辨識",
    description: "彙整資訊戰研究與假訊息辨識技巧，協助公民建立數位免疫力、守護民主。",
  },
  {
    id: "metawilo",
    name: "台灣罪犯圖鑑",
    url: "https://metawilo.com/",
    icon: "⚖️",
    badge: "社會安全",
    badgeColor: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800",
    tag: "兒少保護 ‧ 防範再犯",
    description: "公開揭露性侵害與性騷擾加害者判決紀錄，把羞恥還給加害者，守護下一代安全。",
  },
  {
    id: "council2026",
    name: "2026 政治人物前科",
    url: "https://council2026.taiwangogo.tw/",
    icon: "🏛️",
    badge: "透明監督",
    badgeColor: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800",
    tag: "陽光政治 ‧ 透明監督",
    description: "透明公開台灣議員與縣市長參選人刑事與司法紀錄，促進公眾檢驗與公民政治。",
  },
];

interface CivicPartnersSectionProps {
  className?: string;
  title?: string;
  description?: string;
}

export default function CivicPartnersSection({
  className = "",
  title,
  description,
}: CivicPartnersSectionProps) {
  const { t } = useLanguage();

  const sectionTitle = title || t("civic.sectionTitle", "公民倡議與社會守護");
  const sectionDesc =
    description ||
    t(
      "civic.sectionDesc",
      "攜手在地開源公民科技、全民民防教育、資訊防衛與公眾透明夥伴，共同守護自由開放的台灣社會。"
    );

  return (
    <section
      aria-label={sectionTitle}
      className={`relative mt-14 overflow-hidden rounded-3xl border border-slate-200/90 bg-linear-to-b from-white to-slate-50/80 p-6 sm:p-8 lg:p-10 shadow-xs dark:border-slate-800 dark:from-slate-900 dark:to-slate-950 ${className}`}
    >
      {/* Decorative ambient background accent */}
      <div
        className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-indigo-500/5 blur-3xl dark:bg-indigo-500/10"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-emerald-500/5 blur-3xl dark:bg-emerald-500/10"
        aria-hidden="true"
      />

      {/* Header */}
      <div className="relative z-10 mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 border-b border-slate-100 pb-5 dark:border-slate-800/80">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-sm dark:bg-indigo-950 dark:text-indigo-300">
              🤝
            </span>
            <h2 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl dark:text-slate-100">
              {sectionTitle}
            </h2>
          </div>
          <p className="mt-2 text-xs sm:text-sm text-slate-600 dark:text-slate-400 max-w-3xl leading-relaxed">
            {sectionDesc}
          </p>
        </div>
        <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
          5 個友善公民組織與專案
        </span>
      </div>

      {/* Partners Grid */}
      <div className="relative z-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {CIVIC_PARTNERS.map((partner) => (
          <a
            key={partner.id}
            href={appendOutboundUtm(partner.url, {
              medium: "civic_partner",
              campaign: "civic_alliance",
            })}
            target="_blank"
            rel="noreferrer noopener"
            className="group flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-white/90 p-4.5 shadow-2xs backdrop-blur-xs transition-all duration-200 hover:-translate-y-1 hover:border-indigo-400 hover:shadow-md dark:border-slate-800/90 dark:bg-slate-900/90 dark:hover:border-indigo-600"
          >
            <div>
              {/* Top Row: Icon & Badge */}
              <div className="flex items-center justify-between gap-2">
                <span className="text-2xl transition-transform duration-200 group-hover:scale-110">
                  {partner.icon}
                </span>
                <span
                  className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold ${partner.badgeColor}`}
                >
                  {partner.badge}
                </span>
              </div>

              {/* Title & Tag */}
              <h3 className="mt-3 text-sm font-extrabold text-slate-900 transition-colors group-hover:text-indigo-600 dark:text-slate-100 dark:group-hover:text-indigo-400">
                {partner.name}
              </h3>
              <p className="mt-0.5 text-[11px] font-medium text-slate-600 dark:text-slate-400">
                {partner.tag}
              </p>

              {/* Description */}
              <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400 line-clamp-3">
                {partner.description}
              </p>
            </div>

            {/* Action Footer */}
            <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-2.5 text-[11px] font-bold text-slate-700 transition-colors group-hover:text-indigo-600 dark:border-slate-800 dark:text-slate-300 dark:group-hover:text-indigo-400">
              <span>前往網站</span>
              <span className="transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5">
                ↗
              </span>
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}
