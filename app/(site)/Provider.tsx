"use client";

import ScrollToTop from "@/components/ScrollToTop";
import { ThemeProvider } from "next-themes";
import ToasterContext from "../context/ToastContext";

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
            <ToasterContext />
            {children}
            <ScrollToTop />
        </ThemeProvider>
    );
}
