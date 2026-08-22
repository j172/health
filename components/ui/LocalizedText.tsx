"use client";

import { useLanguage } from "@/app/context/LanguageContext";

/**
 * Renders a live upstream string through the active locale's dynamic converter.
 *
 * SPECIFICATION.md 4.3 requires news titles, epicentre names and AQI station
 * names to be converted Traditional -> Simplified when the locale is zh-CN.
 * Those strings come from the database, so a dictionary lookup cannot cover them
 * and `tDynamic` has to run at render time.
 *
 * This exists as its own tiny client component so that server-rendered cards
 * (NewsCard, HeroPost, the article headline) can convert one string without the
 * whole card becoming a client component. Components that are already client-side
 * should just call `tDynamic` directly instead of wrapping in this.
 *
 * For zh-TW and en it renders the text unchanged, so it is safe to use anywhere
 * a plain string would go.
 */
export default function LocalizedText({
  children,
}: {
  children: string | null | undefined;
}) {
  const { tDynamic } = useLanguage();
  return <>{tDynamic(children)}</>;
}
