"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import ToolTypeTabs from "@/components/Tools/ToolTypeTabs";
import { usePagination } from "@/lib/hooks/usePagination";
import DrugSearchPanel from "./DrugSearchPanel";
import DrugShortagesPanel from "./DrugShortagesPanel";
import DrugRecallsPanel from "./DrugRecallsPanel";

/**
 * issue #670 (Track B B-4): the 藥品短缺 list joins the drug lookup as a
 * second tab. The drug search stays the default tab and keeps working exactly
 * as before; `?tab=shortages` deep-links straight to the shortage list.
 * issue #675 (B-5) adds the 回收藥品 list as a third tab (`?tab=recalls`).
 */
export const DRUGS_TAB_KEYS = ["search", "shortages", "recalls"] as const;

export type DrugsTabKey = (typeof DRUGS_TAB_KEYS)[number];

/** Never trusts the raw query string: anything that is not a known tab key falls back to `undefined` (ToolTypeTabs's default, the first tab). */
export function resolveInitialTabKey(requestedTab: string | null): DrugsTabKey | undefined {
  return DRUGS_TAB_KEYS.includes(requestedTab as DrugsTabKey) ? (requestedTab as DrugsTabKey) : undefined;
}

export default function DrugsContent() {
  const searchParams = useSearchParams();
  const { setPage } = usePagination();

  // "查看藥品外觀與成分" on a shortage card jumps to the search tab pre-filled with
  // that license. ToolTypeTabs only reads its initial tab on mount, so a jump
  // remounts it (new `key`) on the search tab, and the search panel starts from
  // the license number.
  const [jump, setJump] = useState<{ id: number; keyword: string } | null>(null);

  const handleViewDrug = (licenseNo: string) => {
    setPage(1);
    setJump((previous) => ({ id: (previous?.id ?? 0) + 1, keyword: licenseNo }));
  };

  const initialKey: DrugsTabKey | undefined = jump ? "search" : resolveInitialTabKey(searchParams.get("tab"));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-2 text-3xl font-bold text-neutral-800 dark:text-slate-100 md:text-4xl">💊 藥品查詢</h1>
        <p className="text-neutral-600 dark:text-slate-300">
          查詢衛福部食藥署核准藥品的許可證字號、中英文品名與外觀特徵（形狀、顏色、刻痕、標註），並可查看食藥署公告的藥品短缺與回收名單。
        </p>
      </div>

      <ToolTypeTabs
        key={jump?.id ?? 0}
        ariaLabel="藥品查詢類型"
        initialKey={initialKey}
        tabs={[
          {
            key: "search",
            label: "藥品查詢",
            icon: "💊",
            content: <DrugSearchPanel initialKeyword={jump?.keyword ?? ""} />,
          },
          {
            key: "shortages",
            label: "藥品短缺",
            icon: "⚠️",
            content: <DrugShortagesPanel onViewDrug={handleViewDrug} />,
          },
          {
            key: "recalls",
            label: "回收藥品",
            icon: "🔄",
            content: <DrugRecallsPanel onViewDrug={handleViewDrug} />,
          },
        ]}
      />
    </div>
  );
}
