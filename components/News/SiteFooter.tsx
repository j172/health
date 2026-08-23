"use client";

import Link from "next/link";
import Image from "next/image";
import { toolsInGroup } from "@/lib/server/tools/catalog";
import { useLanguage } from "@/app/context/LanguageContext";

const FooterColumn = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => (
  <div>
    <p className="text-xs font-bold tracking-wider text-slate-400 uppercase dark:text-slate-500">
      {label}
    </p>
    <ul className="mt-3 space-y-2 text-xs font-medium">{children}</ul>
  </div>
);

const FooterLink = ({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) => (
  <li>
    <Link
      href={href}
      className="text-slate-500 transition-colors hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400"
    >
      {children}
    </Link>
  </li>
);

// Inline SVG (currentColor) rather than next/image + public/images/icon/*.svg
// files: these need the same hover/dark-mode color transition as FooterLink,
// which requires the SVG to inherit color from its wrapping <a>'s Tailwind
// classes — an <img>/next/image reference can't do that (external SVG
// documents don't inherit page CSS), so inline is the only way to keep this
// exact treatment consistent.
const SocialIcon = ({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: React.ReactNode;
}) => (
  <a
    href={href}
    target="_blank"
    rel="noreferrer noopener"
    aria-label={label}
    className="text-slate-500 transition-colors hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400"
  >
    {children}
  </a>
);

const InstagramIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="3" y="3" width="18" height="18" rx="5" />
    <circle cx="12" cy="12" r="4.2" />
    <circle cx="17.2" cy="6.8" r="0.9" fill="currentColor" stroke="none" />
  </svg>
);

const FacebookIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="9" />
    <path d="M14.3 8.4h-1.6c-1 0-1.6.6-1.6 1.6v1.6h3.1l-.4 2.3h-2.7V21" />
  </svg>
);

const ThreadsIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M12 3c-4.5 0-7 2.7-7 7.2 0 3.6 1.7 6.1 4.4 7.4.8.4 1.7-.1 1.7-1v-.2c0-.6-.4-1-.9-1.3-1.6-.9-2.5-2.5-2.5-4.6 0-3.1 1.6-4.7 4.1-4.9 2.6-.2 4.4 1.1 4.6 3.3.1 1.4-.4 2.4-1.5 2.7-.8.2-1.4-.1-1.6-.8-.1-.4 0-.8.3-1.2.4-.5.3-1.1-.2-1.4-.6-.4-1.3-.1-1.7.5-.6 1-.7 2.2-.2 3.3.6 1.4 2 2.1 3.6 1.7 1.9-.5 2.9-2.2 2.7-4.4C20.6 6 17.7 3 12 3z" />
  </svg>
);

