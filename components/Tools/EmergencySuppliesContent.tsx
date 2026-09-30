"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";

interface ChecklistItem {
  id: string;
  name: string;
  note?: string;
  category: string;
  isCustom?: boolean;
}

const DEFAULT_GOBAG_ITEMS: ChecklistItem[] = [
  // 1. 重要證件與現金
  { id: "gb-doc-1", name: "重要身分證件影本", note: "身分證、健保卡、戶口名簿等影本", category: "重要證件與現金" },
  { id: "gb-doc-2", name: "緊急現金與零錢", note: "千元、百元紙鈔與大量十元五十元硬幣（遇停電ATM停擺或自動販賣機/公用電話使用）", category: "重要證件與現金" },
  { id: "gb-doc-3", name: "個人存摺與印章影本/備份", note: "或防水夾密封妥善保存", category: "重要證件與現金" },
  { id: "gb-doc-4", name: "緊急聯絡通訊卡", note: "手寫重要親友電話、外縣市聯絡人電話、緊急避難集合地點", category: "重要證件與現金" },

  // 2. 緊急飲食與飲水
  { id: "gb-food-1", name: "瓶裝飲用水 (1~1.5 公升)", note: "隨身避難以輕量為原則，避免背包過重拖慢行動速度", category: "飲食與飲水" },
  { id: "gb-food-2", name: "高熱量耐保存口糧 (1-3 天)", note: "營養餅乾、巧克力、能量棒、葡萄糖錠、脫水乾燥飯", category: "飲食與飲水" },
  { id: "gb-food-3", name: "隨身輕便折疊水袋", note: "便於在臨時取水點分裝盛水", category: "飲食與飲水" },

  // 3. 醫療與急救用品
  { id: "gb-med-1", name: "個人慢性病連續處方藥 (3-7 天份)", note: "高血壓、糖尿病、氣喘吸入劑或心臟常備藥", category: "醫療與急救" },
  { id: "gb-med-2", name: "個人急救包", note: "止血帶、彈性繃帶、無菌紗布塊、透氣膠帶、優碘棉棒", category: "醫療與急救" },
  { id: "gb-med-3", name: "常用成藥", note: "止痛退燒藥、綜合感冒藥、抗組織胺、腸胃止瀉藥", category: "醫療與急救" },
  { id: "gb-med-4", name: "小型醫療剪刀與鑷子", note: "剪切紗布或挑除傷口碎屑", category: "醫療與急救" },

  // 4. 防護保暖與衣物
  { id: "gb-cloth-1", name: "耐磨防穿刺工作手套", note: "瓦礫殘骸中攀爬或清理雜物時防止割傷", category: "防護保暖與衣物" },
  { id: "gb-cloth-2", name: "輕便雨衣", note: "防水防雨，亦可作為簡易防風保暖層", category: "防護保暖與衣物" },
  { id: "gb-cloth-3", name: "保暖太空鋁箔毯 (救生毯)", note: "體積小重量輕，能有效折射體溫防止失溫", category: "防護保暖與衣物" },
  { id: "gb-cloth-4", name: "替換衣物與厚毛巾", note: "長袖長褲、內衣褲、厚襪子、保暖毛帽", category: "防護保暖與衣物" },

  // 5. 工具照明與通訊
  { id: "gb-tool-1", name: "強光 LED 手電筒 (含備用電池)", note: "避免完全依賴手機照明以保留手機電力", category: "工具通訊與照明" },
  { id: "gb-tool-2", name: "高分貝求救哨", note: "掛在胸前或背包外側，受困時吹哨求救節省呼喊體力", category: "工具通訊與照明" },
  { id: "gb-tool-3", name: "手搖/電池防災收音機", note: "基地台斷訊時收聽警廣 (FM 104.9 / AM 945) 掌握官方災情動態", category: "工具通訊與照明" },
  { id: "gb-tool-4", name: "大容量行動電源與耐用充電線", note: "出門前務必保持 100% 滿電狀態", category: "工具通訊與照明" },
  { id: "gb-tool-5", name: "多功能瑞士刀 / 工具鉗", note: "開罐、割繩、簡易修繕工具", category: "工具通訊與照明" },
  { id: "gb-tool-6", name: "防風打火機或防水火柴", note: "緊急取暖或點火求生", category: "工具通訊與照明" },

  // 6. 個人衛生與清潔
  { id: "gb-hyg-1", name: "醫用口罩 (5-10 片)", note: "防塵土、灰燼與呼吸道防護", category: "個人衛生與清潔" },
  { id: "gb-hyg-2", name: "抗菌濕紙巾與酒精棉片", note: "缺乏清潔水時作手部與傷口周圍清潔", category: "個人衛生與清潔" },
  { id: "gb-hyg-3", name: "隨身面紙與小型耐撕塑膠垃圾袋", note: "個人如廁、垃圾密封或物品防水袋使用", category: "個人衛生與清潔" },
  { id: "gb-hyg-4", name: "女性生理用品 / 個人衛生備品", note: "衛生棉、棉條或乾洗手液", category: "個人衛生與清潔" },
];

