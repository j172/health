"use client";

import Link from "next/link";
import Image from "next/image";
import {
  TOOL_GROUP_META,
  toolsInGroup,
  type ToolCatalogEntry,
} from "@/lib/server/tools/catalog";
import { compareByStrokeOrder } from "@/lib/server/tools/strokeOrder";
import { useLanguage } from "@/app/context/LanguageContext";

const FooterColumn = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => (
  <div>
    <p className="text-xs font-bold tracking-wider text-slate-600 uppercase dark:text-slate-500">
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
      className="text-slate-600 transition-colors hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400"
    >
      {children}
    </Link>
  </li>
);

const FooterExternalLink = ({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) => (
  <li>
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="text-slate-600 transition-colors hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400"
    >
      {children}
    </a>
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
    className="text-slate-600 transition-colors hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400"
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
  // navLabel (issue #256) is the Nav/Footer-only display name — falls back to
  // the SEO title when not set. Never affects the tool page's own metadata.
  const localizeTitle = (item: ToolCatalogEntry) => {
    const zhLabel = item.navLabel ?? item.title;
    return locale === "en" ? t(`catalog.${item.slug}`, zhLabel) : zhLabel;
  };

  const overviewLinks = [
    { href: "/", label: t("nav.home", "首頁") },
    { href: "/news", label: t("footer.newsList", "健康新聞列表") },
    { href: "/privacy", label: t("footer.privacy", "隱私權政策") },
    {
      href: "/llm-info",
      label: t("footer.llmInfo", "Hey AI, learn about j172.tw Healthz"),
    },
  ];

  const civicPartnerLinks = [
    {
      href: "https://g0v.tw/intl/zh-TW/",
      label: t("footer.g0v", "g0v 零時政府 ↗"),
    },
    {
      href: "https://kuma-academy.org/",
      label: t("footer.kumaAcademy", "黑熊學院 ↗"),
    },
    {
      href: "https://cw.yueyuknows.com/",
      label: t("footer.antiCognitiveWarfare", "反認知作戰 ↗"),
    },
    {
      href: "https://metawilo.com/",
      label: t("footer.taiwanCriminals", "台灣罪犯圖鑑 ↗"),
    },
    {
      href: "https://council2026.taiwangogo.tw/",
      label: t("footer.council2026", "2026 政治人物前科 ↗"),
    },
  ];

  // One column per TOOL_GROUP_META entry (issue #256 reclassification) — this
  // mirrors SiteNav.tsx's category resolution exactly (same source array,
  // same stroke-order comparator for both category and tool ordering) so the
  // footer can never drift from the nav dropdowns or from an
  // added/removed/re-grouped tool the way the old 7-hardcoded-columns layout
  // could.
  const categoryColumns = TOOL_GROUP_META.map((meta) => ({
    id: meta.group,
    label: t(meta.labelKey, meta.labelDefault),
    tools: toolsInGroup(meta.group, localizeTitle),
  })).sort((a, b) => compareByStrokeOrder(a.label, b.label));

  return (
    <footer className="mt-20 border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
      <div className="mx-auto max-w-7xl px-4 pt-14 pb-10 sm:px-6 lg:px-8">
        {/* Brand Row */}
        <div className="mb-12 flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-sm">
            <Link href="/" className="flex items-center gap-2.5">
              <Image
                src="/images/logo/j172tw-health-logo.png"
                alt=""
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
            <p className="mt-3 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
              {t(
                "footer.tagline",
                "彙整衛福部、疾管署、中央氣象署等官方機構與各大新聞媒體公開資訊，並提供健康計算、醫療照護、交通能源、防災示警等便民生活工具，協助您一手掌握公衛醫療動態與日常生活資訊。",
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

        {/* Links Grid: 1 static overview column + 9 TOOL_GROUP_META columns
            (issue #256) — two neat rows of 5 at the widest breakpoint. */}
        <div className="grid grid-cols-2 gap-8 border-t border-slate-100 pt-10 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 dark:border-slate-900">
          <FooterColumn label={t("footer.overview", "全站總覽")}>
            {overviewLinks.map((item) => (
              <FooterLink key={item.href} href={item.href}>
                {item.label}
              </FooterLink>
            ))}
          </FooterColumn>

          {categoryColumns.map((category) => (
            <FooterColumn key={category.id} label={category.label}>
              {category.tools.map((tool) => (
                <FooterLink key={tool.slug} href={`/tools/${tool.slug}`}>
                  {localizeTitle(tool)}
                </FooterLink>
              ))}
            </FooterColumn>
          ))}

          <FooterColumn label={t("footer.civicPartners", "公民倡議與友站")}>
            {civicPartnerLinks.map((item) => (
              <FooterExternalLink key={item.href} href={item.href}>
                {item.label}
              </FooterExternalLink>
            ))}
          </FooterColumn>
        </div>

        {/* Bottom copyright */}
        <div className="mt-12 flex flex-col items-start justify-between gap-3 border-t border-slate-100 pt-6 text-[11px] text-slate-600 sm:flex-row sm:items-center dark:border-slate-900">
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