export default function SiteFooter() {
  const { t, locale } = useLanguage();
  const localizeTitle = (item: { slug: string; title: string }) =>
    locale === "en" ? t(`catalog.${item.slug}`, item.title) : item.title;

  const overviewLinks = [
    { href: "/", label: t("nav.home", "首頁") },
    { href: "/news", label: t("footer.newsList", "健康新聞列表") },
    { href: "/privacy", label: t("footer.privacy", "隱私權政策") },
  ].sort((a, b) =>
    a.label.localeCompare(b.label, "zh-Hant", { numeric: true }),
  );

  // One helper, one comparator (SPECIFICATION.md 5.1). Sorting on localizeTitle
  // rather than tool.title is what keeps the English footer in order — it used to
  // sort by the Traditional Chinese title while rendering the English one.
  const calculatorTools = toolsInGroup("calculator", localizeTitle);
  const facilityTools = toolsInGroup("facility", localizeTitle);
  const ltcTools = toolsInGroup("ltc", localizeTitle);
  const disabilityTools = toolsInGroup("disability", localizeTitle);
  const childWelfareTools = toolsInGroup("child-welfare", localizeTitle);
  const publicFacilityTools = toolsInGroup("public-facility", localizeTitle);
  const weatherTools = toolsInGroup("weather", localizeTitle);
  const foodTools = toolsInGroup("food", localizeTitle);

  return (
    <footer className="mt-20 border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
      <div className="mx-auto max-w-7xl px-4 pt-14 pb-10 sm:px-6 lg:px-8">
        {/* Brand Row */}
        <div className="mb-12 flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-sm">
            <Link href="/" className="flex items-center gap-2.5">
              <Image
                src="/images/logo/j172tw-health-logo.png"
                alt="j172tw Healthz"
                width={36}
                height={36}
                className="h-9 w-9 rounded-xl shadow-xs"
              />
              <span className="text-lg font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
                j172tw{" "}
                <span className="text-indigo-600 dark:text-indigo-400">
                  Healthz
                </span>
              </span>
            </Link>
            <p className="mt-3 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              {t(
                "footer.tagline",
                "彙整衛福部、疾管署、食藥署及各大健康新聞媒體公開資訊，協助您一手掌握全台最新公衛醫療動態與空氣品質。",
              )}
            </p>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <SocialIcon
                href="https://www.instagram.com/j172twhealths/"
                label="Instagram"
              >
                <InstagramIcon />
              </SocialIcon>
              <SocialIcon
                href="https://www.facebook.com/profile.php?id=61592584239566"
                label="Facebook"
              >
                <FacebookIcon />
              </SocialIcon>
              <SocialIcon
                href="https://www.threads.com/@j172twhealths"
                label="Threads"
              >
                <ThreadsIcon />
              </SocialIcon>
            </div>

            <a
              href="https://www.j172.tw"
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-bold text-slate-700 transition-colors hover:border-indigo-500 hover:text-indigo-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:text-indigo-400"
            >
              {t("footer.mainSite", "主站 j172.tw")} ↗
            </a>
          </div>
        </div>

        {/* Links Grid */}
        <div className="grid grid-cols-2 gap-8 border-t border-slate-100 pt-10 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-9 dark:border-slate-900">
          <FooterColumn label={t("footer.overview", "全站總覽")}>
            {overviewLinks.map((item) => (
              <FooterLink key={item.href} href={item.href}>
                {item.label}
              </FooterLink>
            ))}
          </FooterColumn>

          <FooterColumn label={t("nav.facilities", "醫療院所")}>
            {facilityTools.map((tool) => (
              <FooterLink key={tool.slug} href={`/tools/${tool.slug}`}>
                {localizeTitle(tool)}
              </FooterLink>
            ))}
          </FooterColumn>

          <FooterColumn label={t("nav.ltc", "長照機構")}>
            {ltcTools.map((tool) => (
              <FooterLink key={tool.slug} href={`/tools/${tool.slug}`}>
                {localizeTitle(tool)}
              </FooterLink>
            ))}
          </FooterColumn>

          <FooterColumn label={t("nav.disability", "身心障礙")}>
            {disabilityTools.map((tool) => (
              <FooterLink key={tool.slug} href={`/tools/${tool.slug}`}>
                {localizeTitle(tool)}
              </FooterLink>
            ))}
          </FooterColumn>

          <FooterColumn label={t("nav.childWelfare", "兒少福利")}>
            {childWelfareTools.map((tool) => (
              <FooterLink key={tool.slug} href={`/tools/${tool.slug}`}>
                {localizeTitle(tool)}
              </FooterLink>
            ))}
          </FooterColumn>

          <FooterColumn label={t("nav.publicFacilities", "公共設施")}>
            {publicFacilityTools.map((tool) => (
              <FooterLink key={tool.slug} href={`/tools/${tool.slug}`}>
                {localizeTitle(tool)}
              </FooterLink>
            ))}
          </FooterColumn>

          <FooterColumn label={t("nav.weather", "氣象觀測")}>
            {weatherTools.map((tool) => (
              <FooterLink key={tool.slug} href={`/tools/${tool.slug}`}>
                {localizeTitle(tool)}
              </FooterLink>
            ))}
          </FooterColumn>

          <FooterColumn label={t("footer.food", "食品營養")}>
            {foodTools.map((tool) => (
              <FooterLink key={tool.slug} href={`/tools/${tool.slug}`}>
                {localizeTitle(tool)}
              </FooterLink>
            ))}
          </FooterColumn>

          <FooterColumn label={t("footer.calculatorTools", "健康算盤與工具")}>
            {calculatorTools.map((tool) => (
              <FooterLink key={tool.slug} href={`/tools/${tool.slug}`}>
                {localizeTitle(tool)}
              </FooterLink>
            ))}
          </FooterColumn>
        </div>

        {/* Bottom copyright */}
        <div className="mt-12 flex flex-col items-start justify-between gap-3 border-t border-slate-100 pt-6 text-[11px] text-slate-400 sm:flex-row sm:items-center dark:border-slate-900">
          <p suppressHydrationWarning>
            &copy; {new Date().getFullYear()} j172tw Healthz.{" "}
            {t("footer.rights", "版權所有。")}
          </p>
          <p>
            {t(
              "footer.disclaimer",
              "本站資料彙整自政府與公衛機構公開 RSS 及數據 API，內容以原始公告單位為準。",
            )}
          </p>
        </div>
      </div>
    </footer>
  );
}
