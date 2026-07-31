import Link from "next/link";
import Image from "next/image";
import { SOURCE_CATEGORIES } from "@/lib/server/news/sourceCategories";
import { TOOL_CATALOG } from "@/lib/server/tools/catalog";

const FooterColumn = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <p className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{label}</p>
    <ul className="mt-3 space-y-2 text-xs font-medium">{children}</ul>
  </div>
);

const FooterLink = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <li>
    <Link
      href={href}
      className="text-slate-500 transition-colors hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400"
    >
      {children}
    </Link>
  </li>
);

export default function SiteFooter() {
  const calculatorTools = TOOL_CATALOG.filter((t) => t.group === "calculator");
  const facilityTools = TOOL_CATALOG.filter((t) => t.group === "facility");
  const ltcTools = TOOL_CATALOG.filter((t) => t.group === "ltc");
  const foodTools = TOOL_CATALOG.filter((t) => t.group === "food");

  return (
    <footer className="mt-20 border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
      <div className="mx-auto max-w-7xl px-4 pt-14 pb-10 sm:px-6 lg:px-8">
        {/* Brand Row */}
        <div className="mb-12 flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-sm">
            <Link href="/" className="flex items-center gap-2.5">
              <Image
                src="/images/logo/j172tw-health-logo.png"
                alt="j172tw Health"
                width={36}
                height={36}
                className="h-9 w-9 rounded-xl shadow-xs"
              />
              <span className="text-lg font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
                j172tw <span className="text-indigo-600 dark:text-indigo-400">Health</span>
              </span>
            </Link>
            <p className="mt-3 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              彙整衛福部、疾管署、食藥署及各大健康新聞媒體公開資訊，協助您一手掌握全台最新公衛醫療動態與空氣品質。
            </p>
          </div>

          <div>
            <a
              href="https://www.j172.tw"
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-bold text-slate-700 transition-colors hover:border-indigo-500 hover:text-indigo-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:text-indigo-400"
            >
              主站 j172.tw ↗
            </a>
          </div>
        </div>

        {/* Links Grid */}
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 border-t border-slate-100 pt-10 dark:border-slate-900">
          <FooterColumn label="全站總覽">
            <FooterLink href="/">首頁</FooterLink>
            <FooterLink href="/news">健康新聞列表</FooterLink>
            <FooterLink href="/tools/aqi">即時空氣品質 (AQI)</FooterLink>
            <FooterLink href="/privacy">隱私政策與宣告</FooterLink>
          </FooterColumn>

          <FooterColumn label="醫療院所">
            {facilityTools.map((t) => (
              <FooterLink key={t.slug} href={`/tools/${t.slug}`}>{t.title}</FooterLink>
            ))}
          </FooterColumn>

          <FooterColumn label="長照機構">
            {ltcTools.map((t) => (
              <FooterLink key={t.slug} href={`/tools/${t.slug}`}>{t.title}</FooterLink>
            ))}
          </FooterColumn>

          <FooterColumn label="食品營養">
            {foodTools.map((t) => (
              <FooterLink key={t.slug} href={`/tools/${t.slug}`}>{t.title}</FooterLink>
            ))}
          </FooterColumn>

          <FooterColumn label="健康算盤與工具">
            {calculatorTools.map((t) => (
              <FooterLink key={t.slug} href={`/tools/${t.slug}`}>{t.title}</FooterLink>
            ))}
          </FooterColumn>
        </div>

        {/* Bottom copyright */}
        <div className="mt-12 flex flex-col items-start justify-between gap-3 border-t border-slate-100 pt-6 text-[11px] text-slate-400 dark:border-slate-900 sm:flex-row sm:items-center">
          <p>&copy; {new Date().getFullYear()} j172tw Health. 版權所有。</p>
          <p>本站資料彙整自政府與公衛機構公開 RSS 及數據 API，內容以原始公告單位為準。</p>
        </div>
      </div>
    </footer>
  );
}
