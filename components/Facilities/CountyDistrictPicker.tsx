"use client";

import React, { useMemo } from "react";
import {
  TAIWAN_COUNTIES,
  getDistrictsForCounty,
} from "@/lib/constants/taiwanDistricts";

export interface CountyDistrictPickerProps {
  county: string;
  district: string;
  onCountyChange: (county: string) => void;
  onDistrictChange: (district: string) => void;
  disabled?: boolean;
  className?: string;
}

export default function CountyDistrictPicker({
  county,
  district,
  onCountyChange,
  onDistrictChange,
  disabled = false,
  className = "",
}: CountyDistrictPickerProps) {
  const districts = useMemo(() => {
    return getDistrictsForCounty(county);
  }, [county]);

  const handleCountyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newCounty = e.target.value;
    onCountyChange(newCounty);
    // Reset district when county changes
    onDistrictChange("");
  };

  const handleDistrictChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onDistrictChange(e.target.value);
  };

  const handleClear = () => {
    onCountyChange("");
    onDistrictChange("");
  };

  const selectClass =
    "rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 shadow-xs transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {/* 縣市選單 */}
      <div className="relative flex-1 min-w-[130px]">
        <select
          value={county}
          onChange={handleCountyChange}
          disabled={disabled}
          aria-label="選擇縣市"
          className={`w-full ${selectClass}`}
        >
          <option value="">全台灣 (不限縣市)</option>
          {TAIWAN_COUNTIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {/* 鄉鎮市區選單 */}
      <div className="relative flex-1 min-w-[130px]">
        <select
          value={district}
          onChange={handleDistrictChange}
          disabled={disabled || !county || districts.length === 0}
          aria-label="選擇鄉鎮市區"
          className={`w-full ${selectClass}`}
        >
          <option value="">
            {!county ? "鄉鎮市區 (請先選縣市)" : "全區 (不限鄉鎮)"}
          </option>
          {districts.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>

      {/* 清除地區按鈕 */}
      {(county || district) && (
        <button
          type="button"
          onClick={handleClear}
          disabled={disabled}
          title="重設地區篩選"
          className="flex items-center gap-1 rounded-xl border border-neutral-200 bg-neutral-100 px-2.5 py-2 text-xs font-semibold text-neutral-600 transition-colors hover:bg-neutral-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 disabled:opacity-50"
        >
          <span>✕</span>
          <span className="hidden sm:inline">清除</span>
        </button>
      )}
    </div>
  );
}
