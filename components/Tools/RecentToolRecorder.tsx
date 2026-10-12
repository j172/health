"use client";

import { useEffect } from "react";
import { recordRecentTool } from "@/lib/client/recentTools";

/**
 * Invisible mount-effect: records this tool page's slug into the device-only
 * "最近使用的工具" localStorage list (issue #472). Rendered once from
 * ToolPageShell.tsx so every /tools/<slug> page gets this for free without
 * each page having to remember to add it individually.
 */
export default function RecentToolRecorder({ slug }: { slug: string }) {
  useEffect(() => {
    recordRecentTool(slug);
  }, [slug]);

  return null;
}
