"use client";

import ScrollToTop from "@/components/ScrollToTop";
import { ThemeProvider } from "next-themes";
import ToasterContext from "../context/ToastContext";
import { LanguageProvider } from "../context/LanguageContext";

export default function ClientLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <ThemeProvider
            enableSystem={false}
            attribute="class"
            defaultTheme="light"
        >
            <LanguageProvider>
                <ToasterContext />
                {children}
                <ScrollToTop />
            </LanguageProvider>
        </ThemeProvider>
    );
}
