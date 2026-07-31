"use client";

import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from "react";
import * as OpenCC from "opencc-js";
import zhTW from "@/locales/zh-TW.json";
import zhCN from "@/locales/zh-CN.json";
import en from "@/locales/en.json";

export type Locale = "zh-TW" | "zh-CN" | "en";

const dictionaries: Record<Locale, Record<string, unknown>> = {
  "zh-TW": zhTW,
  "zh-CN": zhCN,
  en: en,
};

interface LanguageContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, defaultValue?: string) => string;
  tDynamic: (text: string | null | undefined) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [locale, setLocaleState] = useState<Locale>("zh-TW");
  const [isMounted, setIsMounted] = useState(false);

  // Initialize OpenCC converter lazily for Traditional to Simplified Chinese
  const openccConverter = useMemo(() => {
    try {
      return OpenCC.Converter({ from: "tw", to: "cn" });
    } catch {
      return (text: string) => text;
    }
  }, []);

  useEffect(() => {
    setIsMounted(true);
    // 1. Check Cookie or LocalStorage
    const storedLocale = localStorage.getItem("locale") as Locale | null;
    if (storedLocale && ["zh-TW", "zh-CN", "en"].includes(storedLocale)) {
      setLocaleState(storedLocale);
      return;
    }

    const cookieMatch = document.cookie.match(/(?:^|; )locale=([^;]*)/);
    if (cookieMatch && ["zh-TW", "zh-CN", "en"].includes(cookieMatch[1])) {
      setLocaleState(cookieMatch[1] as Locale);
      return;
    }

    // 2. Auto-detect browser language
    const navLang = navigator.language.toLowerCase();
    if (navLang.startsWith("zh-cn") || navLang.startsWith("zh-sg")) {
      setLocaleState("zh-CN");
    } else if (navLang.startsWith("zh")) {
      setLocaleState("zh-TW");
    } else if (navLang.startsWith("en")) {
      setLocaleState("en");
    }
  }, []);

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
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

  const tDynamic = useCallback(
    (text: string | null | undefined): string => {
      if (!text) return "";
      if (locale === "zh-CN") {
        return openccConverter(text);
      }
      return text;
    },
    [locale, openccConverter]
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
