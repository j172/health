import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "../globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "j172tw Health",
  description: "j172tw Health news archive",
  icons: {
    icon: "/images/favicon.ico",
  },
};

export default function NewsRootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-Hant">
      <body className={inter.className}>{children}</body>
    </html>
  );
}