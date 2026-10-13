"use client";

import ScrollToTop from "@/components/ScrollToTop";
import { ThemeProvider } from "next-themes";
import ToasterContext from "@/app/context/ToastContext";
import { LanguageProvider, type Locale } from "@/app/context/LanguageContext";
import ChineseOnlyNoticeToast from "@/components/Header/ChineseOnlyNoticeToast";

export default function ClientLayout({
    children,
    // issue #485: when set, this subtree is one of the /en/, /ja/, /ko/
    // locale-prefixed routes (app/[locale]/layout.tsx) — the language
    // context must render exactly this locale from the server HTML onward
    // (no zh-TW SSR flash, no localStorage/cookie/browser auto-detect
    // override) because the URL itself is authoritative. Omitted (the
    // default, unprefixed zh-TW tree) preserves the original client-side
    // detect/store/switch behaviour untouched.
    forcedLocale,
}: {
    children: React.ReactNode;
    forcedLocale?: Locale;
}) {
    return (
        <ThemeProvider
            enableSystem={false}
            attribute="class"
            defaultTheme="light"
        >
            <LanguageProvider forcedLocale={forcedLocale}>
                <ToasterContext />
                {children}
                <ScrollToTop />
                <ChineseOnlyNoticeToast />
            </LanguageProvider>
        </ThemeProvider>
    );
}
