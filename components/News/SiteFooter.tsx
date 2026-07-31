import Link from "next/link";
import Image from "next/image";
import { SOURCE_CATEGORIES } from "@/lib/server/news/sourceCategories";
import { TOOL_CATALOG } from "@/lib/server/tools/catalog";

const FooterColumn = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-400">{label}</p>
    <ul className="mt-3 space-y-2">{children}</ul>
  </div>
);

const FooterLink = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <li>
    <Link
      href={href}
      className="text-sm text-neutral-500 transition-colors hover:text-neutral-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
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
    <footer className="mt-20 border-t border-neutral-200 bg-neutral-50">
      <div className="mx-auto max-w-5xl px-4 pt-14 pb-10 sm:px-6 lg:px-8">
        {/* Brand row */}
        <div className="mb-12 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-xs">
            <Link href="/" className="flex items-center gap-2.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
              <Image src="/images/logo/j172tw-health-logo.png" alt="j172tw Health" width={36} height={36} className="h-9 w-9" />
              <span className="text-lg font-bold tracking-tight text-neutral-900">j172tw Health</span>
            </Link>
            <p className="mt-3 text-sm leading-6 text-neutral-500">
              彙整政府機關與健康媒體公開資訊，協助您掌握最新健康動態。
            </p>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="https://www.j172.tw"
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 rounded-full border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:border-primary hover:text-primary"
            >
              j172.tw
              <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
                <path d="M6.22 8.72a.75.75 0 001.06 1.06l5.22-5.22v1.69a.75.75 0 001.5 0v-3.5a.75.75 0 00-.75-.75h-3.5a.75.75 0 000 1.5h1.69L6.22 8.72z" />
                <path d="M3.5 6.75a.75.75 0 00-1.5 0v6c0 .414.336.75.75.75h9.5a.75.75 0 00.75-.75V9.75a.75.75 0 00-1.5 0v2.25H3.5v-5.25z" />
              </svg>
            </a>
          </div>
        </div>

        {/* Link columns */}
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          <FooterColumn label="總覽">
            <FooterLink href="/">首頁</FooterLink>
            <FooterLink href="/news">健康新聞</FooterLink>
            <FooterLink href="/privacy">隱私政策</FooterLink>
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

          <FooterColumn label="健康工具">
            {calculatorTools.map((t) => (
              <FooterLink key={t.slug} href={`/tools/${t.slug}`}>{t.title}</FooterLink>
            ))}
          </FooterColumn>

          {SOURCE_CATEGORIES.map((cat) => (
            <FooterColumn key={cat.key} label={cat.label}>
              {cat.sources.map((s) => (
                <FooterLink key={s.sourceName} href={`/news?source=${encodeURIComponent(s.sourceName)}`}>
                  {s.label}
                </FooterLink>
              ))}
            </FooterColumn>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="mt-12 flex flex-col items-start justify-between gap-2 border-t border-neutral-200 pt-6 text-xs text-neutral-400 sm:flex-row sm:items-center">
          <p>Copyright &copy; {new Date().getFullYear()} j172tw Health. All rights reserved.</p>
          <p>本站內容彙整自政府與媒體公開資訊，以原始來源公告為準。</p>
        </div>
      </div>
    </footer>
  );
}
