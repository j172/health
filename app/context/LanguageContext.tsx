"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  lookupDictionaryKey,
  isSupportedLocale,
  SUPPORTED_LOCALES,
  type Locale,
} from "@/lib/i18n/dictionary";
import { resolveLocaleSwitchTarget } from "@/lib/i18n/translatedPages";

export type { Locale };
export { SUPPORTED_LOCALES };

interface LanguageContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  /** Looks up a static UI string from the locale dictionaries. */
  t: (key: string, defaultValue?: string) => string;
  /**
   * For dynamic upstream strings (earthquake epicentres, news titles, AQI
   * station names, government institution/address data). Returns the input
   * string directly as Traditional Chinese is the authoritative standard —
   * this is also why the "government data stays in Chinese" rule (issue
   * #485) needs no special-casing here: every dynamic data field already
   * flows through this passthrough.
   */
  tDynamic: (text: string | null | undefined) => string;
  /**
   * True on a /en/, /ja/, /ko/ page whose server-rendered content is the
   * authoritative locale (issue #485) — `locale` can't be changed by
   * localStorage/browser-detection here, and `setLocale` navigates instead
   * of mutating local state.
   */
  isLocaleLocked: boolean;
  /**
   * Set briefly after `setLocale(nonZh)` is called on a page with no
   * translation (locale-locked pages never hit this, since every page
   * reachable under /en//ja//ko/ is by construction translated) — drives
   * the dismissible "this page is only available in Chinese" notice.
   */
  chineseOnlyNoticeLocale: Locale | null;
  dismissChineseOnlyNotice: () => void;
}

export const LanguageContext = createContext<LanguageContextType | undefined>(
  undefined,
);

const resolveStoredLocale = (): Locale => {
  if (typeof window === "undefined") return "zh-TW";
  try {
    // issue #485: the old `?lang=en` query-param mechanism this used to read
    // is retired — those URLs now get a permanent redirect to the real
    // `/en/...` path (see next.config.js's `redirects()`) before this code
    // ever runs, and the broken hreflang entries that pointed at `?lang=`
    // are gone too. Only the user's own stored preference / browser
    // language are left as signals for the *unlocked* (default zh) tree.
    const storedLocale = localStorage.getItem("locale");
    if (isSupportedLocale(storedLocale)) return storedLocale;

    const cookieMatch = document.cookie.match(/(?:^|; )locale=([^;]*)/);
    if (cookieMatch && isSupportedLocale(cookieMatch[1])) return cookieMatch[1];

    // Auto-detect browser language
    const navLang = navigator.language.toLowerCase();
    if (navLang.startsWith("ja")) return "ja";
    if (navLang.startsWith("ko")) return "ko";
    if (navLang.startsWith("en")) return "en";
  } catch {}
  return "zh-TW";
};

export const LanguageProvider: React.FC<{
  children: React.ReactNode;
  /**
   * Set by app/[locale]/layout.tsx (via app/(zh)/(site)/Provider.tsx) for
   * every /en/, /ja/, /ko/ route — issue #485's server-rendered full-page
   * i18n is authoritative there, so this provider must render exactly this
   * locale from the first byte of HTML onward, never the client-detected
   * one. Omitted for the default (zh-TW, unprefixed) tree, which keeps its
   * original client-side detect/store/switch behaviour unchanged.
   */
  forcedLocale?: Locale;
}> = ({ children, forcedLocale }) => {
  const router = useRouter();
  const pathname = usePathname();
  const [userLocale, setUserLocale] = useState<Locale>(forcedLocale ?? "zh-TW");
  // SSR and initial client hydration always render strictly in "zh-TW"
  // (issue #418 — avoids a React 19 Error #418 hydration mismatch). This is
  // harmless for a locked (forced-locale) tree too: `locale` below resolves
  // `forcedLocale` unconditionally via `??`, before `mounted` is ever
  // consulted, so `mounted` staying false there never affects what renders.
  const [mounted, setMounted] = useState(false);
  const [chineseOnlyNoticeLocale, setChineseOnlyNoticeLocale] = useState<Locale | null>(null);

  useEffect(() => {
    if (forcedLocale) return; // locked tree: nothing to detect/upgrade.
    setMounted(true);
    const detected = resolveStoredLocale();
    if (detected !== "zh-TW") {
      setUserLocale(detected);
      try {
        localStorage.setItem("locale", detected);
        document.cookie = `locale=${detected}; path=/; max-age=31536000; SameSite=Lax`;
      } catch {}
    }

    const onStorage = (e: StorageEvent) => {
      if (e.key === "locale" && isSupportedLocale(e.newValue)) {
        setUserLocale(e.newValue);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [forcedLocale]);

  const locale = forcedLocale ?? (mounted ? userLocale : "zh-TW");

  const setLocale = useCallback(
    (newLocale: Locale) => {
      // issue #485: one rule, shared by both the locked and unlocked trees —
      // navigate when the current page has a real translation for
      // `newLocale`, otherwise fall back to the pre-existing chrome-only
      // client-side switch (and surface the "Chinese only" notice when the
      // target isn't zh-TW). `resolveLocaleSwitchTarget` is the single
      // source of truth TRANSLATED_PAGES-gates on, so this can never
      // disagree with the language switcher's own "which pages get a real
      // URL" logic.
      const target = resolveLocaleSwitchTarget(pathname || "/", newLocale);
      if (target !== null) {
        setChineseOnlyNoticeLocale(null);
        router.push(target);
        return;
      }

      if (forcedLocale) {
        // Shouldn't happen: every page reachable under /en//ja//ko/ is, by
        // construction, in TRANSLATED_PAGES, so resolveLocaleSwitchTarget
        // always finds a target for it. Fail safe by staying put.
        return;
      }

      setUserLocale(newLocale);
      try {
        localStorage.setItem("locale", newLocale);
        document.cookie = `locale=${newLocale}; path=/; max-age=31536000; SameSite=Lax`;
      } catch (e) {
        console.error("Failed to save locale preference", e);
      }
      setChineseOnlyNoticeLocale(newLocale === "zh-TW" ? null : newLocale);
    },
    [forcedLocale, pathname, router],
  );

  const dismissChineseOnlyNotice = useCallback(() => setChineseOnlyNoticeLocale(null), []);

  const t = useCallback(
    (key: string, defaultValue?: string): string => lookupDictionaryKey(locale, key, defaultValue),
    [locale],
  );

  const tDynamic = useCallback((text: string | null | undefined): string => {
    return text || "";
  }, []);

  return (
    <LanguageContext.Provider
      value={{
        locale,
        setLocale,
        t,
        tDynamic,
        isLocaleLocked: Boolean(forcedLocale),
        chineseOnlyNoticeLocale,
        dismissChineseOnlyNotice,
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = (): LanguageContextType => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
};
