"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import seedData from "@/data/medical-violators-seed.json";

export interface ViolatorLink {
  title: string;
  url: string;
  type: "judgment" | "disciplinary" | "other";
}

export interface ViolatorItem {
  id: string;
  name: string;
  category: string;
  categoryCode: string;
  specialty: string;
  city: string;
  status: "執業中" | "歇業" | "已廢證" | string;
  licenseMasked: string;
  disposition: string;
  links: ViolatorLink[];
}

interface MedicalViolatorsContentProps {
  initialData?: {
    metadata: {
      source: string;
      sourceUrl: string;
      lastSyncedAt: string;
      totalCount: number;
      note: string;
    };
    data: ViolatorItem[];
  };
}

export default function MedicalViolatorsContent({
  initialData = seedData as any,
}: MedicalViolatorsContentProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedCity, setSelectedCity] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");

  const records: ViolatorItem[] = initialData?.data || [];
  const metadata = initialData?.metadata;

  // Extract unique categories
  const categories = useMemo(() => {
    const map = new Map<string, number>();
    records.forEach((r) => {
      map.set(r.category, (map.get(r.category) || 0) + 1);
    });
    return Array.from(map.entries()).map(([name, count]) => ({ name, count }));
  }, [records]);

  // Extract unique cities (excluding "歇業", "已廢證" which are statuses)
  const cities = useMemo(() => {
    const set = new Set<string>();
    records.forEach((r) => {
      if (r.city && r.city !== "歇業" && r.city !== "已廢證" && r.city !== "未載明") {
        set.add(r.city);
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "zh-Hant"));
  }, [records]);

  // Filtered list
  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      // Category filter
      if (selectedCategory !== "all" && r.category !== selectedCategory) {
        return false;
      }
      // City filter
      if (selectedCity !== "all" && r.city !== selectedCity) {
        return false;
      }
      // Status filter
      if (selectedStatus !== "all" && r.status !== selectedStatus) {
        return false;
      }
      // Search term
      if (searchTerm.trim()) {
        const query = searchTerm.trim().toLowerCase();
        const matchName = r.name.toLowerCase().includes(query);
        const matchSpecialty = r.specialty.toLowerCase().includes(query);
        const matchCity = r.city.toLowerCase().includes(query);
        const matchLicense = r.licenseMasked.toLowerCase().includes(query);
        const matchCategory = r.category.toLowerCase().includes(query);
        if (!matchName && !matchSpecialty && !matchCity && !matchLicense && !matchCategory) {
          return false;
        }
      }
      return true;
    });
  }, [records, selectedCategory, selectedCity, selectedStatus, searchTerm]);

  return (
    <div className="space-y-6">
      {/* Official Alert & Notice Banner */}
      <div className="rounded-2xl border border-rose-200 bg-linear-to-r from-rose-50/70 via-white to-amber-50/40 p-5 shadow-xs dark:border-rose-900/50 dark:bg-linear-to-r dark:from-rose-950/30 dark:via-slate-900 dark:to-slate-850">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="text-2xl" aria-hidden="true">
              🛡️
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  就醫安全查核說明與法律依據
                </h2>
                <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-700 dark:bg-rose-900/60 dark:text-rose-300">
                  公益必要公開
                </span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                本專區資料同步自
                <strong>衛生福利部「醫事人員性別事件資訊專區」</strong>
                ，符合個人資料保護法第 16 條但書第 2 款「增進公共利益所必要」之規定。
                收錄現以 112 年性平三法修正迄今經司法裁判確定或醫懲會處分確定之醫事人員案件為主。
              </p>
            </div>
          </div>
          <div className="shrink-0">
            <a
              href="https://ma.mohw.gov.tw/Accessibility/VIOSearch/MASearchVIO"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 shadow-2xs hover:bg-rose-50 transition-colors dark:border-rose-800 dark:bg-slate-800 dark:text-rose-300 dark:hover:bg-slate-700"
            >
              <span>衛福部官方專區</span>
              <span aria-hidden="true">↗</span>
            </a>
          </div>
        </div>
      </div>

      {/* Filter and Search Workbench */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900 space-y-4">
        {/* Search input + City dropdown + Status dropdown */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
          <div className="sm:col-span-6 relative">
            <label htmlFor="search-input" className="sr-only">
              搜尋姓名、專科或證書號
            </label>
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>
            <input
              id="search-input"
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="搜尋姓名（如孔繁錦）、專科（婦產科）、縣市或字號..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50/70 py-2.5 pl-9 pr-3 text-xs text-slate-900 placeholder-slate-400 focus:border-rose-500 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-rose-500/20 dark:border-slate-700 dark:bg-slate-850 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:border-rose-400"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                aria-label="清除搜尋關鍵字"
              >
                ✕
              </button>
            )}
          </div>

          <div className="sm:col-span-3">
            <label htmlFor="city-select" className="sr-only">
              選擇縣市
            </label>
            <select
              id="city-select"
              value={selectedCity}
              onChange={(e) => setSelectedCity(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/70 py-2.5 px-3 text-xs text-slate-800 focus:border-rose-500 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-rose-500/20 dark:border-slate-700 dark:bg-slate-850 dark:text-slate-200"
            >
              <option value="all">全部執業縣市</option>
              {cities.map((city) => (
                <option key={city} value={city}>
                  {city}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-3">
            <label htmlFor="status-select" className="sr-only">
              選擇執業狀態
            </label>
            <select
              id="status-select"
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/70 py-2.5 px-3 text-xs text-slate-800 focus:border-rose-500 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-rose-500/20 dark:border-slate-700 dark:bg-slate-850 dark:text-slate-200"
            >
              <option value="all">全部執業狀態</option>
              <option value="執業中">執業中</option>
              <option value="歇業">歇業</option>
              <option value="已廢證">已廢證</option>
            </select>
          </div>
        </div>

        {/* Category Pills */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-100 dark:border-slate-800">
          <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 mr-1">
            人員類別：
          </span>
          <button
            type="button"
            onClick={() => setSelectedCategory("all")}
            className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
              selectedCategory === "all"
                ? "bg-rose-600 text-white shadow-2xs dark:bg-rose-500"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            }`}
          >
            全部 ({records.length})
          </button>
          {categories.map((cat) => (
            <button
              key={cat.name}
              type="button"
              onClick={() => setSelectedCategory(cat.name)}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                selectedCategory === cat.name
                  ? "bg-rose-600 text-white shadow-2xs dark:bg-rose-500"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              }`}
            >
              {cat.name} ({cat.count})
            </button>
          ))}
        </div>
      </div>

      {/* Results Header */}
      <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 px-1">
        <div>
          <span>查詢結果：共 </span>
          <span className="font-bold text-rose-600 dark:text-rose-400">
            {filteredRecords.length}
          </span>
          <span> 筆違法事件確定案件紀錄</span>
        </div>
        {metadata?.lastSyncedAt && (
          <span className="text-[11px] text-slate-600 dark:text-slate-400">
            資料更新：{new Date(metadata.lastSyncedAt).toLocaleDateString("zh-TW")}
          </span>
        )}
      </div>

      {/* Records Cards Grid */}
      {filteredRecords.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center dark:border-slate-800 dark:bg-slate-900">
          <p className="text-3xl mb-2" aria-hidden="true">
            🔍
          </p>
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
            未找到符合條件的醫事人員案件紀錄
          </h3>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
            請嘗試調整搜尋關鍵字，或清除篩選類別條件。
          </p>
          <button
            type="button"
            onClick={() => {
              setSearchTerm("");
              setSelectedCategory("all");
              setSelectedCity("all");
              setSelectedStatus("all");
            }}
            className="mt-4 inline-flex items-center rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            重置所有篩選
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredRecords.map((item) => {
            const isRevoked = item.status === "已廢證";
            const isClosed = item.status === "歇業";
            const isActive = !isRevoked && !isClosed;

            return (
              <div
                key={item.id}
                className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-xs transition-shadow hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
              >
                <div>
                  {/* Card Header: Category & Status */}
                  <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2.5 dark:border-slate-800/80">
                    <span className="inline-flex items-center rounded-md bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                      {item.category}
                    </span>
                    <span
                      className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                        isRevoked
                          ? "bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300"
                          : isClosed
                          ? "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                          : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                      }`}
                    >
                      {item.status}
                    </span>
                  </div>

                  {/* Name and Basic Info */}
                  <div className="mt-3">
                    <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                      {item.name}
                    </h3>
                    <div className="mt-2 space-y-1 text-xs text-slate-600 dark:text-slate-400">
                      {item.specialty && item.specialty !== "未登錄專科" && (
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-slate-600 dark:text-slate-400">
                            專科別：
                          </span>
                          <span className="font-medium text-slate-800 dark:text-slate-200">
                            {item.specialty}
                          </span>
                        </div>
                      )}
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-slate-600 dark:text-slate-400">
                          執業縣市：
                        </span>
                        <span className="font-medium text-slate-800 dark:text-slate-200">
                          {item.city}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-slate-600 dark:text-slate-400">
                          證書字號：
                        </span>
                        <span className="font-mono text-slate-600 dark:text-slate-400">
                          {item.licenseMasked}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Case Links and Disciplinary Records */}
                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
                    案件資訊／處分書：
                  </div>
                  {item.links && item.links.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {item.links.map((link, idx) => (
                        <a
                          key={idx}
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 transition-colors dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-rose-800 dark:hover:bg-slate-750 dark:hover:text-rose-300"
                        >
                          <span aria-hidden="true">
                            {link.type === "judgment" ? "⚖️" : "📄"}
                          </span>
                          <span>{link.title}</span>
                          <span className="text-[10px]" aria-hidden="true">
                            ↗
                          </span>
                        </a>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-slate-600 dark:text-slate-400">
                      {item.disposition || "已確定案件"}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Cross-linking to Clinics and Health Safety */}
      <div className="mt-8 rounded-2xl border border-indigo-100 bg-linear-to-r from-indigo-50/60 via-white to-slate-50 p-5 dark:border-indigo-950 dark:bg-linear-to-r dark:from-indigo-950/20 dark:via-slate-900 dark:to-slate-850">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl" aria-hidden="true">
              🏥
            </span>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                尋找安心醫療資源與全臺診所查詢
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                除主動查核醫事人員名單外，可透過站內診所查詢掌握各科診所詳細地址、科別與電話資訊。
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/tools/clinics"
              className="inline-flex items-center gap-1 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-indigo-500 transition-colors dark:bg-indigo-500 dark:hover:bg-indigo-400"
            >
              <span>前往診所查詢</span>
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
