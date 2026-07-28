"use client";

import { useState } from "react";

interface DrugItem {
  id: number;
  license_no: string;
  name_zh: string;
  name_en: string | null;
  shape: string | null;
  dosage_form: string | null;
  color: string | null;
  odor: string | null;
  score_mark: string | null;
  size_mm: string | null;
  imprint_1: string | null;
  imprint_2: string | null;
  image_url: string | null;
}

export default function DrugsContent() {
  const [searchInput, setSearchInput] = useState("");
  const [drugs, setDrugs] = useState<DrugItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [searchedFor, setSearchedFor] = useState("");

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const keyword = searchInput.trim();
    if (!keyword) return;

    setLoading(true);
    setError(false);
    setSearchedFor(keyword);

    try {
      const res = await fetch(`/api/drugs?keyword=${encodeURIComponent(keyword)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setDrugs(data.drugs);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-2 text-3xl font-bold text-neutral-800 md:text-4xl">💊 藥品查詢</h1>
        <p className="text-neutral-600">查詢衛福部食藥署核准藥品的許可證字號、中英文品名與外觀特徵（形狀、顏色、刻痕、標註）。</p>
        <p className="mt-1 text-xs text-neutral-500">⚠️ 本資料庫為藥品許可證與外觀識別資料，不包含健保價格／給付資訊，僅供辨識參考，不構成用藥指示。</p>
      </div>

      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="輸入藥品中文或英文名稱、許可證字號"
          className="flex-1 rounded-none border border-neutral-300 bg-white px-4 py-2.5 text-sm text-neutral-800 focus:border-primary focus:outline-none"
        />
        <button type="submit" className="rounded-none bg-primary px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primaryho">
          搜尋
        </button>
      </form>

      {loading && (
        <div className="flex justify-center py-8">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )}

      {error && <div className="rounded-none bg-red-50 p-4 text-sm text-red-700">查詢藥品資料失敗，請稍後再試。</div>}

      {!loading && !error && drugs && (
        <>
          <p className="text-xs text-neutral-500">
            「{searchedFor}」共 {drugs.length} 筆結果{drugs.length >= 50 && "（僅顯示前50筆，請縮小關鍵字範圍）"}
          </p>

          {drugs.length === 0 ? (
            <p className="py-8 text-center text-neutral-500">查無符合的藥品。</p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {drugs.map((d) => (
                <div key={d.id} className="flex gap-4 rounded-none border border-neutral-200 p-4">
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-none bg-neutral-50">
                    {d.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={d.image_url} alt={d.name_zh} className="h-full w-full object-contain" loading="lazy" />
                    ) : (
                      <span className="text-2xl">💊</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-neutral-800">{d.name_zh}</p>
                    {d.name_en && <p className="text-xs text-neutral-500">{d.name_en}</p>}
                    <p className="mt-1 text-xs text-neutral-500">許可證：{d.license_no}</p>
                    <div className="mt-2 flex flex-wrap gap-1 text-xs text-neutral-600">
                      {d.shape && <span className="rounded bg-neutral-100 px-1.5 py-0.5">形狀：{d.shape}</span>}
                      {d.color && <span className="rounded bg-neutral-100 px-1.5 py-0.5">顏色：{d.color}</span>}
                      {d.score_mark && d.score_mark !== "無" && <span className="rounded bg-neutral-100 px-1.5 py-0.5">刻痕：{d.score_mark}</span>}
                      {(d.imprint_1 || d.imprint_2) && <span className="rounded bg-neutral-100 px-1.5 py-0.5">標註：{[d.imprint_1, d.imprint_2].filter(Boolean).join(" / ")}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