const GOBAG_CATEGORIES = [
  "重要證件與現金",
  "飲食與飲水",
  "醫療與急救",
  "防護保暖與衣物",
  "工具通訊與照明",
  "個人衛生與清潔",
];

const STORAGE_KEY_GOBAG = "healthz_gobag_checks_v1";
const STORAGE_KEY_CUSTOM_ITEMS = "healthz_gobag_custom_v1";
const STORAGE_KEY_HOUSEHOLD_CHECKS = "healthz_household_checks_v1";

export default function EmergencySuppliesContent() {
  const [isMounted, setIsMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<"gobag" | "household">("gobag");

  // Go-bag states
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});
  const [customItems, setCustomItems] = useState<ChecklistItem[]>([]);
  const [newCustomName, setNewCustomName] = useState("");
  const [newCustomCategory, setNewCustomCategory] = useState("工具通訊與照明");
  const [copiedAlert, setCopiedAlert] = useState(false);

  // Household calculation inputs
  const [days, setDays] = useState<number>(3); // 3, 7, 14
  const [adults, setAdults] = useState<number>(2);
  const [children, setChildren] = useState<number>(0);
  const [seniors, setSeniors] = useState<number>(0);
  const [infants, setInfants] = useState<number>(0);
  const [pets, setPets] = useState<number>(0);

  // Household checklist checks
  const [householdChecks, setHouseholdChecks] = useState<Record<string, boolean>>({});

  // Hydrate from localStorage once mounted
  useEffect(() => {
    queueMicrotask(() => {
      setIsMounted(true);
      try {
        const storedChecks = localStorage.getItem(STORAGE_KEY_GOBAG);
        if (storedChecks) {
          setCheckedItems(JSON.parse(storedChecks));
        }
        const storedCustom = localStorage.getItem(STORAGE_KEY_CUSTOM_ITEMS);
        if (storedCustom) {
          setCustomItems(JSON.parse(storedCustom));
        }
        const storedHouse = localStorage.getItem(STORAGE_KEY_HOUSEHOLD_CHECKS);
        if (storedHouse) {
          setHouseholdChecks(JSON.parse(storedHouse));
        }
      } catch {
        // localStorage unavailable or corrupted
      }
    });
  }, []);

  // Save go-bag checks
  const toggleItem = useCallback((id: string) => {
    setCheckedItems((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try {
        localStorage.setItem(STORAGE_KEY_GOBAG, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  // Save household checks
  const toggleHouseholdCheck = useCallback((id: string) => {
    setHouseholdChecks((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try {
        localStorage.setItem(STORAGE_KEY_HOUSEHOLD_CHECKS, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  // Add custom item
  const handleAddCustom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustomName.trim()) return;
    const newItem: ChecklistItem = {
      id: `custom-${Date.now()}`,
      name: newCustomName.trim(),
      category: newCustomCategory,
      isCustom: true,
      note: "使用者自訂備用物品",
    };
    const nextCustom = [...customItems, newItem];
    setCustomItems(nextCustom);
    setNewCustomName("");
    try {
      localStorage.setItem(STORAGE_KEY_CUSTOM_ITEMS, JSON.stringify(nextCustom));
    } catch {}
  };

  // Remove custom item
  const handleRemoveCustom = (id: string) => {
    const nextCustom = customItems.filter((i) => i.id !== id);
    setCustomItems(nextCustom);
    setCheckedItems((prev) => {
      const next = { ...prev };
      delete next[id];
      try {
        localStorage.setItem(STORAGE_KEY_GOBAG, JSON.stringify(next));
        localStorage.setItem(STORAGE_KEY_CUSTOM_ITEMS, JSON.stringify(nextCustom));
      } catch {}
      return next;
    });
  };

  // Reset checklist
  const handleResetGobag = () => {
    if (window.confirm("確定要重設避難包檢核清單的所有打勾進度嗎？（自訂項目仍會保留）")) {
      setCheckedItems({});
      try {
        localStorage.removeItem(STORAGE_KEY_GOBAG);
      } catch {}
    }
  };

  // All go-bag items
  const allGobagItems = useMemo(() => {
    return [...DEFAULT_GOBAG_ITEMS, ...customItems];
  }, [customItems]);

  // Statistics
  const totalCount = allGobagItems.length;
  const readyCount = useMemo(() => {
    if (!isMounted) return 0;
    return allGobagItems.filter((item) => Boolean(checkedItems[item.id])).length;
  }, [allGobagItems, checkedItems, isMounted]);

  const percentage = totalCount > 0 ? Math.round((readyCount / totalCount) * 100) : 0;

  // Household Calculations
  const totalPeople = adults + children + seniors + infants;
  // 3L per person per day + 0.6L per pet per day
  const totalWaterLiters = totalPeople * days * 3 + pets * days * 0.6;
  const waterBottles2L = Math.ceil(totalWaterLiters / 2);
  const totalMeals = (adults + children + seniors) * days * 3;
  const chronicMedsDays = seniors > 0 ? (days + 7) : 0;
  const diapersCount = infants * days * 7;
  const infantWipesPacks = infants > 0 ? Math.ceil(days / 3) : 0;
  const petFoodGrams = pets * days * 200;
  const gasCanisters = Math.ceil(days / 3);

  // Copy plain text checklist
  const handleCopyChecklist = () => {
    let text = `【全民防災物資檢核清單】\n整理日期：${new Date().toLocaleDateString("zh-TW")}\n完成進度：${readyCount}/${totalCount} 項 (${percentage}%)\n\n`;

    GOBAG_CATEGORIES.forEach((cat) => {
      const items = allGobagItems.filter((i) => i.category === cat);
      if (items.length === 0) return;
      text += `▶ ${cat}：\n`;
      items.forEach((item) => {
        const isDone = isMounted && checkedItems[item.id];
        text += `  [${isDone ? "V" : " "}] ${item.name}${item.note ? `（${item.note}）` : ""}\n`;
      });
      text += "\n";
    });

    if (totalPeople > 0) {
      text += `▶ 家庭居家儲備估算（${days} 天 / ${totalPeople} 人 + ${pets} 寵物）：\n`;
      text += `  - 生活飲用水：${totalWaterLiters.toFixed(1)} 公升（約 2L 大瓶裝水 ${waterBottles2L} 瓶）\n`;
      text += `  - 主食乾糧總餐數：約 ${totalMeals} 餐\n`;
      if (seniors > 0) text += `  - 長者慢性病藥品：至少 ${chronicMedsDays} 天份\n`;
      if (infants > 0) text += `  - 嬰兒尿布：${diapersCount} 片、純水濕紙巾 ${infantWipesPacks} 包\n`;
      if (pets > 0) text += `  - 寵物乾糧/罐頭：約 ${(petFoodGrams / 1000).toFixed(1)} 公斤\n`;
      text += `  - 瓦斯罐與照明備用：瓦斯罐約 ${gasCanisters} 罐\n`;
    }

    text += `\n資料來源：國防部全民防衛動員署《當危機來臨時 - 臺灣全民安全指引》(https://prepare.mnd.gov.tw/)`;

    navigator.clipboard.writeText(text).then(() => {
      setCopiedAlert(true);
      setTimeout(() => setCopiedAlert(false), 2500);
    });
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-8">
      {/* 國防部官方指引引言與榮譽橫幅 */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-600 via-rose-700 to-indigo-900 p-6 text-white shadow-xl">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/20 px-3 py-1 text-xs font-semibold backdrop-blur-md">
              <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
              國防部全民防衛動員署 官方指引認證
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              當危機來臨時，你準備好了嗎？
            </h2>
            <p className="text-sm sm:text-base text-amber-100/90 leading-relaxed">
              天災地變、重大事故或戰事來臨時，及早備妥「隨身帶走的避難包」與「家戶固守的日常儲備」能守護全家安全。依據國防部《臺灣全民安全指引》，本工具提供個人檢核與家庭動態計算。
            </p>
          </div>

          <div className="flex flex-wrap sm:flex-col gap-2 shrink-0">
            <a
              href="https://prepare.mnd.gov.tw/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-slate-900 shadow-md transition hover:bg-amber-50 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-white"
            >
              🌐 瀏覽國防部官網
            </a>
            <a
              href="https://prepare.mnd.gov.tw/assets/pdf/emergency-response.zh-Hant.pdf"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-400/90 px-4 py-2.5 text-sm font-bold text-slate-950 shadow-md transition hover:bg-amber-300 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-amber-200"
            >
              📥 下載官方手冊 PDF
            </a>
          </div>
        </div>

        {/* 背景裝飾光暈 */}
        <div className="absolute -right-12 -bottom-12 h-64 w-64 rounded-full bg-amber-500/20 blur-3xl pointer-events-none" />
      </div>

      {/* 雙模式切換 Tab */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-800/80 p-1.5 shadow-inner">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "gobag"}
            onClick={() => setActiveTab("gobag")}
            className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold transition-all ${
              activeTab === "gobag"
                ? "bg-white text-indigo-700 shadow dark:bg-slate-900 dark:text-indigo-400"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            🎒 個人緊急避難包檢核 (Go-Bag)
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "household"}
            onClick={() => setActiveTab("household")}
            className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold transition-all ${
              activeTab === "household"
                ? "bg-white text-indigo-700 shadow dark:bg-slate-900 dark:text-indigo-400"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            🏠 家庭日常居家儲備計算機
          </button>
        </div>

        {/* 快速功能按鈕 */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopyChecklist}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 shadow-sm transition hover:bg-slate-50 dark:hover:bg-slate-800"
            title="複製清單至剪貼簿，可貼上至 LINE 或備忘錄"
          >
            📋 {copiedAlert ? "已複製至剪貼簿！" : "複製清單文字"}
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 shadow-sm transition hover:bg-slate-50 dark:hover:bg-slate-800"
            title="列印清單（純淨無雜訊排版，可貼在冰箱門上）"
          >
            🖨️ 列印檢核表
          </button>
          {activeTab === "gobag" && (
            <button
              type="button"
              onClick={handleResetGobag}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-medium text-slate-500 dark:text-slate-400 shadow-sm transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 dark:hover:text-red-400"
              title="重設所有打勾狀態"
            >
              🔄 重設
            </button>
          )}
        </div>
      </div>

      {/* 模式一：個人緊急避難包 (Go-Bag) */}
      {activeTab === "gobag" && (
        <div className="space-y-6">
          {/* 進度條與原則提示 */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                  準備進度
                </span>
                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  {readyCount} / {totalCount} 項已備齊 ({percentage}%)
                </h3>
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-lg sm:max-w-md">
                💡 <strong>避難包原則</strong>：一人一包、重物在上方貼背、總重不超過體重的 15%（60kg 人士約 9kg 以內），置於大門玄關處。
              </div>
            </div>

            {/* 進度條 */}
            <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-3 overflow-hidden">
              <div
                className={`h-full transition-all duration-500 rounded-full ${
                  percentage === 100
                    ? "bg-emerald-500"
                    : percentage > 60
                    ? "bg-indigo-600"
                    : percentage > 30
                    ? "bg-amber-500"
                    : "bg-rose-500"
                }`}
                style={{ width: `${percentage}%` }}
              />
            </div>
          </div>

          {/* 分組清單 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {GOBAG_CATEGORIES.map((category) => {
              const items = allGobagItems.filter((i) => i.category === category);
              const groupDone = items.filter((i) => isMounted && checkedItems[i.id]).length;
              return (
                <div
                  key={category}
                  className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 mb-4">
                      <h4 className="font-bold text-slate-900 dark:text-slate-100 text-base flex items-center gap-2">
                        <span>{category}</span>
                      </h4>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        {groupDone} / {items.length}
                      </span>
                    </div>

                    <ul className="space-y-3">
                      {items.map((item) => {
                        const isDone = isMounted && Boolean(checkedItems[item.id]);
                        return (
                          <li
                            key={item.id}
                            className={`group relative flex items-start gap-3 p-2.5 rounded-xl border transition-all ${
                              isDone
                                ? "border-emerald-200 bg-emerald-50/40 dark:border-emerald-900/40 dark:bg-emerald-950/20"
                                : "border-slate-100 dark:border-slate-800/80 hover:bg-slate-50 dark:hover:bg-slate-800/40"
                            }`}
                          >
                            <input
                              type="checkbox"
                              id={item.id}
                              checked={isDone}
                              onChange={() => toggleItem(item.id)}
                              className="mt-1 h-5 w-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 cursor-pointer shrink-0"
                            />
                            <div className="flex-1 min-w-0">
                              <label
                                htmlFor={item.id}
                                className={`text-sm font-semibold cursor-pointer block ${
                                  isDone
                                    ? "line-through text-slate-400 dark:text-slate-500"
                                    : "text-slate-800 dark:text-slate-200"
                                }`}
                              >
                                {item.name}
                              </label>
                              {item.note && (
                                <p
                                  className={`text-xs mt-0.5 ${
                                    isDone
                                      ? "text-slate-400/80 dark:text-slate-600"
                                      : "text-slate-500 dark:text-slate-400"
                                  }`}
                                >
                                  {item.note}
                                </p>
                              )}
                            </div>

                            {item.isCustom && (
                              <button
                                type="button"
                                onClick={() => handleRemoveCustom(item.id)}
                                className="text-slate-400 hover:text-red-500 p-1 text-xs shrink-0 transition"
                                title="刪除此自訂項目"
                              >
                                ✕
                              </button>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 新增自訂物品區塊 */}
          <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/40 p-5">
            <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200 mb-3 flex items-center gap-2">
              <span>➕ 新增個人/家庭專屬自訂裝備</span>
              <span className="text-xs font-normal text-slate-500">（如：特殊配鏡、個人特定醫材、嬰兒背巾等）</span>
            </h4>
            <form onSubmit={handleAddCustom} className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                value={newCustomName}
                onChange={(e) => setNewCustomName(e.target.value)}
                placeholder="輸入物品名稱（例：備用近視眼鏡、助聽器專用電池）"
                className="flex-1 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <select
                value={newCustomCategory}
                onChange={(e) => setNewCustomCategory(e.target.value)}
                className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {GOBAG_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="rounded-xl bg-indigo-600 hover:bg-indigo-700 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition shrink-0"
              >
                新增項目
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 模式二：家庭日常居家儲備計算機 */}
      {activeTab === "household" && (
        <div className="space-y-8">
          {/* 參數設定面板 */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm space-y-6">
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                第一步：設定家庭人口與預計儲備天數
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
                國防部與內政部消防署建議：平日至少具備 3 天（黃金 72 小時）之獨立生活物資；若考量重大震災道路中斷，建議以 7 至 14 天為長期防禦目標。
              </p>
            </div>

            {/* 天數切換按鈕 */}
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-2">
                儲備防禦天數
              </label>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { d: 3, title: "3 天 (黃金 72 小時)", desc: "官方標準基礎儲備" },
                  { d: 7, title: "7 天 (進階防護)", desc: "因應強震孤島或封路" },
                  { d: 14, title: "14 天 (長期自足)", desc: "最高防禦整備" },
                ].map((item) => (
                  <button
                    key={item.d}
                    type="button"
                    onClick={() => setDays(item.d)}
                    className={`rounded-xl p-3 border text-left transition-all ${
                      days === item.d
                        ? "border-indigo-600 bg-indigo-50/60 dark:border-indigo-500 dark:bg-indigo-950/40 text-indigo-900 dark:text-indigo-200 shadow-sm"
                        : "border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
                    }`}
                  >
                    <div className="font-bold text-sm sm:text-base">{item.title}</div>
                    <div className="text-xs opacity-75 mt-0.5">{item.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* 人數設定卡片 */}
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-2">
                家庭成員配置
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {/* 成人 */}
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 p-3 text-center">
                  <span className="text-2xl block mb-1">🧑</span>
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-200">成人 (12歲以上)</div>
                  <div className="flex items-center justify-center gap-2 mt-2">
                    <button
                      type="button"
                      onClick={() => setAdults((v) => Math.max(1, v - 1))}
                      className="h-7 w-7 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-sm font-bold"
                    >
                      -
                    </button>
                    <span className="font-extrabold text-base w-6">{adults}</span>
                    <button
                      type="button"
                      onClick={() => setAdults((v) => v + 1)}
                      className="h-7 w-7 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-sm font-bold"
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* 孩童 */}
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 p-3 text-center">
                  <span className="text-2xl block mb-1">🧒</span>
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-200">孩童 (2-12歲)</div>
                  <div className="flex items-center justify-center gap-2 mt-2">
                    <button
                      type="button"
                      onClick={() => setChildren((v) => Math.max(0, v - 1))}
                      className="h-7 w-7 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-sm font-bold"
                    >
                      -
                    </button>
                    <span className="font-extrabold text-base w-6">{children}</span>
                    <button
                      type="button"
                      onClick={() => setChildren((v) => v + 1)}
                      className="h-7 w-7 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-sm font-bold"
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* 長者 */}
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 p-3 text-center">
                  <span className="text-2xl block mb-1">👵</span>
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-200">長者 / 慢性病</div>
                  <div className="flex items-center justify-center gap-2 mt-2">
                    <button
                      type="button"
                      onClick={() => setSeniors((v) => Math.max(0, v - 1))}
                      className="h-7 w-7 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-sm font-bold"
                    >
                      -
                    </button>
                    <span className="font-extrabold text-base w-6">{seniors}</span>
                    <button
                      type="button"
                      onClick={() => setSeniors((v) => v + 1)}
                      className="h-7 w-7 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-sm font-bold"
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* 嬰兒 */}
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 p-3 text-center">
                  <span className="text-2xl block mb-1">👶</span>
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-200">嬰幼兒 (0-2歲)</div>
                  <div className="flex items-center justify-center gap-2 mt-2">
                    <button
                      type="button"
                      onClick={() => setInfants((v) => Math.max(0, v - 1))}
                      className="h-7 w-7 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-sm font-bold"
                    >
                      -
                    </button>
                    <span className="font-extrabold text-base w-6">{infants}</span>
                    <button
                      type="button"
                      onClick={() => setInfants((v) => v + 1)}
                      className="h-7 w-7 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-sm font-bold"
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* 寵物 */}
                <div className="col-span-2 sm:col-span-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 p-3 text-center">
                  <span className="text-2xl block mb-1">🐾</span>
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-200">毛孩 / 寵物</div>
                  <div className="flex items-center justify-center gap-2 mt-2">
                    <button
                      type="button"
                      onClick={() => setPets((v) => Math.max(0, v - 1))}
                      className="h-7 w-7 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-sm font-bold"
                    >
                      -
                    </button>
                    <span className="font-extrabold text-base w-6">{pets}</span>
                    <button
                      type="button"
                      onClick={() => setPets((v) => v + 1)}
                      className="h-7 w-7 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-sm font-bold"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 計算結果核心看板 */}
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-4">
              第二步：家庭儲備計算清單（{days} 天份所需量）
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* 飲用水 */}
              <div className="rounded-2xl border border-blue-200 dark:border-blue-900/50 bg-gradient-to-br from-blue-50/70 to-cyan-50/30 dark:from-blue-950/20 dark:to-cyan-950/10 p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-3xl">💧</span>
                  <span className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                    生命基礎
                  </span>
                </div>
                <div className="mt-3">
                  <div className="text-sm font-semibold text-slate-600 dark:text-slate-400">生活飲用水總量</div>
                  <div className="text-3xl font-black text-blue-700 dark:text-blue-300 mt-1">
                    {totalWaterLiters.toFixed(1)} <span className="text-base font-normal">公升 (L)</span>
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-2 bg-white/60 dark:bg-slate-900/60 p-2 rounded-lg">
                    約需儲備 <strong>{waterBottles2L} 瓶</strong> 市售 2L 大瓶裝水（以每人每天 3L + 寵物 0.6L 計算）。
                  </div>
                </div>
              </div>

              {/* 乾糧熱量 */}
              <div className="rounded-2xl border border-amber-200 dark:border-amber-900/50 bg-gradient-to-br from-amber-50/70 to-orange-50/30 dark:from-amber-950/20 dark:to-orange-950/10 p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-3xl">🍱</span>
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                    糧食熱量
                  </span>
                </div>
                <div className="mt-3">
                  <div className="text-sm font-semibold text-slate-600 dark:text-slate-400">主食與耐存熱量</div>
                  <div className="text-3xl font-black text-amber-700 dark:text-amber-300 mt-1">
                    {totalMeals} <span className="text-base font-normal">餐主食</span>
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-2 bg-white/60 dark:bg-slate-900/60 p-2 rounded-lg">
                    建議搭配：真空白米/快煮麵、自熱米飯、高熱量肉魚罐頭、燕麥片與綜合堅果。
                  </div>
                </div>
              </div>

              {/* 醫療照護 */}
              <div className="rounded-2xl border border-rose-200 dark:border-rose-900/50 bg-gradient-to-br from-rose-50/70 to-pink-50/30 dark:from-rose-950/20 dark:to-pink-950/10 p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-3xl">💊</span>
                  <span className="text-xs font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
                    健康與常備藥
                  </span>
                </div>
                <div className="mt-3">
                  <div className="text-sm font-semibold text-slate-600 dark:text-slate-400">慢性病處方藥品</div>
                  <div className="text-3xl font-black text-rose-700 dark:text-rose-300 mt-1">
                    {seniors > 0 ? `${chronicMedsDays} 天份` : "準備常備藥"}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-2 bg-white/60 dark:bg-slate-900/60 p-2 rounded-lg">
                    {seniors > 0
                      ? `家中長者依「天數+7日緩衝」儲備；並備妥家庭綜合醫藥箱（退燒止痛/消炎/胃腸藥）。`
                      : `備妥家庭急救醫藥箱：綜合感冒藥、退燒止痛、外用消毒優碘與止血紗布包。`}
                  </div>
                </div>
              </div>

              {/* 能源與照明 */}
              <div className="rounded-2xl border border-indigo-200 dark:border-indigo-900/50 bg-gradient-to-br from-indigo-50/70 to-purple-50/30 dark:from-indigo-950/20 dark:to-purple-950/10 p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-3xl">⚡</span>
                  <span className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                    生活能源
                  </span>
                </div>
                <div className="mt-3">
                  <div className="text-sm font-semibold text-slate-600 dark:text-slate-400">烹飪瓦斯與照明電力</div>
                  <div className="text-3xl font-black text-indigo-700 dark:text-indigo-300 mt-1">
                    {gasCanisters} <span className="text-base font-normal">罐瓦斯罐</span>
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-2 bg-white/60 dark:bg-slate-900/60 p-2 rounded-lg">
                    卡式爐 1 台、瓦斯罐約 {gasCanisters} 罐；手電筒與收音機備用電池（3號/4號各 1-2 組）。
                  </div>
                </div>
              </div>

              {/* 嬰幼兒照護（若有嬰兒） */}
              {infants > 0 && (
                <div className="rounded-2xl border border-emerald-200 dark:border-emerald-900/50 bg-gradient-to-br from-emerald-50/70 to-teal-50/30 dark:from-emerald-950/20 dark:to-teal-950/10 p-5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-3xl">🍼</span>
                    <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                      嬰幼兒特需
                    </span>
                  </div>
                  <div className="mt-3">
                    <div className="text-sm font-semibold text-slate-600 dark:text-slate-400">尿布與奶粉儲備</div>
                    <div className="text-3xl font-black text-emerald-700 dark:text-emerald-300 mt-1">
                      {diapersCount} <span className="text-base font-normal">片尿布</span>
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-2 bg-white/60 dark:bg-slate-900/60 p-2 rounded-lg">
                      純水濕紙巾 <strong>{infantWipesPacks} 大包</strong>、小包裝配方奶粉、奶瓶消毒備品、背巾。
                    </div>
                  </div>
                </div>
              )}

              {/* 寵物照護（若有寵物） */}
              {pets > 0 && (
                <div className="rounded-2xl border border-violet-200 dark:border-violet-900/50 bg-gradient-to-br from-violet-50/70 to-fuchsia-50/30 dark:from-violet-950/20 dark:to-fuchsia-950/10 p-5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-3xl">🐾</span>
                    <span className="text-xs font-bold uppercase tracking-wider text-violet-600 dark:text-violet-400">
                      毛孩夥伴
                    </span>
                  </div>
                  <div className="mt-3">
                    <div className="text-sm font-semibold text-slate-600 dark:text-slate-400">寵物口糧與專用備品</div>
                    <div className="text-3xl font-black text-violet-700 dark:text-violet-300 mt-1">
                      {(petFoodGrams / 1000).toFixed(1)} <span className="text-base font-normal">kg 飼料/罐頭</span>
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-2 bg-white/60 dark:bg-slate-900/60 p-2 rounded-lg">
                      寵物專用水約 {(pets * days * 0.6).toFixed(1)}L、專用便袋/貓砂、牽繩胸背帶、外出防護籠。
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 居家儲備物資盤點檢核 */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm">
            <h4 className="font-bold text-slate-900 dark:text-slate-100 text-base mb-4">
              居家儲備盤點核對表（打勾記錄目前家中所存數量）
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                { id: "h-water", label: `飲用水達標：已備齊 ${waterBottles2L} 瓶 2L 大瓶裝水` },
                { id: "h-food", label: `主食與乾糧達標：罐頭、白米、即食飯達 ${totalMeals} 餐份` },
                { id: "h-gas", label: `瓦斯與煮食用具：卡式爐檢測正常、備妥 ${gasCanisters} 罐瓦斯` },
                { id: "h-light", label: `照明與通訊：LED 露營燈、手電筒、防災收音機及電池備妥` },
                { id: "h-med", label: `醫藥衛生箱：常備外用消毒藥水、紗布、退燒藥、慢箋儲備充足` },
                { id: "h-hyg", label: `生活衛生：大容量黑色垃圾袋（可作斷水臨時馬桶）、衛生紙、濕紙巾` },
                ...(infants > 0 ? [{ id: "h-infant", label: `嬰兒專項：奶粉 ${days} 天份、尿布 ${diapersCount} 片已就緒` }] : []),
                ...(pets > 0 ? [{ id: "h-pet", label: `寵物專項：乾糧罐頭與貓砂排泄用品儲備充足` }] : []),
              ].map((item) => {
                const isDone = isMounted && Boolean(householdChecks[item.id]);
                return (
                  <label
                    key={item.id}
                    className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${
                      isDone
                        ? "border-emerald-300 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/20"
                        : "border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isDone}
                      onChange={() => toggleHouseholdCheck(item.id)}
                      className="mt-1 h-5 w-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 cursor-pointer shrink-0"
                    />
                    <span
                      className={`text-sm font-semibold ${
                        isDone ? "text-emerald-900 dark:text-emerald-300" : "text-slate-800 dark:text-slate-200"
                      }`}
                    >
                      {item.label}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 國防部推薦雙防災 App 下載推薦 */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4 mb-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <span>📱 現在馬上可以做的事：下載雙官方防災 App</span>
            </h3>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
              國防部安全指引強調：平時下載 App 查好離家最近的「防空避難處所」與「物資救濟站」，危機時立刻發揮作用。
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* App 1: 消防防災 e 點通 */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-100 text-xl text-red-600 dark:bg-red-950/60 dark:text-red-400">
                  🚨
                </span>
                <div>
                  <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                    消防防災 e 點通 App
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400">內政部消防署官方維護</p>
                </div>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                可快速查看附近的避難收容處所、救濟站、物資配售站位置，並接收第一手國家級即時天災警報。
              </p>
            </div>
            <div className="flex gap-2 mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
              <a
                href="https://apps.apple.com/tw/app/%E6%B6%88%E9%98%B2%E9%98%B2%E7%81%BDe%E9%BB%9E%E9%80%9A/id1500403641"
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 text-center rounded-lg bg-slate-100 dark:bg-slate-800 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
              >
                 iOS 下載
              </a>
              <a
                href="https://play.google.com/store/apps/details?id=com.nfa.report"
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 text-center rounded-lg bg-slate-100 dark:bg-slate-800 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
              >
                🤖 Android 下載
              </a>
            </div>
          </div>

          {/* App 2: 警政服務 */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-xl text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
                  🛡️
                </span>
                <div>
                  <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                    警政服務 App
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400">內政部警政署官方維護</p>
                </div>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                可精準查詢身邊最近的地下防空避難設施位置，並內建視訊報案、110 聽語障簡訊專線與治安路況示警。
              </p>
            </div>
            <div className="flex gap-2 mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
              <a
                href="https://apps.apple.com/tw/app/%E8%AD%A6%E6%94%BF%E6%9C%8D%E5%8B%99/id544121843"
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 text-center rounded-lg bg-slate-100 dark:bg-slate-800 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
              >
                 iOS 下載
              </a>
              <a
                href="https://play.google.com/store/apps/details?id=tw.gov.npa.callservice"
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 text-center rounded-lg bg-slate-100 dark:bg-slate-800 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
              >
                🤖 Android 下載
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* 國防部指引三大自救急救小錦囊 */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm space-y-4">
        <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <span>💡 國防部指引精華：三大關鍵自救應變常識</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-xl border border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-800/30 p-4">
            <div className="text-xl mb-1">🩹</div>
            <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100 mb-1">大出血止血步驟</h4>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              1. <strong>直接加壓</strong>：以乾淨紗布或衣物直接用力按壓傷口。<br />
              2. <strong>加壓包紮</strong>：用彈性繃帶固定紗布加壓。<br />
              3. <strong>止血帶時機</strong>：四肢噴射狀動脈大出血時，於傷口上方 5-7 公分處使用止血帶並標註上帶時間。
            </p>
          </div>

          <div className="rounded-xl border border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-800/30 p-4">
            <div className="text-xl mb-1">🛡️</div>
            <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100 mb-1">空襲避難標準姿勢</h4>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              聽聞空襲警報或爆炸時：採<strong>跪姿趴下</strong>，身體趴低、胸口微懸空離地（防地面震波破裂臟器）、以雙手大拇指掩耳、其餘四指遮眼、<strong>嘴巴微張</strong>（平衡耳膜氣壓）。
            </p>
          </div>

          <div className="rounded-xl border border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-800/30 p-4">
            <div className="text-xl mb-1">🔍</div>
            <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100 mb-1">假訊息防範三不原則</h4>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              危機時認知作戰頻繁：遵守<strong>不輕信、不轉傳、多方比對</strong>。官方訊息以總統府、行政院、國防部、各縣市災害應變中心或警廣廣播為準，勿傳播來源不明之恐慌影音。
            </p>
          </div>
        </div>
      </div>

      {/* 底部關聯工具直達 */}
      <div className="rounded-2xl border border-indigo-100 dark:border-indigo-900/40 bg-indigo-50/50 dark:bg-indigo-950/20 p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="text-sm text-indigo-950 dark:text-indigo-200">
          <span className="font-bold">📞 遇到緊急狀況需要求救？</span>
          <span className="opacity-80 ml-1">查看全臺緊急專線直撥目錄與各縣市 1999 專用電話。</span>
        </div>
        <Link
          href="/emergency"
          className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 px-4 py-2 text-xs font-bold text-white shadow-sm transition shrink-0"
        >
          前往全臺急用緊急專線速查 →
        </Link>
      </div>
    </div>
  );
}
