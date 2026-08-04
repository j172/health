import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "../globals.css";
import Provider from "../(site)/Provider";

const inter = Inter({ subsets: ["latin"] });

// Internal ops tooling only — never indexed, never linked from the public site.
export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export default function AdminRootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-Hant">
      <body className={inter.className}>
        <Provider>{children}</Provider>
      </body>
    </html>
  );
}
