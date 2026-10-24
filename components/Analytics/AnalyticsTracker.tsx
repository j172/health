"use client";

import { useEffect, useRef, Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { trackPageView } from "@/lib/client/analytics";

function AnalyticsTrackerInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isFirstRender = useRef(true);

  useEffect(() => {
    // Initial page load is handled by GoogleTag's synchronous config script.
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    const query = searchParams?.toString();
    const fullPath = query ? `${pathname}?${query}` : pathname;
    trackPageView(fullPath);
  }, [pathname, searchParams]);

  return null;
}

export default function AnalyticsTracker() {
  return (
    <Suspense fallback={null}>
      <AnalyticsTrackerInner />
    </Suspense>
  );
}
