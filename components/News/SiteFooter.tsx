"use client";

import Link from "next/link";
import Image from "next/image";
import { buildFooterModel } from "@/lib/server/tools/navModel";
import { useLanguage } from "@/app/context/LanguageContext";
import { appendOutboundUtm } from "@/lib/format/outboundLink";
import { cfImageUrl } from "@/lib/format/cfImageUrl";
import { AFFILIATE_LINK_REL, HAWKHOST_REFERRAL_URL } from "@/lib/constants/affiliateLinks";

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

// 外聯符號（issue #746）：視覺與「主站 j172.tw ↗」一致（連結文字後接空格＋↗），
// 但符號本身對輔助科技隱藏（aria-hidden），改由視覺隱藏（sr-only）的
// 「（另開新視窗）」文字傳達「會在新視窗開啟」。
const ExternalLinkMark = ({ newWindowLabel }: { newWindowLabel: string }) => (
  <>
    {" "}
    <span aria-hidden="true">↗</span>
    <span className="sr-only">{newWindowLabel}</span>
  </>
);

const FooterExternalLink = ({
  href,
  newWindowLabel,
  children,
}: {
  href: string;
  newWindowLabel: string;
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
      <ExternalLinkMark newWindowLabel={newWindowLabel} />
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

// Maps buildFooterModel()'s stable link ids (the "關於本站" overview block's
// `id || "home"`, and the "公民倡議與友站" block's link hostname — see
// navModel.ts's BuildFooterModelOptions.translateLinkLabel doc comment) to
// this site's existing footer.*/nav.* i18n keys, so non-zh-TW locales keep
// getting the exact same translated strings they did before this ticket
// wired the model in. No new i18n keys are introduced here — every key below
// already existed pre-#461.
const FOOTER_LINK_LABEL_KEYS: Record<string, string> = {
  home: "nav.home",
  news: "footer.newsList",
  privacy: "footer.privacy",
  accessibility: "footer.accessibility",
  "llm-info": "footer.llmInfo",
  "g0v.tw": "footer.g0v",
  "kuma-academy.org": "footer.kumaAcademy",
  "cw.yueyuknows.com": "footer.antiCognitiveWarfare",
  "metawilo.com": "footer.taiwanCriminals",
  "www.sports.gov.tw": "footer.sportsCoach",
  "ma.mohw.gov.tw": "footer.mohwVio",
  "council2026.taiwangogo.tw": "footer.council2026",
};

export default function SiteFooter() {
  const { t, locale } = useLanguage();
  const newWindowLabel = t("footer.opensInNewWindow", "（另開新視窗）");

  // Issue #461: wires the already-built (issue #443) buildFooterModel() in,
  // replacing the old hand-rolled 1 overview + one column per catalog tool
  // group (each listing every individual tool in that group) + 1
  // civic-partners = 9-column footer with the exact 4-block structure the
  // issue asks for: 關於本站／工具分類（7 分類連結，非個別工具）／生活情境
  // （5 guide 連結）／公民倡議與友站（既有 7 個連結，由 buildFooterModel 以
  // appendOutboundUtm 附加 UTM，這裡不重複包裝）。
  const footerModel = buildFooterModel({
    locale,
    translateGroupLabel: (meta) => t(meta.labelKey, meta.labelDefault),
    translateLinkLabel: (id, zhLabel) => {
      const key = FOOTER_LINK_LABEL_KEYS[id];
      return key ? t(key, zhLabel) : zhLabel;
    },
  });

  return (
    <footer
      id="footer-info"
      className="mt-20 border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950"
    >
      <div className="mx-auto max-w-7xl px-4 pt-14 pb-10 sm:px-6 lg:px-8">
        <a
          href="#footer-info"
          id="accesskey-z"
          accessKey="Z"
          title="下方資訊區 (Alt+Z)"
          className="sr-only"
        >
          ::: 下方資訊區
        </a>
        {/* Brand Row */}
        <div className="mb-12 flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-sm">
            <Link href="/" className="flex items-center gap-2.5">
              <Image
                // issue #482: served via Cloudflare's edge Image
                // Transformations (resized + format=auto) instead of the
                // 256x256 PNG original; onerror=redirect falls back to the
                // original if the zone-level feature isn't enabled yet.
                src={cfImageUrl("/images/logo/j172tw-health-logo.png", {
                  width: 72,
                  format: "auto",
                })}
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
                "彙整衛福部、疾管署、中央氣象署等官方機構與各大新聞媒體公開資訊，並提供長照、兒少、健康計算、醫療照護、交通能源、防災示警、遠離詐騙與成癮等便民生活工具，協助您一手掌握公衛醫療動態與日常生活資訊。",
              )}
            </p>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <SocialIcon
                href={appendOutboundUtm("https://www.instagram.com/j172twhealths/", {
                  medium: "footer_social",
                  campaign: "social_follow",
                  content: "instagram",
                })}
                label="Instagram"
              >
                <InstagramIcon />
              </SocialIcon>
              <SocialIcon
                href={appendOutboundUtm("https://www.facebook.com/profile.php?id=61592584239566", {
                  medium: "footer_social",
                  campaign: "social_follow",
                  content: "facebook",
                })}
                label="Facebook"
              >
                <FacebookIcon />
              </SocialIcon>
              <SocialIcon
                href={appendOutboundUtm("https://www.threads.com/@j172twhealths", {
                  medium: "footer_social",
                  campaign: "social_follow",
                  content: "threads",
                })}
                label="Threads"
              >
                <ThreadsIcon />
              </SocialIcon>
            </div>

            <a
              href={appendOutboundUtm("https://www.j172.tw", {
                medium: "cross_promo",
                campaign: "main_site",
                content: "footer",
              })}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-bold text-slate-700 transition-colors hover:border-indigo-500 hover:text-indigo-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:text-indigo-400"
            >
              {t("footer.mainSite", "主站 j172.tw")} ↗
            </a>
          </div>
        </div>

        {/* Links Grid: exactly 4 columns from buildFooterModel() (issue #461,
            replacing the old 1 static overview + one-column-per-catalog-group
            "list every tool again" layout) — 關於本站／工具分類（7 分類，非
            個別工具）／生活情境（5 guides）／公民倡議與友站（既有 7 連結）。 */}
        <div className="grid grid-cols-2 gap-8 border-t border-slate-100 pt-10 sm:grid-cols-4 dark:border-slate-900">
          {footerModel.map((block) => {
            // The civic-partners block's links are external (and already
            // UTM-wrapped by buildFooterModel via appendOutboundUtm — never
            // re-wrap them here); every other block links within this site.
            const isExternal = block.id === "civic-partners";
            // footer.civicPartners already existed pre-#461 with the exact
            // same default text buildFooterModel returns for this block, so
            // reusing it here keeps this one header's cross-locale
            // translation behavior unchanged. The other 3 block labels
            // ("關於本站"/"工具分類"/"生活情境") have no pre-existing i18n key
            // of their own (buildFooterModel doesn't expose a translator for
            // block-level labels, only for the links within them — out of
            // scope for this ticket to add), so they render as-is.
            const headerLabel =
              block.id === "civic-partners"
                ? t("footer.civicPartners", block.label)
                : block.id === "overview"
                  ? t("footer.aboutSite", block.label)
                  : block.id === "categories"
                    ? t("footer.toolCategories", block.label)
                    : block.id === "guides"
                      ? t("footer.lifeGuides", block.label)
                      : block.label;
            return (
              <FooterColumn key={block.id} label={headerLabel}>
                {block.links.map((link) =>
                  isExternal ? (
                    <FooterExternalLink
                      key={link.href}
                      href={link.href}
                      newWindowLabel={newWindowLabel}
                    >
                      {link.label}
                    </FooterExternalLink>
                  ) : (
                    <FooterLink key={link.href} href={link.href}>
                      {link.label}
                    </FooterLink>
                  ),
                )}
              </FooterColumn>
            );
          })}
        </div>

        {/* HawkHost 推薦連結（issue #746）：獨立於「公民夥伴」欄、位於版權列上方。
            商業推薦必須明確揭露「推薦連結」與「可能獲得回饋」，揭露文字就在連結內，
            讓輔助科技朗讀連結時也一併讀到。href 使用原始網址常數，刻意不經過
            appendOutboundUtm()（避免污染聯盟追蹤），詳見 lib/constants/affiliateLinks.ts。 */}
        <p className="mt-10 text-[11px] text-slate-600 dark:text-slate-500">
          <a
            href={HAWKHOST_REFERRAL_URL}
            target="_blank"
            rel={AFFILIATE_LINK_REL}
            className="underline underline-offset-2 transition-colors hover:text-indigo-600 dark:hover:text-indigo-400"
          >
            {t(
              "footer.hostingReferral",
              "本站架設於 HawkHost（推薦連結，若經此註冊本站可能獲得回饋）",
            )}
            <ExternalLinkMark newWindowLabel={newWindowLabel} />
          </a>
        </p>

        {/* Bottom copyright */}
        <div className="mt-6 flex flex-col items-start justify-between gap-3 border-t border-slate-100 pt-6 text-[11px] text-slate-600 sm:flex-row sm:items-center dark:border-slate-900">
          <p suppressHydrationWarning>
            &copy; {new Date().getFullYear()} j172tw Healthz.{" "}
            {t("footer.license", "程式碼採 MIT 授權 · 結構化資料採 CC0-1.0 釋出")}
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
