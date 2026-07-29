import Link from "next/link";
import { buildBreadcrumbJsonLd, getBaseUrl } from "@/lib/server/news/seo";
import { StabloHeader, StabloFooter } from "@/components/News/StabloNewsLayout";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const LAST_UPDATED = "2026-07-29";

export default function PrivacyPage() {
  const baseUrl = getBaseUrl();
  const breadcrumb = buildBreadcrumbJsonLd([
    { name: "首頁", url: baseUrl },
    { name: "隱私權政策", url: `${baseUrl}/privacy` },
  ]);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      <div className="min-h-screen bg-white text-neutral-800">
        <StabloHeader />

        <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
          <nav className="mb-6 text-sm text-neutral-500" aria-label="breadcrumb">
            <Link href="/" className="hover:text-neutral-900">
              首頁
            </Link>
            <span className="mx-2" aria-hidden="true">
              /
            </span>
            <span aria-current="page">隱私權政策</span>
          </nav>

          <div className="space-y-8 text-sm leading-relaxed text-neutral-700">
            <div>
              <h1 className="mb-2 text-3xl font-bold text-neutral-800 md:text-4xl">隱私權政策</h1>
              <p className="text-neutral-500">最後更新日期：{LAST_UPDATED}</p>
            </div>

            <p>
              j172tw Health（health.j172.tw，以下稱「本站」）重視您的隱私權。本政策說明本站蒐集哪些資料、如何使用，以及您依歐盟《一般資料保護規則》（GDPR）、美國加州《消費者隱私法》與《加州隱私權法》（CCPA/CPRA）、日本《個人資訊保護法》（APPI）、APEC
              跨境隱私保護規則（CBPR）與臺灣《個人資料保護法》所享有的權利。本站以「盡量不蒐集個人資料」為原則設計，以下逐項說明實際資料處理方式。
            </p>

            <section className="space-y-2">
              <h2 className="text-xl font-semibold text-neutral-800">一、本站蒐集哪些資料</h2>
              <ul className="list-inside list-disc space-y-2">
                <li>
                  <span className="font-medium text-neutral-800">地理位置資訊：</span>
                  部分功能（如附近空氣品質／紫外線指數、鄰近醫療院所查詢）會請求您瀏覽器的定位權限。這項授權由您的瀏覽器直接管理，本站僅在您同意後取得當下的經緯度，用於即時查詢「離您最近」的結果，查詢後不會將座標與任何足以識別您身分的資訊一併儲存於本站伺服器資料庫。
                </li>
                <li>
                  <span className="font-medium text-neutral-800">健康小工具的輸入內容：</span>
                  BMI、卡路里、體脂率、血壓、睡眠品質評估等計算機工具，所有輸入數值僅在您的瀏覽器內計算，不會傳送或儲存到本站伺服器。
                </li>
                <li>
                  <span className="font-medium text-neutral-800">一般網站存取紀錄：</span>
                  本站透過 Cloudflare 與主機服務商提供服務，其基礎設施可能依標準作業產生存取紀錄（如 IP 位址、瀏覽器類型、造訪時間），用於資訊安全防護與異常流量偵測，非用於識別特定個人或建立個人輪廓。
                </li>
                <li>
                  <span className="font-medium text-neutral-800">本機儲存（localStorage）：</span>
                  本站僅使用瀏覽器本機儲存記住您是否已閱讀本頁的隱私權提示橫幅，不會用於追蹤或廣告目的。
                </li>
              </ul>
            </section>

            <section className="space-y-2">
              <h2 className="text-xl font-semibold text-neutral-800">二、本站不會做的事</h2>
              <ul className="list-inside list-disc space-y-2">
                <li>不需要註冊帳號即可使用本站所有健康工具與新聞閱讀功能，本站目前未提供任何會員登入機制。</li>
                <li>不使用廣告追蹤 Cookie 或第三方廣告像素（如 Google Analytics、Meta Pixel 等）。</li>
                <li>不會將您的個人資料出售、出租或提供給第三方作行銷用途。</li>
              </ul>
            </section>

            <section className="space-y-2">
              <h2 className="text-xl font-semibold text-neutral-800">三、資料保存期間</h2>
              <p>
                地理位置座標僅用於單次查詢，不會被本站儲存。基礎設施層級的存取紀錄依 Cloudflare 與主機服務商之標準留存政策處理，非由本站另行延長保存或作其他用途。健康新聞、政府開放資料（如醫療院所、藥品、食品業者登錄等）為公開資料之彙整，不屬於個人資料範疇。
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-xl font-semibold text-neutral-800">四、您的權利</h2>
              <p>
                依據 GDPR、CCPA/CPRA、APPI、CBPR 與臺灣個人資料保護法等規範，您可能享有查詢、閱覽、複製、補充或更正個人資料、停止蒐集處理利用、請求刪除，以及拒絕行銷等權利。由於本站設計上盡量不儲存可識別個人身分的資料，多數情況下並無留存資料可供查詢；如您仍希望提出相關請求或有任何疑問，歡迎透過下方聯絡方式與我們聯繫，我們會依合理時間內回覆處理。
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-xl font-semibold text-neutral-800">五、兒童隱私</h2>
              <p>本站內容以一般大眾為對象，並非特別針對兒童設計，亦不會刻意向兒童蒐集個人資料。</p>
            </section>

            <section className="space-y-2">
              <h2 className="text-xl font-semibold text-neutral-800">六、政策更新</h2>
              <p>本政策可能因法規異動或站內功能調整而更新，更新後將標示於本頁上方的「最後更新日期」，請不定期回來查看。</p>
            </section>

            <section className="space-y-2">
              <h2 className="text-xl font-semibold text-neutral-800">七、聯絡我們</h2>
              <p>
                若您對本政策或個人資料處理方式有任何疑問或請求，請透過{" "}
                <a href="https://www.j172.tw" target="_blank" rel="noreferrer noopener" className="text-primary underline hover:no-underline">
                  www.j172.tw
                </a>{" "}
                的聯絡方式與我們聯繫。
              </p>
            </section>
          </div>
        </main>

        <StabloFooter />
      </div>
    </>
  );
}
