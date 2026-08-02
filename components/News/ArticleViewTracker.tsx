"use client";

import { useEffect } from "react";

// Fires once per mount; the API route itself de-dupes via a per-article
// cookie, so re-renders/navigations within the same 24h window are no-ops.
export default function ArticleViewTracker({ newsId }: { newsId: number }) {
  useEffect(() => {
    fetch(`/api/news/${newsId}/view`, { method: "POST", keepalive: true }).catch(() => {});
  }, [newsId]);

  return null;
}
