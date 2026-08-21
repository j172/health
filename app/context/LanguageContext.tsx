"use client";

import React, { createContext, useContext, useState, useCallback, useSyncExternalStore } from "react";
import zhTW from "@/locales/zh-TW.json";
import en from "@/locales/en.json";

export type Locale = "zh-TW" | "en";

const dictionaries: Record<Locale, Record<string, unknown>> = {
  "zh-TW": zhTW,
  en: en,
};

interface LanguageContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, defaultValue?: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const getClientLocale = (): Locale => {
  if (typeof window === "undefined") return "zh-TW";
  try {
    const storedLocale = localStorage.getItem("locale") as Locale | null;
    if (storedLocale && ["zh-TW", "en"].includes(storedLocale)) {
      return storedLocale;
    }

    const cookieMatch = document.cookie.match(/(?:^|; )locale=([^;]*)/);
    if (cookieMatch && ["zh-TW", "en"].includes(cookieMatch[1])) {
      return cookieMatch[1] as Locale;
    }

    const navLang = navigator.language.toLowerCase();
    if (navLang.startsWith("en")) {
      return "en";
    }
  } catch {}
  return "zh-TW";
};

const subscribeToStorage = (callback: () => void) => {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
};

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [userLocale, setUserLocale] = useState<Locale | null>(null);
  const detectedLocale = useSyncExternalStore(
    subscribeToStorage,
    getClientLocale,
    () => "zh-TW" as Locale,
  );
  const locale = userLocale ?? detectedLocale;

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
        if (current && typeof current === "object" && k in (current as Record<string, unknown>)) {
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
    [locale]
  );

  return (
    <LanguageContext.Provider value={{ locale, setLocale, t }}>
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
