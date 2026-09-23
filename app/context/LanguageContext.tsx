"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import zhTW from "@/locales/zh-TW.json";
import en from "@/locales/en.json";

export type Locale = "zh-TW" | "en";

/** The locales this app ships. Order is display order. */
export const SUPPORTED_LOCALES: Locale[] = ["zh-TW", "en"];

const isSupportedLocale = (value: string | null | undefined): value is Locale =>
  typeof value === "string" && (SUPPORTED_LOCALES as string[]).includes(value);

const dictionaries: Record<Locale, Record<string, unknown>> = {
  "zh-TW": zhTW,
  en: en,
};

interface LanguageContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  /** Looks up a static UI string from the locale dictionaries. */
  t: (key: string, defaultValue?: string) => string;
  /**
   * For dynamic upstream strings (earthquake epicentres, news titles, AQI station names).
   * Returns the input string directly as Traditional Chinese is the authoritative standard.
   */
  tDynamic: (text: string | null | undefined) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(
  undefined,
);

const resolveStoredLocale = (): Locale => {
  if (typeof window === "undefined") return "zh-TW";
  try {
    const storedLocale = localStorage.getItem("locale");
    if (isSupportedLocale(storedLocale)) return storedLocale;

    const cookieMatch = document.cookie.match(/(?:^|; )locale=([^;]*)/);
    if (cookieMatch && isSupportedLocale(cookieMatch[1])) return cookieMatch[1];

    const navLang = navigator.language.toLowerCase();
    if (navLang.startsWith("en")) return "en";
  } catch {}
  return "zh-TW";
};

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [userLocale, setUserLocale] = useState<Locale>("zh-TW");
  const [mounted, setMounted] = useState(false);

  // SSR and initial client hydration always render strictly in "zh-TW".
  // Post-hydration, load stored or browser-detected locale smoothly without
  // ever causing React 19 Error #418 hydration mismatch.
  useEffect(() => {
    setMounted(true);
    const detected = resolveStoredLocale();
    if (detected !== "zh-TW") {
      setUserLocale(detected);
    }

    const onStorage = (e: StorageEvent) => {
      if (e.key === "locale" && isSupportedLocale(e.newValue)) {
        setUserLocale(e.newValue);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const locale = mounted ? userLocale : "zh-TW";

  const setLocale = useCallback((newLocale: Locale) => {
    setUserLocale(newLocale);
    try {
      localStorage.setItem("locale", newLocale);
      document.cookie = `locale=${newLocale}; path=/; max-age=31536000; SameSite=Lax`;
    } catch (e) {
      console.error("Failed to save locale preference", e);
    }
  }, []);

  const t = useCallback(
    (key: string, defaultValue?: string): string => {
      const keys = key.split(".");
      let current: unknown = dictionaries[locale] || dictionaries["zh-TW"];

      for (const k of keys) {
        if (
          current &&
          typeof current === "object" &&
          k in (current as Record<string, unknown>)
        ) {
          current = (current as Record<string, unknown>)[k];
        } else {
          current = undefined;
          break;
        }
      }

      if (typeof current === "string") {
        return current;
      }

      return defaultValue ?? key;
    },
    [locale],
  );

  const tDynamic = useCallback((text: string | null | undefined): string => {
    return text || "";
  }, []);

  return (
    <LanguageContext.Provider value={{ locale, setLocale, t, tDynamic }}>
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
