"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useSyncExternalStore,
} from "react";
import zhTW from "@/locales/zh-TW.json";
import zhCN from "@/locales/zh-CN.json";
import en from "@/locales/en.json";

export type Locale = "zh-TW" | "zh-CN" | "en";

/** The locales this app ships, per SPECIFICATION.md 4.1. Order is display order. */
export const SUPPORTED_LOCALES: Locale[] = ["zh-TW", "zh-CN", "en"];

const isSupportedLocale = (value: string | null | undefined): value is Locale =>
  typeof value === "string" && (SUPPORTED_LOCALES as string[]).includes(value);

const dictionaries: Record<Locale, Record<string, unknown>> = {
  "zh-TW": zhTW,
  "zh-CN": zhCN,
  en: en,
};

interface LanguageContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  /** Looks up a static UI string from the locale dictionaries. */
  t: (key: string, defaultValue?: string) => string;
  /**
   * Converts a *live* string that came from an upstream API — earthquake
   * epicentres, news titles, AQI station names — which the dictionaries cannot
   * cover because the text is not known ahead of time.
   *
   * Traditional -> Simplified when the locale is zh-CN, identity otherwise.
   * Returns the input unchanged until the converter has loaded, so nothing ever
   * renders blank while the dictionary is in flight (SPECIFICATION.md 4.3).
   */
  tDynamic: (text: string | null | undefined) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(
  undefined,
);

const getClientLocale = (): Locale => {
  if (typeof window === "undefined") return "zh-TW";
  try {
    const storedLocale = localStorage.getItem("locale");
    if (isSupportedLocale(storedLocale)) return storedLocale;

    const cookieMatch = document.cookie.match(/(?:^|; )locale=([^;]*)/);
    if (cookieMatch && isSupportedLocale(cookieMatch[1])) return cookieMatch[1];

    const navLang = navigator.language.toLowerCase();
    if (navLang.startsWith("en")) return "en";
    // zh-Hans, zh-CN, zh-SG all want Simplified; everything else zh stays Traditional.
    if (/^zh-(hans|cn|sg)/.test(navLang)) return "zh-CN";
  } catch {}
  return "zh-TW";
};

const subscribeToStorage = (callback: () => void) => {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
};

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [userLocale, setUserLocale] = useState<Locale | null>(null);
  const detectedLocale = useSyncExternalStore(
    subscribeToStorage,
    getClientLocale,
    () => "zh-TW" as Locale,
  );
  const locale = userLocale ?? detectedLocale;

  // opencc-js carries its own conversion dictionaries, so it is imported only
  // when a reader actually selects Simplified rather than shipped to everyone.
  const [convert, setConvert] = useState<((text: string) => string) | null>(
    null,
  );

  useEffect(() => {
    // No setState on this path: tDynamic already gates on the locale, so a
    // converter left in state after switching away is inert. Clearing it here
    // would be a synchronous setState inside an effect for no behavioural gain.
    if (locale !== "zh-CN") return;
    if (convert) return;

    let cancelled = false;
    import("opencc-js")
      .then((OpenCC) => {
        if (cancelled) return;
        const converter = OpenCC.Converter({ from: "tw", to: "cn" });
        // Stored via updater form: React would otherwise call a bare function
        // argument as a state initializer.
        setConvert(() => converter);
      })
      .catch((error) => {
        // Falling back to Traditional text is the right failure mode — readable,
        // just not converted.
        console.error(
          "Failed to load the Traditional-to-Simplified converter",
          error,
        );
      });

    return () => {
      cancelled = true;
    };
  }, [locale, convert]);

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

  const tDynamic = useCallback(
    (text: string | null | undefined): string => {
      if (!text) return "";
      if (locale !== "zh-CN" || !convert) return text;
      return convert(text);
    },
    [locale, convert],
  );

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
