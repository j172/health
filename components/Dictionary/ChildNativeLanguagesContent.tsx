"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import LoadingOrb from "@/components/ui/LoadingOrb";
import Pagination from "@/components/Tools/Pagination";
import AudioPlayerButton from "./AudioPlayerButton";
import TopicPills from "./TopicPills";
import type { NativeDictItem, NativeLanguage } from "@/lib/server/dictionary/types";

const HAKKA_DIALECTS = [
  { id: "sixian", label: "四縣腔", variant: 1 },
  { id: "hailu", label: "海陸腔", variant: 2 },
  { id: "dabu", label: "大埔腔", variant: 3 },
  { id: "raoping", label: "饒平腔", variant: 4 },
  { id: "zhaoan", label: "詔安腔", variant: 5 },
  { id: "south_sixian", label: "南四縣腔", variant: 6 },
];

export default function ChildNativeLanguagesContent() {
  const searchParams = useSearchParams();

  // URL state initialization
  const initialLang: NativeLanguage =
    searchParams.get("lang") === "hakka" ? "hakka" : "twblg";
  const initialQ = searchParams.get("q") || searchParams.get("word") || "";
  const initialTopic = searchParams.get("topic") || "";
  const initialDialect = searchParams.get("dialect") || "sixian";
  const initialPage = Math.max(1, Number(searchParams.get("page")) || 1);

  const [lang, setLang] = useState<NativeLanguage>(initialLang);
  const [searchInput, setSearchInput] = useState<string>(initialQ);
  const [activeQuery, setActiveQuery] = useState<string>(initialQ);
  const [selectedTopic, setSelectedTopic] = useState<string>(initialTopic);
  const [selectedDialect, setSelectedDialect] = useState<string>(initialDialect);
  const [page, setPage] = useState<number>(initialPage);
  const [pageSize, setPageSize] = useState<number>(20);

  const [items, setItems] = useState<NativeDictItem[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Sync state to URL without reloading
  const updateUrl = useCallback(
    (newLang: NativeLanguage, newQ: string, newTopic: string, newDialect: string, newPage: number) => {
      if (typeof window === "undefined") return;
      const params = new URLSearchParams();
      if (newLang !== "twblg") params.set("lang", newLang);
      if (newQ) params.set("q", newQ);
      if (newTopic) params.set("topic", newTopic);
      if (newLang === "hakka" && newDialect !== "sixian") params.set("dialect", newDialect);
      if (newPage > 1) params.set("page", String(newPage));

      const queryStr = params.toString();
      const newUrl = queryStr ? `?${queryStr}` : window.location.pathname;
      window.history.replaceState(null, "", newUrl);
    },
    [],
  );

  // Fetch words from API
  useEffect(() => {
    let cancelled = false;

    queueMicrotask(() => {
      (async () => {
        if (cancelled) return;
        setLoading(true);
        setError(false);

        const params = new URLSearchParams();
        params.set("lang", lang);
        if (activeQuery) params.set("q", activeQuery);
        if (selectedTopic) params.set("topic", selectedTopic);
        if (lang === "hakka") params.set("dialect", selectedDialect);
        params.set("page", String(page));
        params.set("limit", String(pageSize));

        try {
          const res = await fetch(`/api/tools/child-native-languages?${params.toString()}`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          if (cancelled) return;
          if (data.ok) {
            setItems(data.items || []);
            setTotal(data.total || 0);
          } else {
            setError(true);
          }
        } catch (err) {
          if (cancelled) return;
          console.error("Failed to load dictionary entries:", err);
          setError(true);
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    });

    updateUrl(lang, activeQuery, selectedTopic, selectedDialect, page);

    return () => {
      cancelled = true;
    };
  }, [lang, activeQuery, selectedTopic, selectedDialect, page, pageSize, updateUrl]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setActiveQuery(searchInput.trim());
  };

  const handleClearSearch = () => {
    setSearchInput("");
    setActiveQuery("");
    setPage(1);
  };

  const handleLangChange = (newLang: NativeLanguage) => {
    if (newLang === lang) return;
    setLang(newLang);
    setPage(1);
  };

  const handleTopicChange = (newTopic: string) => {
    setSelectedTopic(newTopic);
    setPage(1);
  };

  const handleShare = (item: NativeDictItem) => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("lang", item.lang);
    url.searchParams.set("q", item.title);
    navigator.clipboard.writeText(url.toString());
    setCopiedId(String(item.id));
    setTimeout(() => setCopiedId(null), 2000);
  };

  const currentVariant =
    HAKKA_DIALECTS.find((d) => d.id === selectedDialect)?.variant || 1;

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-500/10 via-purple-500/5 to-pink-500/10 p-6 md:p-8 border border-indigo-100/80 dark:border-indigo-900/30 dark:from-indigo-950/40 dark:via-purple-950/20 dark:to-pink-950/20">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-100 text-indigo-800 text-xs font-bold mb-3 dark:bg-indigo-900/60 dark:text-indigo-200">
            <span>🎒 國中小本土語文課程輔助</span>
            <span>•</span>
            <span>教育部與 g0v 萌典開放資料</span>
          </div>
          <h2 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white mb-2">
            兒少本土語言辭典：聽發音・學母語
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            專為學童與親子共讀打造！整合教育部《臺灣閩南語常用詞辭典》與《臺灣客家語常用詞辭典》，提供大字體標音、真人線上朗讀發音、生活化例句與華語關鍵字反向查詢。
          </p>
        </div>
      </div>

      {/* Language Switcher Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 pb-4 dark:border-slate-800">
        <div className="inline-flex rounded-2xl bg-slate-100 p-1 dark:bg-slate-800/80">
          <button
            type="button"
            onClick={() => handleLangChange("twblg")}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
              lang === "twblg"
                ? "bg-white text-indigo-600 shadow-sm dark:bg-slate-900 dark:text-indigo-400"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            }`}
          >
            <span>🗣️ 臺灣閩南語</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-semibold dark:bg-indigo-950 dark:text-indigo-300">
              臺羅標音
            </span>
          </button>
          <button
            type="button"
            onClick={() => handleLangChange("hakka")}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
              lang === "hakka"
                ? "bg-white text-indigo-600 shadow-sm dark:bg-slate-900 dark:text-indigo-400"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            }`}
          >
            <span>🏮 臺灣客家語</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-semibold dark:bg-indigo-950 dark:text-indigo-300">
              六大腔調
            </span>
          </button>
        </div>

        {/* Hakka Dialect Selector */}
        {lang === "hakka" && (
          <div className="flex items-center gap-1.5 overflow-x-auto">
            <span className="text-xs font-bold text-slate-400 whitespace-nowrap mr-1">
              腔調：
            </span>
            {HAKKA_DIALECTS.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => {
                  setSelectedDialect(d.id);
                  setPage(1);
                }}
                className={`px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                  selectedDialect === d.id
                    ? "bg-amber-500 text-white shadow-sm"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Search Input Bar */}
      <form onSubmit={handleSearchSubmit} className="relative">
        <div className="relative flex items-center">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-slate-400">
            <svg
              className="h-5 w-5"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
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
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={`輸入華語（如：洗澡、彩虹）、母語漢字或拼音搜尋${lang === "hakka" ? "客語" : "閩南語"}...`}
            className="w-full rounded-2xl border border-slate-200 bg-white py-3.5 pl-11 pr-24 text-sm font-medium text-slate-800 shadow-sm placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-indigo-400"
          />
          <div className="absolute right-2 flex items-center gap-1">
            {searchInput && (
              <button
                type="button"
                onClick={handleClearSearch}
                aria-label="清除搜尋"
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <svg
                  className="h-4 w-4"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            )}
            <button
              type="submit"
              className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-indigo-700 shadow-sm shadow-indigo-500/20"
            >
              搜尋
            </button>
          </div>
        </div>
      </form>

      {/* Topic Pills */}
      <TopicPills selectedTopic={selectedTopic} onSelectTopic={handleTopicChange} />

      {/* Results Header / Stats */}
      <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
        <span>
          {loading
            ? "正在查詢詞條..."
            : `共找到 ${total.toLocaleString()} 筆符合的${lang === "hakka" ? "客語" : "閩南語"}詞條`}
        </span>
        {activeQuery && (
          <span className="truncate max-w-[200px]">
            搜尋關鍵字：「<strong className="text-indigo-600 dark:text-indigo-400">{activeQuery}</strong>」
          </span>
        )}
      </div>

      {/* Content Area */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <LoadingOrb size={36} />
          <p className="text-xs font-semibold text-slate-400 animate-pulse">
            載入萌典語言資料庫中...
          </p>
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50/50 p-8 text-center dark:border-rose-900/40 dark:bg-rose-950/20">
          <p className="text-sm font-semibold text-rose-600 dark:text-rose-400 mb-2">
            查詢詞庫失敗，請檢查網路連線或稍後再試。
          </p>
          <button
            type="button"
            onClick={() => setPage((p) => p)}
            className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700"
          >
            重試
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-300 p-12 text-center dark:border-slate-800">
          <div className="text-4xl mb-3">🔍</div>
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-200 mb-1">
            找不到符合的詞條
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto mb-4">
            您可以嘗試改用華語對照（如「吃飯」、「謝謝」、「天空」），或點選上方的「兒少生活情境探索主題」。
          </p>
          {(activeQuery || selectedTopic) && (
            <button
              type="button"
              onClick={() => {
                handleClearSearch();
                setSelectedTopic("");
              }}
              className="rounded-xl bg-indigo-50 px-4 py-2 text-xs font-bold text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-950/50 dark:text-indigo-300"
            >
              清除所有篩選條件
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {items.map((item) => (
            <div
              key={item.id}
              className="group relative rounded-3xl border border-slate-200/90 bg-white p-5 md:p-6 shadow-sm transition-all duration-200 hover:border-indigo-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-900/60"
            >
              {/* Top Row: Title + Pronunciation + Audio */}
              <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-3">
                  <h3 className="text-2xl md:text-3xl font-black tracking-wide text-slate-900 dark:text-white">
                    {item.title}
                  </h3>
                  <AudioPlayerButton
                    lang={item.lang}
                    audioId={item.audio_id}
                    variant={currentVariant}
                    size="md"
                  />
                </div>

                {/* Badges & Share button */}
                <div className="flex items-center gap-2">
                  {item.radical && (
                    <span className="px-2 py-0.5 rounded-lg bg-slate-100 text-slate-600 text-[11px] font-semibold dark:bg-slate-800 dark:text-slate-400">
                      部首：{item.radical}
                    </span>
                  )}
                  {item.stroke_count && (
                    <span className="px-2 py-0.5 rounded-lg bg-slate-100 text-slate-600 text-[11px] font-semibold dark:bg-slate-800 dark:text-slate-400">
                      {item.stroke_count} 畫
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => handleShare(item)}
                    title="複製此詞條連結"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    {copiedId === String(item.id) ? (
                      <span className="text-xs text-emerald-600 font-bold">已複製！</span>
                    ) : (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
                        />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {/* Phonetic transcription badge */}
              <div className="mb-4">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-xl bg-indigo-50/80 border border-indigo-100 text-indigo-900 dark:bg-indigo-950/40 dark:border-indigo-900/50 dark:text-indigo-300">
                  <span className="text-xs font-bold text-indigo-500 dark:text-indigo-400 uppercase tracking-wider">
                    {item.lang === "twblg" ? "臺羅" : "客拼"}
                  </span>
                  <span className="text-sm md:text-base font-semibold font-mono">
                    {item.pinyin}
                  </span>
                  {item.dialect && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-white text-slate-600 font-bold border border-slate-200 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300">
                      {item.dialect}
                    </span>
                  )}
                </div>
              </div>

              {/* Definitions & Examples */}
              <div className="space-y-3 border-t border-slate-100 pt-3 dark:border-slate-800/80">
                {item.definitions.map((def, idx) => (
                  <div key={idx} className="text-sm">
                    <div className="flex items-start gap-2 leading-relaxed">
                      {def.type && (
                        <span className="mt-0.5 flex-shrink-0 px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 text-xs font-bold dark:bg-indigo-900/60 dark:text-indigo-200">
                          {def.type}
                        </span>
                      )}
                      <span className="font-semibold text-slate-800 dark:text-slate-100">
                        {def.def}
                      </span>
                    </div>

                    {/* Example Sentences */}
                    {def.example && def.example.length > 0 && (
                      <div className="mt-2 pl-3 border-l-2 border-indigo-200 dark:border-indigo-800 space-y-1.5">
                        {def.example.map((ex: any, eIdx: number) => {
                          const exText = typeof ex === "string" ? ex : ex.text;
                          const exTrs = typeof ex === "object" ? ex.trs : undefined;
                          const exMandarin = typeof ex === "object" ? ex.mandarin : undefined;

                          return (
                            <div key={eIdx} className="text-xs space-y-0.5">
                              <p className="font-medium text-slate-700 dark:text-slate-300">
                                💬 {exText}
                              </p>
                              {exTrs && (
                                <p className="font-mono text-[11px] text-indigo-600 dark:text-indigo-400 pl-4">
                                  {exTrs}
                                </p>
                              )}
                              {exMandarin && (
                                <p className="text-slate-500 dark:text-slate-400 pl-4">
                                  華語：{exMandarin}
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {!loading && total > pageSize && (
        <div className="pt-4">
          <Pagination
            page={page}
            pageSize={pageSize as any}
            totalItems={total}
            onPageChange={(p) => {
              setPage(p);
              if (typeof window !== "undefined") {
                window.scrollTo({ top: 300, behavior: "smooth" });
              }
            }}
            onPageSizeChange={(s) => {
              setPageSize(s);
              setPage(1);
            }}
            itemLabel="筆詞條"
          />
        </div>
      )}
    </div>
  );
}
